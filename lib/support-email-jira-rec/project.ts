import { intersection } from "lodash";
import { DateTime } from "luxon";
import { isMainThread, parentPort } from "worker_threads";
import * as Comlink from "comlink";
import nodeEndpoint from "comlink/dist/umd/node-adapter";

import { WeeklyRecord } from "../reports/weekly/get-jira-issues";
import { OutlookMessage } from "../mails/project";
import { JiraSearchRecords } from "../helpers/get-jira-search-results";
import {
  ProgressBarEvents, ProgressBarResult, RemoteTask,
} from "../helpers/tasktree";
import "../helpers/tasktree";
import { CombinedSupportMailJiraOptions as Options } from "./index";
import { IncomingWebhook } from "@slack/webhook";
import config from "../../configs/reports/monthly.json"; // patch comlink and tasktree-cli

export interface GroupRequest {
  issues: JiraSearchRecords<WeeklyRecord>;
  emails: OutlookMessage[];
}

interface GroupIssueResult {
  issuesWithMail: WeeklyRecord[];
  issuesWithoutMail: WeeklyRecord[];
}

interface GroupEmailResult {
  mailsWithIssue: OutlookMessage[];
  mailsWithoutIssue: OutlookMessage[];
  mailsWithoutCategory: OutlookMessage[];
}

function* issueLogGenerator(issues: WeeklyRecord[]) {
  if (issues.length > 0) {
    for (const issue of issues) {
      yield `${issue.key}\t[${issue.status}]\t${issue.summary}`;
    }
  } else {
    yield "N/A";
  }
}

function* emailLogsGenerator(emails: OutlookMessage[]) {
  if (emails.length > 0) {
    for (const email of emails) {
      yield [`Subject: ${email.subject}`, `From: ${email.from.emailAddress.name} <${email.from.emailAddress.address}>`, `Received: ${DateTime.fromISO(email.receivedDateTime, {
        zone: "utc",
      }).toISO()}`,].join(" | ")
    }
  } else {
    yield "N/A";
  }
}

async function* groupIssue(groupRequest: GroupRequest): ProgressBarEvents<GroupIssueResult> {
  const issuesWithMail: WeeklyRecord[] = [], issuesWithoutMail: WeeklyRecord[] = [];

  for (const [issueKey, issue] of Object.entries(groupRequest.issues)) {
    yield { type: "progress", text: issueKey };

    let issueMail = groupRequest.emails.find((mail: any) => mail.categories.find((category: any) => issueKey == category));

    if (issueMail) {
      issuesWithMail.push(issue);
    } else {
      issuesWithoutMail.push(issue);
    }
  }

  yield { type: "log", text: `Issues with Email : ${issuesWithMail.length}` };
  yield { type: "log", text: `Issues without Email : ${issuesWithoutMail.length}` };

  return { issuesWithMail, issuesWithoutMail };
}

async function* groupEmail(groupRequest: GroupRequest): ProgressBarEvents<GroupEmailResult> {
  const mailsWithIssue: OutlookMessage[] = [], mailsWithoutIssue: OutlookMessage[] = [],
    mailsWithoutCategory: OutlookMessage[] = [];

  const issueKeys = Object.keys(groupRequest.issues);
  for (const email of groupRequest.emails) {
    yield {
      type: "progress", text: `[${email.receivedDateTime}]-[${email.from}]-[${email.subject}]`,
    };
    if (!email.categories.length) {
      mailsWithoutCategory.push(email);
    } else {
      if (intersection(email.categories, issueKeys).length) {
        mailsWithIssue.push(email);
      } else {
        mailsWithoutIssue.push(email);
      }
    }
  }

  yield { type: "log", text: `Emails with Ticket : ${mailsWithIssue.length}` };
  yield { type: "log", text: `Emails without Ticket : ${mailsWithoutIssue.length}` };
  yield { type: "log", text: `Emails with Category : ${mailsWithoutCategory.length}` };

  return { mailsWithIssue, mailsWithoutIssue, mailsWithoutCategory };
}

function* logGenerator(issueResult: ProgressBarResult<GroupIssueResult>, emailResult: ProgressBarResult<GroupEmailResult>) {
  const divider = "-------------------------------------";
  yield `${divider}${new Date()}${divider}`;
  yield "*--TICKETS WITH MAILS--*";
  yield* issueLogGenerator(issueResult.success ? issueResult.value.issuesWithMail : []);
  yield "*--TICKETS WITHOUT MAILS--*";
  yield* issueLogGenerator(issueResult.success ? issueResult.value.issuesWithoutMail : []);
  yield "*--MAILS WITH TICKETS--*";
  yield* emailLogsGenerator(emailResult.success ? emailResult.value.mailsWithIssue : []);
  yield  "*--MAILS WITHOUT TICKETS--*";
  yield* emailLogsGenerator(emailResult.success ? emailResult.value.mailsWithoutIssue : []);
  yield  "*--UNCATEGORIZED MAILS--*";
  yield* emailLogsGenerator(emailResult.success ? emailResult.value.mailsWithoutCategory : []);
  yield `${divider}END${divider}`;

  return '';
}

async function sendReport(issues: ProgressBarResult<GroupIssueResult>, emails: ProgressBarResult<GroupEmailResult>, options: Options) {
  const slackLogs = logGenerator(issues, emails);
  let message: string = '';
  let log;
  do {
    log = slackLogs.next();
    if (log.done || message.length + log.value.length > options.maxMessageLength) {
      await new IncomingWebhook(config["slack-valid-report-webhooks"][0]).send({ text: message });
      message = '';
    }
    message += `\n${log.value}`;
  } while (!log.done)
}

export default async function groupTickets(groupRequest: GroupRequest, options: Options, task: RemoteTask) {


  const issueResult = await task
    .add("grouping issues...")
    .then((issueTask) => issueTask.wrap(groupIssue(groupRequest), Object.keys(groupRequest.issues).length, "issues"));

  const emailResult = await task
    .add("grouping emails...")
    .then((emailTask) => emailTask.wrap(groupEmail(groupRequest), Object.keys(groupRequest.emails).length, "emails"));

  await sendReport(issueResult, emailResult, options);
}

if (!isMainThread) {
  Comlink.expose(groupTickets, nodeEndpoint(parentPort!));
}
