import xlsx from 'xlsx';

import { EpicDetailEntry } from './project';

interface Row {
  'Epic Key': string | null;
  'Epic Title': string;
  'Open Tickets': number;
  'All Tickets': number;
  'Open Tickets Percentage': number;
}

export default async function generateReport(
  allTime: EpicDetailEntry[],
  recentlyUpdated: EpicDetailEntry[],
  projectKey: string
): Promise<Buffer> {
  const workbook = xlsx.utils.book_new();

  const allTimeSheet = xlsx.utils.json_to_sheet(allTime.map(toRow));
  setWidths(allTimeSheet);
  setFormats(allTimeSheet, allTime.length);

  const recentlyUpdatedSheet = xlsx.utils.json_to_sheet(recentlyUpdated.map(toRow));
  setWidths(recentlyUpdatedSheet);
  setFormats(recentlyUpdatedSheet, recentlyUpdated.length);

  xlsx.utils.book_append_sheet(workbook, allTimeSheet, `${projectKey} Epics - All Time`);
  xlsx.utils.book_append_sheet(workbook, recentlyUpdatedSheet, `${projectKey} Epics - This Month`);

  const buffer: Buffer = xlsx.write(workbook, { type: 'buffer' });
  return buffer;
}

function setWidths(worksheet: xlsx.WorkSheet) {
  worksheet['!cols'] = [{ width: 10 }, { width: 60 }, { width: 12 }, { width: 9 }, { width: 24 }];
}

function setFormats(worksheet: xlsx.WorkSheet, totalEntries: number) {
  const E = xlsx.utils.decode_col('E');
  for (let row = 1; row <= totalEntries; row += 1) {
    const address = xlsx.utils.encode_cell({ c: E, r: row });
    const cell = worksheet[address] as xlsx.CellObject;
    cell.z = '0.00%';
    xlsx.utils.format_cell(cell);
  }
}

function toRow(entry: EpicDetailEntry): Row {
  if (entry.key == null) {
    return {
      'Epic Key': '',
      'Epic Title': 'Tickets not linked to an epic',
      'Open Tickets': entry.open,
      'All Tickets': entry.total,
      'Open Tickets Percentage': entry.total === 0 ? 0 : entry.open / entry.total,
    };
  } else {
    return {
      'Epic Key': entry.key,
      'Epic Title': entry.title,
      'Open Tickets': entry.open,
      'All Tickets': entry.total,
      'Open Tickets Percentage': entry.total === 0 ? 0 : entry.open / entry.total,
    };
  }
}
