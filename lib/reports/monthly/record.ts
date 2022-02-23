import { DateTime, Duration } from 'luxon';
import { CreditHoursDuration } from './get-jira-data';

interface BaseMonthlyRecord {
  project: string;
  person: string;
  date: DateTime;
  duration: Duration;
  note: string;
  key: string;
  description: string;
}

export type ValidMonthlyRecord = BaseMonthlyRecord & { invalid: false };

export type InvalidNoteMonthlyRecord = Omit<BaseMonthlyRecord, 'key' | 'description'> & {
  invalid: 'note';
  error: Error;
};

export type NotFoundMonthlyRecord = BaseMonthlyRecord & { invalid: 'not-found' };

export type InvalidDurationMonthlyRecord = Omit<BaseMonthlyRecord, 'duration'> & {
  invalid: 'duration';
  duration: string;
};

export type InvalidMonthlyRecord = InvalidNoteMonthlyRecord | NotFoundMonthlyRecord | InvalidDurationMonthlyRecord;

export type MonthlyRecord = ValidMonthlyRecord | InvalidMonthlyRecord;

export type MergedMonthlyRecord = ValidMonthlyRecord & {
  title: string;
  totalCreditHours: CreditHoursDuration;
  creditHoursReason: string;
};
