import { Workbook } from 'exceljs';

import { DURATION_FORMAT } from '../../formats';
import { ParseError } from '../../helpers/note-parser/error';

import { InvalidMonthlyRecord } from './record';

function getInvalidReason(record: InvalidMonthlyRecord) {
  switch (record.invalid) {
    case 'duration':
      return 'Invalid duration value in Jira Cloud';
    case 'not-found':
      return 'Screenshot Monitor record could not be matched to any issue from Jira Cloud';
    case 'note':
      if (record.error instanceof ParseError) {
        return `Screenshot Monitor record has an invalid note value: ${record.error.originalMessage}`;
      } else {
        return `Screenshot Monitor record has an invalid note value: ${record.error.message}`;
      }
  }
}

async function createInvalidRecordsWorkbook(invalidRecords: InvalidMonthlyRecord[]) {
  const workbook = new Workbook();
  const worksheet = workbook.addWorksheet('Invalid Records');
  worksheet.columns = [
    { header: 'Date', key: 'date', width: 10 },
    { header: 'Employment', key: 'person', width: 25 },
    { header: 'Project', key: 'project', width: 10 },
    { header: 'Duration', key: 'duration', width: 10 },
    { header: 'Note', key: 'note', width: 70 },
    { header: 'Invalid Reason', key: 'reason', width: 70 },
  ];

  worksheet.addRows(
    invalidRecords.map((record) => ({
      date: record.date.toJSDate(),
      person: record.person,
      project: record.project,
      note: record.note,
      duration: record.invalid === 'duration' ? record.duration : record.duration.toFormat(DURATION_FORMAT),
      reason: getInvalidReason(record),
    }))
  );

  worksheet.getRow(1).font = { bold: true };

  return (await workbook.xlsx.writeBuffer()) as Buffer;
}

export default createInvalidRecordsWorkbook;
