import { ISSUE_SEARCH_URL } from '../urls';
import { atlassianClient } from './global-options';

export interface JiraSearchRequest<Fields, RenderedFields> {
  expand: [RenderedFields] extends [never] ? [] : ['renderedFields'];
  jql: string;
  fields: Array<keyof Fields>;
  validateQuery?: string;
}

export interface JiraSearchResponse<Fields, RenderedFields> {
  expand: string;
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraSearchResponseEntry<Fields, RenderedFields>[];
}

export interface JiraSearchResponseEntry<Fields, RenderedFields> {
  expand: string;
  id: string;
  key: string;
  fields: Fields;
  renderedFields: RenderedFields;
}

export interface JiraSearchRecords<T> {
  [key: string]: T;
}

async function getJiraSearchResults<Fields, RenderedFields, Record>(
  request: JiraSearchRequest<Fields, RenderedFields>,
  map: (entry: JiraSearchResponseEntry<Fields, RenderedFields>) => Record | Promise<Record>
): Promise<JiraSearchRecords<Record>> {
  let collected = 0;
  const records: JiraSearchRecords<Record> = {};

  const client = atlassianClient();

  while (true) {
    try{
    const response = await client.post<JiraSearchResponse<Fields, RenderedFields>>(ISSUE_SEARCH_URL, {
      ...request,
      startAt: collected,
    });

    const batch = response.data.issues;

    for (let issue of batch) {
      records[issue.key] = await map(issue);
    }

    collected += batch.length;

    if (batch.length < response.data.maxResults) {
      break;
    }
  }catch(e) {
    const errors = e.response.data.errorMessages.join('\n');
    console.log(errors);

    break;
    }
  }

  return records;
}

export async function getJiraSearchResultsCount(jql: string): Promise<number> {
  const response = await atlassianClient().post<JiraSearchResponse<{}, {}>>(ISSUE_SEARCH_URL, {
    jql,
    startAt: 0,
    maxResults: 0,
  });

  return response.data.total;
}

export default getJiraSearchResults;
