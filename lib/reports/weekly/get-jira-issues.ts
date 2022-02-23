import { DateTime, Duration } from 'luxon';

import { JIRA_DATETIME_FORMAT } from '../../formats';
import getJiraSearchResults, {
  JiraSearchRequest,
  JiraSearchResponseEntry,
} from '../../helpers/get-jira-search-results';
import { completionStatusJql } from '../../helpers/global-options';

interface ResponseFields {
  summary: string;
  issuetype: { name: string };
  parent?: null | { key: string; fields: { issuetype: { name: string } } };
  timespent: number;
  created: string;
  reporter: { displayName: string };
  customfield_10034: null | number;
  priority: null | { name: string };
  labels: string[];
  customfield_10008: null | string;
  assignee: null | { displayName: string };
  updated: string;
  status: { name: string };
}

type ResponseEntry = JiraSearchResponseEntry<ResponseFields, never>;

const FIELDS: Array<keyof ResponseFields> = [
  'issuetype',
  'priority',
  'summary',
  'assignee',
  'reporter',
  'status',
  'customfield_10034',
  'timespent',
  'labels',
  'created',
  'updated',
  'parent',
  'customfield_10008',
];

export async function getEpics() {
  const request: JiraSearchRequest<{ summary: string }, never> = {
    expand: [],
    jql: 'issuetype = Epic',
    fields: ['summary'],
  };

  return await getJiraSearchResults(request, (issue) => issue.fields.summary);
}

export interface WeeklyRecord {
  type: string;
  priority: string | undefined;
  parent: string | undefined;
  epic: string | null;
  epicDescription: string | null;
  key: string;
  summary: string;
  assignee: string | undefined;
  reporter: string;
  status: string;
  estimate: null | Duration;
  timeSpentTotal: Duration;
  timeSpentWeek?: Duration;
  labels: string[];
  created: DateTime;
  updated: DateTime;
}

function mapIssue(issue: ResponseEntry): WeeklyRecord {
  const estimate = issue.fields.customfield_10034;

  let epicKey = issue.fields.customfield_10008;
  if (epicKey == null) {
    if (issue.fields.parent != null) {
      if (issue.fields.parent.fields.issuetype.name === 'Epic') {
        epicKey = issue.fields.parent.key;
      }
    }
  }

  return {
    type: issue.fields.issuetype.name,
    priority: issue.fields.priority?.name,
    epic: epicKey,
    epicDescription: null,
    parent: issue.fields.parent?.key,
    key: issue.key,
    summary: issue.fields.summary,
    assignee: issue.fields.assignee?.displayName,
    reporter: issue.fields.reporter.displayName,
    status: issue.fields.status.name,
    estimate: estimate === null ? null : Duration.fromObject({ hours: estimate }),
    timeSpentTotal: Duration.fromObject({ seconds: issue.fields.timespent }),
    labels: issue.fields.labels,
    created: DateTime.fromFormat(issue.fields.created, JIRA_DATETIME_FORMAT, { zone: 'utc' }),
    updated: DateTime.fromFormat(issue.fields.updated, JIRA_DATETIME_FORMAT, { zone: 'utc' }),
  };
}

export async function getOpenIssues(key: string) {
  console.log(key)
  const jql = `
    project in (${key}) \
    AND status NOT IN ${completionStatusJql()} \
    AND issuetype NOT IN (Epic, Feature) \
    ORDER BY key`;

  const request: JiraSearchRequest<ResponseFields, never> = { expand: [], jql, fields: FIELDS };
  return await getJiraSearchResults(request, mapIssue);
}

export async function getClosedIssues(key: string) {
  const jql = `
    project in (${key}) \
    AND status IN ${completionStatusJql()} \
    AND status WAS NOT IN ${completionStatusJql()} BEFORE -1w \
    AND issuetype NOT IN (Epic, Feature) \
    ORDER BY key`;

  const request: JiraSearchRequest<ResponseFields, never> = { expand: [], jql, fields: FIELDS };
  return await getJiraSearchResults(request, mapIssue);
}

export async function getMailsCommandIssues(projects:string[], exceptLabels:string[]) {
  const projectsQuery = projects.map(project=>`"${project}"`).join(',');
  const labelsQuery = exceptLabels.join(',');
  const jql = `project in (${projectsQuery}) AND (labels not in (${labelsQuery}) OR labels is EMPTY) AND issuetype in
  (Support)  AND status not in (Done) ORDER BY key DESC, created DESC`;

  const request: JiraSearchRequest<ResponseFields, never> = { expand: [], jql, fields: FIELDS , validateQuery:'warn'};
  return await getJiraSearchResults(request, mapIssue);
}
