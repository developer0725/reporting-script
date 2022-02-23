import { promises as fs } from 'fs';
import path from 'path';
import { isMainThread, parentPort } from 'worker_threads';

import sendgrid from '@sendgrid/mail';
import { AttachmentData } from '@sendgrid/helpers/classes/attachment';
import * as Comlink from 'comlink';
import nodeEndpoint from 'comlink/dist/umd/node-adapter';
import _ from 'lodash';
import { DateTime } from 'luxon';
import { TaskStatus } from 'tasktree-cli/lib/Task';

import { ProjectKeys } from '../../helpers/prepare';
import { RemoteTask } from '../../helpers/tasktree';
import '../../helpers/tasktree'; // patch comlink and tasktree-cli
import { JiraSearchRecords } from '../../helpers/get-jira-search-results';
import { createPage, addAttachment, updatePage } from '../../helpers/confluence';
import { setGlobals } from '../../helpers/global-options';
import wrapProjectHandler from '../../helpers/project-handler';

import { CombinedWeeklyOptions as Options } from '.';
import { getEpics, getOpenIssues, getClosedIssues, WeeklyRecord } from './get-jira-issues';
import getWeeklyWorklogData from './get-jira-worklogs';
import matchIssuesToEpics from './match-epics';
import generateReport from './generate-report';

export interface Issues {
  epics: JiraSearchRecords<string>;
  open: JiraSearchRecords<WeeklyRecord>;
  closed: JiraSearchRecords<WeeklyRecord>;
}

interface Reports {
  open: Buffer | null;
  closed: Buffer | null;
}

interface Filenames {
  open: string;
  closed: string;
}

interface EmailData {
  started: DateTime;
  reports: Reports;
  filenames: Filenames;
  pageUrl: URL;
  key: string;
}

async function email(options: Options, data: EmailData) {
  const { started, reports, filenames, pageUrl, key } = data;

  const { 'cc-addresses': cc, 'from-address': from } = options;

  const to = options['to-addresses'][key];
  if (to === undefined) {
    throw new Error(`Could not find addresses to send to for project '${key}'`);
  }

  const title = `Weekly Reports: ${key} (${started.toISODate()})`;
  const subject = `Flying Donkey - ${title}`;
  const attachments: AttachmentData[] = [];
  if (reports.open) {
    attachments.push({
      filename: filenames.open,
      content: reports.open.toString('base64'),
    });
  }
  if (reports.closed) {
    attachments.push({
      filename: filenames.closed,
      content: reports.closed.toString('base64'),
    });
  }

  const text = `
Hello,

Please see attached your ${title}.

You can also view the Confluence page at: ${pageUrl}

Cheers,

Flying Donkey Team`;

  const html = `
<p>Hello,</p>

<p>Please see attached your ${title}.</p>

You can also view the Confluence page at: <a href="${pageUrl}">${pageUrl}</a>.

<p>Cheers,</p>

<p>Flying Donkey Team</p> `;

  sendgrid.setApiKey(options['sendgrid-api-key']);
  await sendgrid.send({ to, cc, from, subject, attachments, text, html });
}

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

  const { id: pageId, url: pageUrl } = await task
    .add('Creating page on Confluence')
    .then((task) => task.wrap(createPage({ type: 'Weekly', started, key })));

  let status = TaskStatus.Pending;
  try {
    const issues = {
      epics: await task.add('Fetching epics from Jira Cloud').then((task) => task.wrap(getEpics())),
      open: await task.add('Fetching all open issues from Jira Cloud').then((task) => task.wrap(getOpenIssues(key))),
      closed: await task
        .add('Fetching recently closed issues from Jira Cloud')
        .then((task) => task.wrap(getClosedIssues(key))),
    };

    const records = Object.entries(issues.open).concat(Object.entries(issues.closed));
    await task
      .add('Fetching weekly worklog data')
      .then((task) => task.wrap(getWeeklyWorklogData(records), records.length, 'issues'));
    await task
      .add('Matching issues to epics')
      .then((task) => task.wrap(matchIssuesToEpics(records, issues.epics), records.length, 'issues'));

    const reports = {
      open: issues.open
        ? await task
            .add('Creating CSV document for open issues')
            .then((task) => task.wrap(generateReport(Object.values(issues.open))))
        : null,
      closed: issues.closed
        ? await task
            .add('Creating CSV document for closed issues')
            .then((task) => task.wrap(generateReport(Object.values(issues.closed))))
        : null,
    };

    const filenames = {
      open: `weekly-report_${_.kebabCase(key)}-open-tickets_${started.toISODate()}.csv`,
      closed: `weekly-report_${_.kebabCase(key)}-closed-tickets_${started.toISODate()}.csv`,
    };

    if (reports.open) {
      const open = reports.open;
      await task
        .add('Saving open issues report to disk')
        .then((task) => task.wrap(fs.writeFile(path.join(options.output, filenames.open), open)));
    } else {
      await task
        .add('Saving open issues report to disk')
        .then((task) => task.log('This project has no open issues'))
        .then((task) => task.skip());
    }

    if (reports.closed) {
      const closed = reports.closed;
      await task
        .add('Saving closed issues report to disk')
        .then((task) => task.wrap(fs.writeFile(path.join(options.output, filenames.closed), closed)));
    } else {
      await task
        .add('Saving closed issues report to disk')
        .then((task) => task.log('This project has no closed issues for the past week-to-date'))
        .then((task) => task.skip());
    }

    if (reports.open) {
      await task
        .add('Uploading open issues report to Confluence')
        .then((task) => task.wrap(addAttachment(pageId, reports.open!, filenames.open)));
    } else {
      await task
        .add('Uploading open issues report to Confluence')
        .then((task) => task.log('This project has no open issues'))
        .then((task) => task.skip());
    }

    if (reports.closed) {
      await task
        .add('Uploading closed issues report to Confluence')
        .then((task) => task.wrap(addAttachment(pageId, reports.closed!, filenames.closed)));
    } else {
      await task
        .add('Uploading closed issues report to Confluence')
        .then((task) => task.log('This project has no closed issues for the past week-to-date'))
        .then((task) => task.skip());
    }

    await task
      .add('Sending emails')
      .then((task) => task.wrap(email(options, { started, reports, filenames, pageUrl, key })));

    status = TaskStatus.Completed;
  } catch (error) {
    status = TaskStatus.Failed;
    throw error;
  } finally {
    const log = await task.simpleRender();
    await task
      .add('Updating Confluence page')
      .then((update) => update.wrap(updatePage(pageId, { started, log, status })));
  }
}

if (!isMainThread) {
  Comlink.expose(wrapProjectHandler(project), nodeEndpoint(parentPort!));
}
