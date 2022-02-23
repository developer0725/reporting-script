import _ from 'lodash';
import { DateTime, Duration } from 'luxon';

import { JIRA_DATETIME_FORMAT } from '../../formats';
import { worklogUrl } from '../../urls';
import { ProgressBarEvents } from '../../helpers/tasktree';

import { WeeklyRecord } from './get-jira-issues';
import { atlassianClient } from '../../helpers/global-options';

interface WorklogsResponse {
  worklogs: Array<{ started: string; timeSpentSeconds: number }>;
}

const ONE_WEEK_AGO = DateTime.utc()
  .minus(Duration.fromObject({ weeks: 1 }))
  .startOf('day')
  .valueOf();

type Records = Array<[string, WeeklyRecord]>;

async function* getWeeklyWorklogData(records: Records): ProgressBarEvents {
  const client = atlassianClient();

  for (let [issueKey, issueData] of records) {
    yield { type: 'progress', text: issueKey };
    issueData.timeSpentWeek = await getTimeSpentWeek(issueKey);
  }

  async function getTimeSpentWeek(issueKey: string) {
    const response = await client.get<WorklogsResponse>(worklogUrl(issueKey));

    // `startedAfter` query parameter doesn't work, so manual filtering is required
    const totalSeconds = _(response.data.worklogs)
      .filter(
        (log) => DateTime.fromFormat(log.started, JIRA_DATETIME_FORMAT, { zone: 'utc' }).valueOf() >= ONE_WEEK_AGO
      )
      .sumBy('timeSpentSeconds');

    return Duration.fromObject({ seconds: totalSeconds });
  }
}

export default getWeeklyWorklogData;
