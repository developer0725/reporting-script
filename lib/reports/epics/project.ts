import { promises as fs } from 'fs';
import path from 'path';
import { isMainThread, parentPort } from 'worker_threads';

import * as Comlink from 'comlink';
import nodeEndpoint from 'comlink/dist/umd/node-adapter';
import _ from 'lodash';
import { DateTime } from 'luxon';
import { TaskStatus } from 'tasktree-cli/lib/Task';

import { ProjectKeys } from '../../helpers/prepare';
import { RemoteTask } from '../../helpers/tasktree';
import '../../helpers/tasktree'; // patch comlink and tasktree-cli
import { createPage, addAttachment, updatePage } from '../../helpers/confluence';
import { setGlobals } from '../../helpers/global-options';
import wrapProjectHandler from '../../helpers/project-handler';

import { CombinedEpicsOptions as Options } from '.';
import { getEpics } from './jira-queries';
import collectIssuesForEpics from './collect';
import generateReport from './report';

export type LinkedEpicDetailEntry = { key: string; title: string; total: number; open: number };
export type NonLinkedEpicDetailEntry = { key: null; title: null; total: number; open: number };
export type EpicDetailEntry = LinkedEpicDetailEntry | NonLinkedEpicDetailEntry;

async function project(options: Options, projectKeys: ProjectKeys, key: string, task: RemoteTask) {
  const started = DateTime.utc();

  setGlobals(options);

  if (!projectKeys.jira.includes(key)) {
    await task.markFailed('This project does not exist in Jira Cloud');
    return;
  }

  if (!projectKeys.confluence.includes(key)) {
    await task.markFailed('This project does not have a corresponding Space in Confluence');
    return;
  }

  const { id: pageId } = await task
    .add('Creating page on Confluence')
    .then((task) => task.wrap(createPage({ type: 'Epics', started, key })));

  let status: TaskStatus = TaskStatus.Pending;
  try {
    const epics = await task.add('Fetching epics from Jira Cloud').then((task) => task.wrap(getEpics(key)));

    const totalEpics = epics.length;
    if (totalEpics === 0) {
      await task.warn('This project has no epics in Jira Cloud');
      status = TaskStatus.Skipped;
      return;
    }

    const allTime = clone(epics);
    await task
      .add('Fetching all-time issue counts for epics in Jira Cloud')
      .then((task) => task.wrap(collectIssuesForEpics(key, allTime, false), totalEpics + 1, 'epics'));

    const recentlyUpdated = clone(epics);
    await task
      .add('Fetching recently-updated issue counts for epics in Jira Cloud')
      .then((task) => task.wrap(collectIssuesForEpics(key, recentlyUpdated, true), totalEpics + 1, 'epics'));

    const filename = `epics-report_${_.kebabCase(key)}_${started.toISODate()}.xlsx`;

    const report = await task
      .add('Generating report')
      .then((task) => task.wrap(generateReport(allTime, recentlyUpdated, key)));

    await task
      .add('Saving to disk')
      .then((task) => task.wrap(fs.writeFile(path.join(options.output, filename), report)));

    await task.add('Uploading report to Confluence').then((task) => task.wrap(addAttachment(pageId, report, filename)));

    status = TaskStatus.Completed;
  } catch (error) {
    status = TaskStatus.Failed;
    throw error;
  } finally {
    const log = await task.simpleRender();
    await task
      .add('Updating Confluence page')
      .then((update) => update.wrap(updatePage(pageId, { started, log, status })));

    if (status === TaskStatus.Skipped) {
      await task.skip();
    }
  }
}

if (!isMainThread) {
  Comlink.expose(wrapProjectHandler(project), nodeEndpoint(parentPort!));
}

export function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
