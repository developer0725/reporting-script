import { promises as fs } from 'fs';
import path from 'path';
import { isMainThread, parentPort } from 'worker_threads';

import * as Comlink from 'comlink';
import nodeEndpoint from 'comlink/dist/umd/node-adapter';
import { group } from 'd3-array';
import _ from 'lodash';
import { DateTime } from 'luxon';

import { ProjectKeys } from '../helpers/prepare';
import { RemoteTask, ProgressBarEvent } from '../helpers/tasktree';
import '../helpers/tasktree'; // patch comlink and tasktree-cli
import getReport, {TimeSpan} from '../helpers/get-ssm-report';
import { getSsmData, setGlobals } from '../helpers/global-options';
import wrapProjectHandler from '../helpers/project-handler';

import { CombinedSyncOptions as Options } from '.';
import transformRecords, { InvalidSyncRecord, TransformResult } from './transform-records';
import diff from './diff-worklog';

async function saveInvalid(key: string, records: InvalidSyncRecord[], output: string, started: DateTime) {
  function replacer(key: string, value: any) {
    if (key === 'error') {
      return (value as Error).message;
    } else {
      return value;
    }
  }
  const data = JSON.stringify(records, replacer, 2);

  const name = `${key} Invalid Records`;
  const filename = `sync_${_.kebabCase(name)}_${started.toISODate()}.json`;
  await fs.writeFile(path.join(output, filename), data);
}

async function saveEvents(key: string, events: ProgressBarEvent[], output: string, started: DateTime) {
  const grouped = group(events, (event) => event.type);

  const summary = grouped.get('log') ?? [];
  if (summary.length > 0) {
    const data = summary.map((line) => line.text).join('\n');
    const filename = `sync_${_.kebabCase(key)}-summary_${started.toISODate()}.txt`;
    await fs.writeFile(path.join(output, filename), data);
  }

  const warnings = grouped.get('warning') ?? [];
  if (warnings.length > 0) {
    const data = warnings.map((line) => line.text).join('\n');
    const filename = `sync_${_.kebabCase(key)}-warnings_${started.toISODate()}.txt`;
    await fs.writeFile(path.join(output, filename), data);
  }

  const log = grouped.get('progress') ?? [];
  if (log.length > 0) {
    const data = log.map((line) => line.text).join('\n');
    const filename = `sync_${_.kebabCase(key)}-log_${started.toISODate()}.txt`;
    await fs.writeFile(path.join(output, filename), data);
  }
}

async function project(options: Options, projectKeys: ProjectKeys, key: string, task: RemoteTask) {
  setGlobals(options);

  if (!(key in projectKeys.ssm)) {
    await task.markFailed('This project does not exist in Screenshot Monitor');
    return;
  }

  if (!projectKeys.jira.includes(key)) {
    await task.markFailed('This project does not exist in Jira Cloud');
    return;
  }

  const ssmData = await getSsmData();
  const started = DateTime.fromSeconds(ssmData.now).set({hour: 0, minute: 0, second: 0});
  const time: TimeSpan = options.days > 0 ? {
    from: started.minus({ days: options.days }),
    to: started.plus({ days: 1 })
  } : options.time.toLocaleLowerCase() as TimeSpan;

  const ssm = await task
    .add('Fetching report from Screenshot Monitor')
    .then((task) => task.wrap(getReport([projectKeys.ssm[key]],[], time)));

  if (ssm.length === 0) {
    await task.warn('No records for this project are present in Screenshot Monitor');
    await task.skip();
    return;
  }

  const transform = await task.add('Transforming report records for comparison against Jira Cloud worklogs');
  const transformResult = await transform.wrap<TransformResult>(transformRecords(key, ssm), ssm.length, 'records');
  if (!transformResult.success) {
    return;
  }

  const { valid, invalid } = transformResult.value;
  if (invalid.length > 0) {
    await task
      .add('Saving invalid records to disk')
      .then((task) => task.wrap(saveInvalid(key, invalid, options.output, started)));
  }

  const grouped = group(valid, (record) => record.note.key);
  const { events } = await task
    .add('Comparing records against worklogs and applying changes to Jira Cloud')
    .then((task) => task.wrap(diff(grouped, time), valid.length, 'records'));

  await task
    .add('Saving sync logs to disk')
    .then((task) => task.wrap(saveEvents(key, events, options.output, started)));
}

if (!isMainThread) {
  Comlink.expose(wrapProjectHandler(project), nodeEndpoint(parentPort!));
}
