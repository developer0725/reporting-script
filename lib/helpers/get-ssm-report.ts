import { DateTime } from 'luxon';

import { DATE_FORMAT } from '../formats';
import { REPORT_URL } from '../urls';
import { getSsmData, screenshotMonitorClient, SsmData } from './global-options';

const REQUEST_BODY = {
  shrdId: null,
  empl: [] as string[],
  groups: [] as string[],
  clients: [] as string[],
  prj: [] as string[],
  from: null as null | string,
  to: null as null | string,
  isToday: false,
  isYesterday: false,
  isWeek: false,
  isPrevWeek: false,
  isLast7Days: false,
  isMonth: false,
  isPrevMonth: false,
  isLast30Days: false,
  isYear: false,
  isLastYear: false,
  timeZone: 'UTC',
  note: '',
  offline: false,
  cronString: '0 9 * * 0',
  group: [] as string[],
  generateTimeStamp: new Date().valueOf(),
};


export type TimeRange = {
  from:DateTime,
  to:DateTime
}

export type TimeSpan =
  | 'all-time'
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'this-month'
  | 'last-week'
  | 'last-month'
  | 'this-year'
  | 'last-year'
  | TimeRange;

type GroupKey = 'employee' | 'date' | 'project' | 'task' | 'note' | 'appsurls';

type GroupMap<T extends GroupKey> =
  | (T extends 'employee' ? 'Employment' : never)
  | (T extends 'date' ? 'Date' : never)
  | (T extends 'project' ? 'Project' : never)
  | (T extends 'task' ? 'Task' : never)
  | (T extends 'note' ? 'Note' : never);

type GroupedEntry<T extends GroupKey> = { [P in GroupMap<T>]: string } & {
  Duration: number;
  Money: number;
  Activity: number | null;
};

export type IndividualEntry = {
  Date: string;
  Offline: boolean;
  Employment: string;
  Project: string;
  Note: string;
  From: string;
  To: string;
  Duration: number;
  Money: number;
  Activity: number | null;
};

type Report<T extends GroupKey | never = never> = {
  body: [T] extends [never] ? IndividualEntry[] : GroupedEntry<T>[];
};

function timeSpan(time: any): Partial<typeof REQUEST_BODY> {
  switch (time) {
    case 'all-time':
      return {};
    case 'today':
      return { isToday: true };
    case 'yesterday':
      return { isYesterday: true };
    case 'this-week':
      return { isWeek: true };
    case 'last-week':
      return { isPrevWeek: true };
    case 'this-month':
      return { isMonth: true };
    case 'last-month':
      return { isPrevMonth: true };
    case 'this-year':
      return { isYear: true };
    case 'last-year':
      return { isLastYear: true };
    default:
      return {
        to: time.to.toFormat(DATE_FORMAT),
        from: time.from.toFormat(DATE_FORMAT),
      };
  }
}

export default async function getReport<T extends GroupKey | never = never>(
  projects: string[],
  group: T[] = [],
  time: TimeSpan = 'all-time'
): Promise<Report<T>['body']> {
  const body: typeof REQUEST_BODY = {
    ...REQUEST_BODY,
    ...timeSpan(time || 'all-time'),
    group,
    prj: Object.values(projects),
    generateTimeStamp: new Date().valueOf(),
  };

  const response = await screenshotMonitorClient().post<Report<T>>(REPORT_URL, body, { responseType: 'json' });

  return response.data.body;
}

export async function getTimeRange(time: TimeSpan): Promise<TimeRange> {
  const ssmData: SsmData = await getSsmData();
  let from: DateTime, to: DateTime, now: DateTime = DateTime.fromSeconds(ssmData.now);
  switch (time) {
    case 'all-time':
      from = DateTime.fromSeconds(0);
      to = now;
      break;
    case 'today':
      from = now.set({hour: 0, minute: 0, second: 0});
      to = from.plus({ days: 1 });
      break;
    case 'yesterday':
      to = now.set({hour: 0, minute: 0, second: 0});
      from = to.minus({ days: 1 });
      break;
    case 'this-week':
      from = now.set({weekday:1, hour: 0, minute: 0, second: 0});
      to = from.plus({ weeks: 1 });
      break;
    case 'last-week':
      to = now.set({weekday:1, hour: 0, minute: 0, second: 0});
      from = to.minus({ weeks: 1 });
      break;
    case 'this-month':
      from = now.set({day:1, hour: 0, minute: 0, second: 0});
      to = from.plus({ months: 1 });
      break;
    case 'last-month':
      to = now.set({day:1, hour: 0, minute: 0, second: 0});
      from = to.minus({ months: 1 });
      break;
    case 'this-year':
      from = now.set({month:1, day:1, hour: 0, minute: 0, second: 0});
      to = from.plus({ years: 1 });
      break;
    case 'last-year':
      to = now.set({month:1, day:1, hour: 0, minute: 0, second: 0});
      from = to.minus({ years: 1 });
      break;
    default:
      from = time.from;
      to = time.to;
  }
  return { from, to };
}
