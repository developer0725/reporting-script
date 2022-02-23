import { Workbook, Worksheet, Fill } from 'exceljs';
import { Duration } from 'luxon';

import { DURATION_FORMAT } from '../../formats';

import { JiraRecords } from './get-jira-data';
import { ValidMonthlyRecord } from './record';

declare module 'exceljs' {
  export interface WorksheetOutlineProperties {
    summaryBelow: boolean;
    summaryRight: boolean;
  }

  export interface WorksheetProperties {
    outlineProperties: Partial<WorksheetOutlineProperties>;
  }
}

type ProjectRecords = Map<string, Map<string, ValidMonthlyRecord[]>>;
type IssueRecords = Map<string, ValidMonthlyRecord[]>;

const FILLS: Array<() => Fill> = [
  () => ({
    type: 'pattern',
    pattern: 'solid',
    fgColor: {
      theme: 8,
      tint: 0.4,
    },
  }),
  () => ({
    type: 'pattern',
    pattern: 'solid',
    fgColor: {
      theme: 8,
      tint: 0.6,
    },
  }),
  () => ({
    type: 'pattern',
    pattern: 'solid',
    fgColor: {
      theme: 8,
      tint: 0.6,
    },
  }),
  () => ({
    type: 'pattern',
    pattern: 'solid',
    fgColor: {
      theme: 8,
      tint: 0.8,
    },
  }),
];

class WorkbookGenerator {
  private worksheet: Worksheet;
  private issues: JiraRecords;

  constructor(projectName: string, issues: JiraRecords) {
    const workbook = new Workbook();
    this.worksheet = workbook.addWorksheet(projectName);
    this.issues = issues;
  }

  async generate(projectData: ProjectRecords): Promise<Buffer> {
    // summary rows are above other rows
    this.worksheet.properties.outlineProperties = { summaryBelow: false };

    // generate rows
    this.applyProject(projectData);

    // set column widths
    this.worksheet.getColumn('A').width = 11;
    this.worksheet.getColumn('B').width = 70;
    this.worksheet.getColumn('C').width = 40;
    this.worksheet.getColumn('D').width = 50;
    this.worksheet.getColumn('E').width = 20;
    this.worksheet.getColumn('F').width = 20;
    this.worksheet.getColumn('G').width = 16;

    // save
    const workbook = this.worksheet.workbook;
    return (await workbook.xlsx.writeBuffer()) as Buffer;
  }

  private padContents(level: number, contents: any[]): any[] {
    const padded = Array(7).fill('');
    padded.splice(level, contents.length, ...contents);
    return padded;
  }

  private createRow(level: number, type: 'header' | 'footer' | 'body', contents: any[]) {
    const row = this.worksheet.addRow(this.padContents(level, contents));
    row.outlineLevel = level;
    row.hidden = level != 0;

      row.eachCell((cell, columnNumber) => {
        cell.fill = FILLS[Math.min(columnNumber - 1, level)]();
  
        switch (type) {
          case 'header':
            if (columnNumber - 1 >= level) {
              cell.font = { bold: true };
              cell.border = { bottom: { style: 'thin' } };
            }
            break;
          case 'footer':
            if (columnNumber - 1 >= level) {
              cell.font = { bold: true };
              cell.border = { top: { style: 'thin' } };
            }
            break;
          case 'body':
            break;
        }
      });
   
    return row;
  }

  private applyProject(projectData: ProjectRecords) {
    // header
    this.createRow(0, 'header', [
      'Issue',
      'Description',
      'Project',
      'Tracked Hours',
      'Credited Hours',
      'Credited Hours Reason',
      'Chargable Hours',
    ]);

    // durations
    let trackedDuration = Duration.fromMillis(0);
    let creditedDuration = Duration.fromMillis(0);
    let uncreditedDuration = Duration.fromMillis(0);

    // body rows
    for (let [key, data] of projectData.entries()) {
      const durations = this.applyIssue(key, data);
      trackedDuration = trackedDuration.plus(durations.trackedDuration);
      creditedDuration = creditedDuration.plus(durations.creditedDuration);
      uncreditedDuration = uncreditedDuration.plus(durations.uncreditedDuration);
    }

    // footer
    this.createRow(0, 'footer', [
      '',
      'Total',
      '',
      trackedDuration.toFormat(DURATION_FORMAT),
      creditedDuration.toFormat(DURATION_FORMAT),
      '',
      uncreditedDuration.toFormat(DURATION_FORMAT),
    ]);
  }

  private applyIssue(key: string, people: IssueRecords) {
    const data = this.issues[key];
    // summary row
    const summaryRow = this.createRow(0, 'body', [key, data.title, data.epicName, '', '', data.creditHoursReason, '']);

    // header row
    this.createRow(1, 'header', ['Person', '', 'Tracked Duration']);

    // durations
    let trackedDuration = Duration.fromMillis(0);

    // body rows
    for (let [person, entries] of people.entries()) {
      const personDuration = this.applyPerson(person, entries);
      trackedDuration = trackedDuration.plus(personDuration);
    }

    // footer row
    this.createRow(1, 'footer', ['Total', '', trackedDuration.toFormat(DURATION_FORMAT)]);

    // durations
    const creditedDuration: Duration = data.totalCreditHours === 'all' ? trackedDuration : data.totalCreditHours!;
    const uncreditedDuration = trackedDuration.minus(creditedDuration);

    // update summary row
    summaryRow.getCell(4).value = trackedDuration.toFormat(DURATION_FORMAT);
    summaryRow.getCell(5).value = creditedDuration.toFormat(DURATION_FORMAT);

    if (uncreditedDuration.valueOf() < 0) {
      summaryRow.getCell(7).value = '-' + uncreditedDuration.negate().toFormat(DURATION_FORMAT);
    } else {
      summaryRow.getCell(7).value = uncreditedDuration.toFormat(DURATION_FORMAT);
    }

    return { trackedDuration, creditedDuration, uncreditedDuration };
  }

  private applyPerson(person: string, entries: ValidMonthlyRecord[]) {
    // summary row
    const summaryRow = this.createRow(1, 'body', [person, '']);

    // header row
    this.createRow(3, 'header', ['Description', 'Date', 'Tracked Duration']);

    // duration
    let duration = Duration.fromMillis(0);

    // body rows
    for (let entry of entries) {
      this.createRow(3, 'body', [
        entry.description,
        entry.date.isValid ? entry.date.toJSDate() : '',
        entry.date.isValid ? entry.duration.toFormat(DURATION_FORMAT) : ''
      ]);
      duration = duration.plus(entry.duration);
    }

    // footer row
    this.createRow(3, 'footer', ['', 'Total', duration.toFormat(DURATION_FORMAT)]);

    // update summary row
    summaryRow.getCell(4).value = duration.toFormat(DURATION_FORMAT);

    return duration;
  }
}

async function createValidRecordsWorkbook(project: string, jira: JiraRecords, ssm: ProjectRecords) {
  return await new WorkbookGenerator(project, jira).generate(ssm);
}

export default createValidRecordsWorkbook;
