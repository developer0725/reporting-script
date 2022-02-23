import _ from 'lodash';
import { Duration } from 'luxon';

import getJiraSearchResults, {
  JiraSearchRequest,
  JiraSearchResponseEntry,
  JiraSearchRecords,
} from '../../helpers/get-jira-search-results';

import { MonthlyRecord } from './record';

type Request = JiraSearchRequest<ResponseFields, ResponseRenderedFields>;

interface ResponseFields {
  summary: string;
  customfield_10036: string | null;
  customfield_10037: unknown | null; // Atlassian Document Format
}

interface ResponseRenderedFields {
  summary: null;
  customfield_10036: string;
  customfield_10037: string;
}

type ResponseEntry = JiraSearchResponseEntry<ResponseFields, ResponseRenderedFields>;

export type JiraRecords = JiraSearchRecords<JiraRecord>;

export type CreditHoursDuration = Duration | 'all';

export interface JiraRecord {
  key: string;
  totalCreditHours: CreditHoursDuration | null;
  rawTotalCreditHours: string;
  creditHoursReason: string;
  title: string;
  epicName: string | null;
}

function parseDuration(value: string): CreditHoursDuration | null {
  if (value === 'ALL') {
    return 'all';
  }

  if (value === '') {
    return Duration.fromMillis(0);
  }

  const [hours, minutes] = value.split(':').map(Number.parseFloat);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return Duration.fromObject({ hours, minutes });
}

function map(issue: ResponseEntry): JiraRecord {
  const rawTotalCreditHours = issue.renderedFields.customfield_10036??'';

  return {
    key: issue.key,
    totalCreditHours: parseDuration(rawTotalCreditHours),
    rawTotalCreditHours,
    creditHoursReason: issue.renderedFields.customfield_10037,
    title: issue.fields.summary,
    epicName: null
  };
}

async function getJiraRecords(ssm: MonthlyRecord[]) {
  if (ssm.length === 0) {
    return {};
  }

  const keys = _(ssm).map('key').uniq().join(', ');

  const request: Request = {
    expand: ['renderedFields'],
    jql: `key in (${keys})`,
    fields: ['summary', 'customfield_10036', 'customfield_10037'],
    validateQuery: 'warn',
  };

  return await getJiraSearchResults(request, map);
}

export async function getJiraEpicRecords(projectKey: string, epicKey: string | null) {
  const jql = `project = ${projectKey} AND \
  parentEpic = ${epicKey} AND \
  key != ${epicKey}`;

  const request: Request = {
    expand: ['renderedFields'],
    jql: jql,
    fields: ['summary', 'customfield_10036', 'customfield_10037'],
  };

  return await getJiraSearchResults(request, map);
}

export default getJiraRecords;
