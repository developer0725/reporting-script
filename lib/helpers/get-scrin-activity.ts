import parseNote, {InvalidNote, ValidNote} from './note-parser';
import {DateTime} from 'luxon';
import {getCommonData, Projects, screenshotMonitorClient} from './global-options';
import {ACTIVITY_URL} from '../urls';

export enum TimeInterval {
    ALL_TIME = 'all-time',
    TODAY = 'today',
    YESTERDAY = 'yesterday',
    THIS_WEEK = 'this-week',
    LAST_WEEK = 'last-week',
    THIS_MONTH = 'this-month',
    LAST_MONTH = 'last-month',
    THIS_YEAR = 'this-year',
    LAST_YEAR = 'last-year'
}

export type TimeRange = {
    from: number;
    to: number;
}

export type TimeSpan = TimeInterval | TimeRange;

export type Activity = TimeRange & {
    id: string;
    note: string;
    projectId: string | null;
}

export type ActivityRequest = TimeRange & {
    employmentId: number | string;
}

export interface SplitActivityRequest {
    id: string;
    items: Activity[];
}

export type ActivityResponse = Activity & {
    employmentId: number;
    offline: boolean;
};

export type ValidRecord = ActivityResponse &
    ValidNote & { employment: string, project: string, group:string };

export type InvalidRecord = ActivityResponse &
    InvalidNote & { employment: string, project: string, group:string };

export type ActivityRecord = ValidRecord | InvalidRecord;

export function convertTimeRange(now: DateTime, time: TimeSpan): TimeRange {
    let from: DateTime, to: DateTime;
    switch (time) {
        case TimeInterval.ALL_TIME:
            from = DateTime.fromSeconds(0);
            to = now;
            break;
        case TimeInterval.TODAY:
            from = now.set({hour: 0, minute: 0, second: 0});
            to = from.plus({days: 1});
            break;
        case TimeInterval.YESTERDAY:
            to = now.set({hour: 0, minute: 0, second: 0});
            from = to.minus({days: 1});
            break;
        case TimeInterval.THIS_WEEK:
            from = now.set({weekday: 1, hour: 0, minute: 0, second: 0});
            to = from.plus({weeks: 1});
            break;
        case TimeInterval.LAST_WEEK:
            to = now.set({weekday: 1, hour: 0, minute: 0, second: 0});
            from = to.minus({weeks: 1});
            break;
        case TimeInterval.THIS_MONTH:
            from = now.set({day: 1, hour: 0, minute: 0, second: 0});
            to = from.plus({months: 1});
            break;
        case TimeInterval.LAST_MONTH:
            to = now.set({day: 1, hour: 0, minute: 0, second: 0});
            from = to.minus({months: 1});
            break;
        case TimeInterval.THIS_YEAR:
            from = now.set({month: 1, day: 1, hour: 0, minute: 0, second: 0});
            to = from.plus({years: 1});
            break;
        case TimeInterval.LAST_YEAR:
            to = now.set({month: 1, day: 1, hour: 0, minute: 0, second: 0});
            from = to.minus({years: 1});
            break;
        default:
            from = DateTime.fromSeconds(time.from);
            to = DateTime.fromSeconds(time.to);
    }
    return {from: from.toSeconds(), to: to.toSeconds()};
}

export async function fetchScrinRecords(time: TimeSpan, selectedProjects: string[]): Promise<ActivityRecord []> {
    const commonData = await getCommonData();
    const targetCompany = commonData.companies.find(
        (company: any) => company.id === commonData.currentCompanyId
    );
    const projects = targetCompany ? Object.fromEntries(targetCompany.projects.map(project => [project.id, project.name.toUpperCase()])) : {};
    const employments = targetCompany ? Object.fromEntries(targetCompany.employments.map(employment => [employment.id, employment.name])) : {};
    const activities: ActivityResponse[] = await getActivities(DateTime.fromSeconds(commonData.now), time, Object.keys(employments));

    const result: ActivityRecord [] = [];
    for (let activity of activities) {
        if (activity.projectId && Object.keys(projects).includes(activity.projectId)) {
            const activityRecord: ActivityRecord | null = transformActivity(activity, selectedProjects, projects, employments);

            if (activityRecord) {
                result.push(activityRecord);
            }
        }
    }

    return result;
}

function transformActivity(activity: ActivityResponse, selectedProjects: string[], projects: Projects, employments: { [key: string]: string }): ActivityRecord | null {
    let note: ValidNote | InvalidNote;
    let project: string = '', group: string = '';
    const employment = employments[activity.employmentId];

    if (activity.projectId == null) {
        project = 'non-project'
    } else if (Object.keys(projects).includes(activity.projectId)) {
        project = projects[activity.projectId];
    }

    if (selectedProjects.includes(project)) {
        group = project;
        note = parseNote(activity.note);
        if (instanceOfValidNote(note) && project != note.key.split('-')[0]) {
            note = {
                valid: false,
                note: activity.note,
                error: new Error("Mismatching Project and IssueKey")
            } as InvalidNote;
        }
    } else if (selectedProjects.includes(activity.note.split('-')[0])) {
        group = activity.note.split('-')[0];
        let message = "Mismatching Project and IssueKey";
        switch (project) {
            case '':
                message = "non-exist project";
                break;
            case 'non-project':
                message = "Project is missing.";
                break;
        }
        note = {valid: false, note: activity.note, error: new Error(message)} as InvalidNote;

    } else {
        return null;
    }

    return {...activity, ...note, employment, project, group} as ActivityRecord;
}

async function getActivities(now: DateTime, time: TimeSpan, employmentIds: string[]): Promise<ActivityResponse[]> {
    const timeRange: TimeRange = convertTimeRange(now, time);
    const activityRequests: ActivityRequest[] = employmentIds.map((employmentId) => ({
        employmentId,
        from: timeRange.from,
        to: timeRange.to,
    }));
    const response = await screenshotMonitorClient().post<ActivityResponse[]>(
        ACTIVITY_URL,
        activityRequests,
        {responseType: "json"}
    );

    return response.data;
}

function instanceOfValidNote(note: any): note is ValidNote {
    return 'valid' in note && note.valid;
}