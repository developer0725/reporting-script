import _ from 'lodash';

import getJiraSearchResults, {
  getJiraSearchResultsCount,
  JiraSearchRequest,
} from '../../helpers/get-jira-search-results';
import { completionStatusJql } from '../../helpers/global-options';

import { EpicDetailEntry } from './project';

export async function getEpics(projectKey: string): Promise<EpicDetailEntry[]> {
  const request: JiraSearchRequest<{ summary: string }, never> = {
    expand: [],
    jql: `project = ${projectKey} AND issuetype = Epic`,
    fields: ['summary'],
  };

  const results = await getJiraSearchResults(request, (issue) => issue.fields.summary);
  return Object.entries(results).map(([key, title]) => ({ key, title, total: NaN, open: NaN }));
}

export async function getAllTicketsCount(projectKey: string, epicKey: string) {
  const jql = `project = ${projectKey} AND \
    parentEpic = ${epicKey} AND \
    key != ${epicKey}`;

  return await getJiraSearchResultsCount(jql);
}

export async function getOpenTicketsCount(projectKey: string, epicKey: string) {
  const jql = `project = ${projectKey} AND \
    parentEpic = ${epicKey} AND \
    key != ${epicKey} AND \
    status NOT IN ${completionStatusJql()}`;

  return await getJiraSearchResultsCount(jql);
}

export async function getRecentlyUpdatedAllTicketsCount(projectKey: string, epicKey: string) {
  const jql = `project = ${projectKey} AND \
    parentEpic = ${epicKey} AND \
    key != ${epicKey} AND \
    updated >= startOfMonth()`;

  return await getJiraSearchResultsCount(jql);
}

export async function getRecentlyUpdatedOpenTicketsCount(projectKey: string, epicKey: string) {
  const jql = `project = ${projectKey} AND \
    parentEpic = ${epicKey} AND \
    key != ${epicKey} AND \
    status NOT IN ${completionStatusJql()} AND \
    updated >= startOfMonth()`;

  return await getJiraSearchResultsCount(jql);
}

export async function getAllNonLinkedTicketsCount(projectKey: string, epicKeys: string[]) {
  const jql = `project = ${projectKey} AND \
    parentEpic NOT IN (${epicKeys.join(',')})`;

  return await getJiraSearchResultsCount(jql);
}

export async function getNonLinkedOpenTicketsCount(projectKey: string, epicKeys: string[]) {
  const jql = `project = ${projectKey} AND \
    parentEpic NOT IN (${epicKeys.join(',')}) AND \
    status NOT IN ${completionStatusJql()}`;

  return await getJiraSearchResultsCount(jql);
}

export async function getNonLinkedRecentlyUpdatedAllTicketsCount(projectKey: string, epicKeys: string[]) {
  const jql = `project = ${projectKey} AND \
    parentEpic NOT IN (${epicKeys.join(',')}) AND \
    updated >= startOfMonth()`;

  return await getJiraSearchResultsCount(jql);
}

export async function getNonLinkedRecentlyUpdatedOpenTicketsCount(projectKey: string, epicKeys: string[]) {
  const jql = `project = ${projectKey} AND \
    parentEpic NOT IN (${epicKeys.join(',')}) AND \
    status NOT IN ${completionStatusJql()} AND \
    updated >= startOfMonth()`;

  return await getJiraSearchResultsCount(jql);
}
