import _ from 'lodash';
import { Duration, DateTime } from 'luxon';

import { IndividualEntry } from '../helpers/get-ssm-report';
import { ProgressBarEvents } from '../helpers/tasktree';
import parseNote, { ValidNote, InvalidNote } from '../helpers/note-parser';
import {TIME_FORMAT} from '../formats';
import {getSsmData} from "../helpers/global-options";

export interface SyncRecord {
  person: string;
  started: DateTime;
  duration: Duration;
  note: ValidNote | InvalidNote;
}

export type ValidSyncRecord = Omit<SyncRecord, 'note'> & { note: ValidNote };
export type InvalidSyncRecord = Omit<SyncRecord, 'note'> & { note: InvalidNote };

async function transformRecord(entry: IndividualEntry): Promise<SyncRecord> {
  const note = parseNote(entry.Note);
  const duration = Duration.fromObject({ minutes: entry.Duration });

  const ssmData = await getSsmData();
  const startDate = DateTime.fromFormat(entry.Date, ssmData.dateFormat, { zone: 'utc' });
  const startTime = DateTime.fromFormat(entry.From, TIME_FORMAT, { zone: 'utc' });
  const started = startDate.plus(Duration.fromObject({ hours: startTime.hour, minutes: startTime.minute }));

  return { note, started, duration, person: entry.Employment };
}

export interface TransformResult {
  valid: ValidSyncRecord[];
  invalid: InvalidSyncRecord[];
}

export default async function* transformRecords(
  projectKey: string,
  entries: IndividualEntry[]
): ProgressBarEvents<TransformResult> {
  const valid: ValidSyncRecord[] = [];
  const invalid: InvalidSyncRecord[] = [];

  for (let entry of entries) {
    yield {
      type: 'progress',
      text: `[${entry.Date}] "${entry.Note}" - ${entry.Employment}`,
    };

    const transformed = await transformRecord(entry);

    if (!transformed.note.valid) {
      invalid.push(transformed as InvalidSyncRecord);
    } else if (!transformed.note.key.startsWith(projectKey)) {
      const note = transformed.note.note;
      const error = new Error(
        [
          'Mismatched project',
          note,
          `Expected issue for project ${projectKey}, found issue key ${transformed.note.key}`,
        ].join('\n')
      );

      invalid.push({ ...transformed, note: { valid: false, note, error } });
    } else {
      valid.push(transformed as ValidSyncRecord);
    }
  }

  if (invalid.length > 0) {
    yield {
      type: 'warning',
      text: `Found ${invalid.length} invalid records that will be skipped from synchronization`,
    };
  }

  return { valid, invalid };
}
