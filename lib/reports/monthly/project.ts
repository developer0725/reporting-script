import { promises as fs } from 'fs';
import path from 'path';
import { isMainThread, parentPort } from 'worker_threads';

import { IncomingWebhook, IncomingWebhookSendArguments } from '@slack/webhook';
import * as Comlink from 'comlink';
import nodeEndpoint from 'comlink/dist/umd/node-adapter';
import { group } from 'd3-array';
import _ from 'lodash';
import { DateTime } from 'luxon';
import { TaskStatus } from 'tasktree-cli/lib/Task';

import { ProjectKeys } from '../../helpers/prepare';
import { RemoteTask } from '../../helpers/tasktree';
import '../../helpers/tasktree'; // patch comlink and tasktree-cli
import { createPage, addAttachment, updatePage } from '../../helpers/confluence';
import { setGlobals } from '../../helpers/global-options';
import wrapProjectHandler from '../../helpers/project-handler';

import { CombinedMonthlyOptions as Options } from '.';
import getJiraRecords, { getJiraEpicRecords } from './get-jira-data';
import getSsmRecords from './get-ssm-data';
import createValidRecordsWorkbook from './valid-workbook';
import createInvalidRecordsWorkbook from './invalid-workbook';
import { ValidMonthlyRecord, InvalidMonthlyRecord } from './record';
import { getEpics } from '../epics/jira-queries';
import { TimeSpan } from '../../helpers/get-ssm-report';

async function project(options: Options, projectKeys: ProjectKeys, key: string, task: RemoteTask) {
  const started = DateTime.utc();

  setGlobals(options);

  if (!(key in projectKeys.ssm)) {
    await task.markFailed('This project does not exist in Screenshot Monitor');
    return;
  }

  if (!projectKeys.jira.includes(key)) {
    await task.markFailed('This project does not exist in Jira Cloud');
    return;
  }

  if (!projectKeys.confluence.includes(key)) {
    await task.markFailed('This project does not have a corresponding Space in Confluence');
    return;
  }

  const { id: pageId, url: pageUrl } = await task
    .add('Creating page on Confluence')
    .then((task) => task.wrap(createPage({ type: 'Monthly', started, key })));

  let status: TaskStatus = TaskStatus.Pending;

  try {
    const ssm = await task
      .add('Fetching report from Screenshot Monitor')
      .then((task) => task.wrap(getSsmRecords(projectKeys.ssm[key], options.time.toLocaleLowerCase() as TimeSpan)));

    if (ssm.length === 0) {
      await task.warn('No records for this project are present in Screenshot Monitor for the current month');
      status = TaskStatus.Skipped;
      return;
    }

    const validRecords: ValidMonthlyRecord[] = [];
    const invalidRecords: InvalidMonthlyRecord[] = [];
    for (let record of ssm) {
      if (record.invalid == 'note' || !record.key.startsWith(key)) {
        invalidRecords.push({ ...record, error: new Error('invalid project or note'), invalid: 'note' });
      } else {
        validRecords.push(record);
      }
    }

    const jira = await task
      .add('Fetching issues from Jira Cloud')
      .then((task) => task.wrap(getJiraRecords(validRecords)));

    const epics = await task.add('Fetching epics from Jira Cloud').then((task) => task.wrap(getEpics(key)));

    const totalEpics = epics.length;
    if (totalEpics === 0) {
      await task.warn('This project has no epics in Jira Cloud');
      status = TaskStatus.Skipped;
      return;
    }

    for (let epic of epics) {
      const epicTickets = await task
        .add(`Matching issues for epic ${epic.title}`)
        .then((task) => task.wrap(getJiraEpicRecords(key, epic.key)))

      for (let jiraKey of Object.keys(jira)) {
        if (Object.keys(epicTickets).includes(jiraKey)) {
          jira[jiraKey].epicName = epic.title;
        }
      }
    }

    for (let record of [...validRecords]) {

      let issue = jira[record.key];
      if (issue == undefined) {
        invalidRecords.push({ ...record, invalid: 'not-found' });
        _.remove<ValidMonthlyRecord>(validRecords,r=>r.key===record.key);
      } else if (issue.totalCreditHours == null) {
        invalidRecords.push({ ...record, duration: issue.rawTotalCreditHours, invalid: 'duration' });
        _.remove<ValidMonthlyRecord>(validRecords,r=>r.key===record.key);
      }
    }

    let isInvalid: boolean, report: Buffer;
    if (invalidRecords.length > 0) {
      isInvalid = true;

      const skipped = await task.add('Generating Excel workbook');
      await skipped.warn('Found invalid Screenshot Monitor records or Jira Cloud issues');
      await skipped.skip();

      report = await task
        .add('Generating Excel workbook for invalid records')
        .then((task) => task.wrap(createInvalidRecordsWorkbook(invalidRecords)));
    } else {
      isInvalid = false;
      const grouped = group(
        validRecords,
        (record) => record.key,
        (record) => record.person
      );
      report = await task
        .add('Generating Excel workbook')
        .then((task) => task.wrap(createValidRecordsWorkbook(key, jira, grouped)));
    }

    const name = isInvalid ? `${key} Invalid Records` : key;
    const title = `Monthly Report: ${name} (${started.toISODate()})`;
    const filename = `monthly-report_${_.kebabCase(name)}_${started.toISODate()}.xlsx`;

    await task
      .add('Saving to disk')
      .then((task) => task.wrap(fs.writeFile(path.join(options.output, filename), report)));

    await task.add('Uploading report to Confluence').then((task) => task.wrap(addAttachment(pageId, report, filename)));

    const message: IncomingWebhookSendArguments = {
      text: `A new report, ${title}, has been generated and uploaded to Confluence at ${pageUrl}.`,
    };

    const webhooks = isInvalid ? options['slack-invalid-report-webhooks'] : options['slack-valid-report-webhooks'];
    await task
      .add('Sending Slack notifications')
      .then((task) => task.wrap(Promise.all(webhooks.map((url) => new IncomingWebhook(url).send(message)))));

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
