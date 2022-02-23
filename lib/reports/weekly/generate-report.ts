import * as csv from '@fast-csv/format';

import { DURATION_FORMAT } from '../../formats';

import { WeeklyRecord } from './get-jira-issues';

interface RowData {
  'Issue Type': string;
  Priority: string;
  'Parent Epic Key': string;
  'Parent Epic Description': string;
  Project: string;
  'Issue Key': string;
  Summary: string;
  Assignee: string;
  Reporter: string;
  Status: string;
  'Dev Estimate': string;
  'Time Spent (Total)': string;
  'Time Spent (Last 7 Days)': string;
  Labels: string;
}

function transform(issue: WeeklyRecord): RowData {
  return {
    'Issue Type': issue.type,
    Priority: issue.priority ?? 'No Priority Assigned',
    'Parent Epic Key': issue.epic ?? '',
    'Parent Epic Description': issue.epicDescription ?? '',
    Project: issue.key.split('-')[0],
    'Issue Key': issue.key,
    Summary: issue.summary,
    Assignee: issue.assignee ?? 'Unassigned',
    Reporter: issue.reporter,
    Status: issue.status,
    'Dev Estimate': issue.estimate?.toFormat(DURATION_FORMAT) ?? 'None',
    'Time Spent (Total)': issue.timeSpentTotal.toFormat(DURATION_FORMAT),
    'Time Spent (Last 7 Days)': issue.timeSpentWeek!.toFormat(DURATION_FORMAT),
    Labels: issue.labels.join(', '),
  };
}

async function generateReport(issues: WeeklyRecord[]): Promise<Buffer | null> {
  if (issues.length > 0) {
    return await csv.writeToBuffer<WeeklyRecord, RowData>(issues, { headers: true, transform });
  } else {
    return null;
  }
}

export default generateReport;
