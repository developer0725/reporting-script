import _ from 'lodash';

import { issueUrl } from '../../urls';
import { ProgressBarEvents } from '../../helpers/tasktree';

import { WeeklyRecord } from './get-jira-issues';
import { JiraSearchRecords } from '../../helpers/get-jira-search-results';
import { atlassianClient } from '../../helpers/global-options';

interface ParentIssueResponse {
  key: string;
  fields: {
    customfield_10008: null | string;
  };
}

type Records = Array<[string, WeeklyRecord]>;
type Epics = JiraSearchRecords<string>;

async function* matchEpics(records: Records, epics: Epics): ProgressBarEvents {
  const client = atlassianClient();

  for (let [issueKey, issueData] of records) {
    yield { type: 'progress', text: issueKey };

    if (issueData.epic) {
      if (epics[issueData.epic] == undefined) {
        yield {
          type: 'warning',
          text: `Epic '${issueData.epic}' linked to issue '${issueKey}' could not be found`,
        };
      }
      issueData.epicDescription = epics[issueData.epic];
      continue;
    }

    if (issueData.parent == undefined) {
      yield {
        type: 'warning',
        text: `Could not find an epic for issue '${issueKey}' because it is not directly linked to an epic and it has no parent issue.`,
      };
      continue;
    }

    const url = issueUrl(issueData.parent);
    const response = await client.get<ParentIssueResponse>(url, { params: { fields: ['customfield_10008'] } });

    if (response.data.fields.customfield_10008 == null) {
      yield {
        type: 'warning',
        text: `Could not find an epic for issue '${issueKey}' because its parent issue '${issueData.parent}' has no linked epic.`,
      };
      continue;
    }

    issueData.epic = response.data.fields.customfield_10008;
    if (epics[issueData.epic] == undefined) {
      yield {
        type: 'warning',
        text: `Epic '${issueData.epic}' linked to parent issue '${issueData.parent}' of issue '${issueKey}' could not be found`,
      };
    }
    issueData.epicDescription = epics[issueData.epic];
  }
}

export default matchEpics;
