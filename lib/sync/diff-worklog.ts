import { AxiosResponse, AxiosError, AxiosRequestConfig } from 'axios';
import _ from 'lodash';
import { DateTime, Duration } from 'luxon';

import { JIRA_DATETIME_FORMAT } from '../formats';
import { worklogUrl } from '../urls';
import { ValidSyncRecord } from './transform-records';
import { ProgressBarEvents } from '../helpers/tasktree';
import { atlassianClient } from '../helpers/global-options';
import { getTimeRange, TimeRange, TimeSpan } from '../helpers/get-ssm-report';

interface ExistingWorklog {
  started: string;
  timeSpentSeconds: number;
  id: string;
}

interface ExistingWorklogResponse {
  worklogs: ExistingWorklog[];
}

interface WorklogComparable {
  started: DateTime;
  duration: Duration;
}

function isWorklogEqual(first: WorklogComparable, second: WorklogComparable) {
  return first.started.valueOf() === second.started.valueOf() && first.duration.valueOf() === second.duration.valueOf();
}

function postRequest(added: ValidSyncRecord): AxiosRequestConfig {
  return {
    method: 'POST', params: {
      notifyUsers: false, adjustEstimate: 'leave', // overrideEditableFlag: true
    }, data: {
      comment: {
        version: 1, type: 'doc', content: [
          { type: 'paragraph', content: [{ type: 'text', text: added.person }] },
          { type: 'paragraph', content: [{ type: 'text', text: added.note.description }] },
        ],
      }, started: added.started.toFormat(JIRA_DATETIME_FORMAT), timeSpentSeconds: added.duration.as('seconds'),
    },
  };
}

function deleteRequest(removed: { id: string }): AxiosRequestConfig {
  return {
    method: 'DELETE', url: removed.id, params: {
      notifyUsers: false, adjustEstimate: 'leave', // overrideEditableFlag: true
    },
  };
}

type Records = Map<string, ValidSyncRecord[]>;

async function* diff(records: Records, time: TimeSpan): ProgressBarEvents {
  const timeRange: TimeRange = await getTimeRange(time);
  const days = timeRange.to.diff(timeRange.from).as('days');
  const totals = {
    valid: { issues: 0, compared: 0, added: 0, removed: 0, unchanged: 0 }, nonExistent: { issues: 0, skipped: 0 },
    nonPermission: { issues: 0, skipped: 0 },
  };

  try {
    for (let [issueKey, ssm] of records) {
      yield { type: 'progress', ticks: 0, text: `[${issueKey}] records to compare: ${ssm.length}` };

      const client = atlassianClient(worklogUrl(issueKey));

      let response: AxiosResponse<ExistingWorklogResponse>;
      try {
        response = await client.request({ method: 'get', params: { startedAfter: timeRange.from.toMillis() } });
      } catch (error) {
        // if the key is invalid,  report a warning
        if ((error as AxiosError)?.response?.status === 404) {
          totals.nonExistent.issues++;
          totals.nonExistent.skipped += ssm.length;
          yield {
            type: 'progress', ticks: ssm.length,
            text: `[${issueKey}] skipping ${ssm.length} records for non-existent issue`
          };
          yield { type: 'warning', text: `[${issueKey}] skipping records for non-existent issue` };
          continue;
        } else {
          throw error;
        }
      }

      const worklogs = response.data.worklogs.filter((log) => (timeRange.to.diff(DateTime.fromISO(log.started)).as('days') <= days));
      const jira = worklogs.map((log) => ({
        started: DateTime.fromFormat(log.started, JIRA_DATETIME_FORMAT, { zone: 'utc' }),
        duration: Duration.fromObject({ seconds: log.timeSpentSeconds }), id: log.id,
      }));

      const added = _(ssm).differenceWith(jira, isWorklogEqual).value();

      const removed = _(jira).differenceWith(ssm, isWorklogEqual).value();

      // advanced by number of unchanged records
      const unchanged = jira.length - removed.length;
      totals.valid.issues++;
      totals.valid.compared += ssm.length;
      totals.valid.unchanged += unchanged;
      yield { type: 'progress', ticks: 0, text: `[${issueKey}] records to add: ${added.length}` };
      yield { type: 'progress', ticks: 0, text: `[${issueKey}] records to remove: ${removed.length}` };
      yield { type: 'progress', ticks: unchanged, text: `[${issueKey}] unchanged records: ${unchanged}` };

      try {
        for (let entry of removed) {
          yield { type: 'progress', text: `[${issueKey}] removing ${entry.started.toISO()} (worklog id ${entry.id})` };
          await client.request(deleteRequest(entry));
          totals.valid.removed++;
        }

        for (let entry of added) {
          yield {
            type: 'progress', text: `[${issueKey}] adding ${entry.started.toISO()} ('${entry.note.description}')`
          };
          await client.request(postRequest(entry));
          totals.valid.added++;
        }
      } catch (error) {
        // if access key has not editable-permission for issue,  report a warning
        if ((error as AxiosError)?.response?.status === 400) {
          totals.nonPermission.issues++;
          totals.nonPermission.skipped += removed.length + added.length;
          yield {
            type: 'progress', ticks: removed.length + added.length,
            text: `[${issueKey}] skipping ${ssm.length} records for non-editable issue`
          };
          yield { type: 'warning', text: `[${issueKey}] skipping records for non-editable issue` };
          continue;
        } else {
          throw error;
        }
      }
    }
  } finally {
    const ended = DateTime.utc();
    const duration = ended.diff(timeRange.from);
    yield { type: 'log', text: 'Compared Screenshot Monitor records against worklogs from Jira Cloud issues:' };
    yield { type: 'log', text: `Started:                        ${timeRange.from}` };
    yield { type: 'log', text: `Ended:                          ${ended}` };
    yield { type: 'log', text: `Duration:                       ${duration.toFormat("m'm's's'")}` };
    yield { type: 'log', text: `Issues compared:                ${totals.valid.issues}` };
    yield { type: 'log', text: `Records compared:               ${totals.valid.compared}` };
    yield { type: 'log', text: `Worklogs added:                 ${totals.valid.added}` };
    yield { type: 'log', text: `Worklogs removed:               ${totals.valid.removed}` };
    yield { type: 'log', text: `Worklogs unchanged:             ${totals.valid.unchanged}` };
    yield { type: 'log', text: `Non-Exist Issues found:         ${totals.nonExistent.issues}` };
    yield { type: 'log', text: `Non-Exist Records skipped:      ${totals.nonExistent.skipped}` };
    yield { type: 'log', text: `Non-Editable Issues found:      ${totals.nonPermission.issues}` };
    yield { type: 'log', text: `Non-Editable Records skipped:   ${totals.nonPermission.skipped}` };
  }
}

export default diff;
