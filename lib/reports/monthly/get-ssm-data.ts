import _ from 'lodash';
import { DateTime, Duration } from 'luxon';

import getReport, { IndividualEntry, TimeSpan } from '../../helpers/get-ssm-report';
import parseNote from '../../helpers/note-parser';

import { ValidMonthlyRecord, InvalidNoteMonthlyRecord } from './record';
import {getSsmData} from "../../helpers/global-options";

async function transformRecord(entry: IndividualEntry): Promise<ValidMonthlyRecord | InvalidNoteMonthlyRecord> {
  const ssmData = await getSsmData();
  const base = {
    project: entry.Project,
    person: entry.Employment,
    date: DateTime.fromFormat(entry.Date, ssmData.dateFormat, { zone: 'utc' }),
    duration: Duration.fromObject({ minutes: entry.Duration }),
    note: entry.Note,
  };

  const note = parseNote(entry.Note);
  if (note.valid) {
    return { ...base, ...note, invalid: false };
  } else {
    return { ...base, error: note.error, invalid: 'note' };
  }
}

async function fetchSsmRecords(projectId: string, timePeriod: TimeSpan) {
  const ssm = await getReport([projectId], [], timePeriod);
  return Promise.all(ssm.map(async entry => await transformRecord(entry)));
}

export default fetchSsmRecords;
