import {ProjectKeys} from '../../helpers/prepare';
import {ProgressBarEvents, RemoteTask} from '../../helpers/tasktree';
import {CombinedDailyOptions as Options} from './index';
import {isMainThread, parentPort} from "worker_threads";
import * as Comlink from 'comlink';
import nodeEndpoint from 'comlink/dist/umd/node-adapter';
import {GlobalOptions} from "../..";
import axios, {AxiosError} from "axios";
import _ from "lodash";
import {ActivityRecord, InvalidRecord, ValidRecord} from "../../helpers/get-scrin-activity";
import "../../helpers/tasktree";
import {setGlobals} from "../../helpers/global-options";
import getJiraSearchResults, {JiraSearchRecords, JiraSearchRequest} from "../../helpers/get-jira-search-results";
import {DailyProjectWorker} from "./handler";
import {DateTime, Duration} from "luxon";

type JiraFields = { summary: string, issuetype: { name:string } }
type JiraRecord = { summary: string, issuetype: string}

type WebHookRecord = {
    date: string,
    employment: string,
    employmentId: number,
    project: string,
    duration: string,
    note: string,
    error: string
}

function instanceOfValidRecord(record: ActivityRecord): record is ValidRecord {
    return 'valid' in record && 'key' in record && record.valid;
}

function instanceOfInvalidRecord(record: ActivityRecord): record is InvalidRecord {
    return 'valid' in record && 'error' in record && !record.valid;
}

function isEpicRecord(jiraRecord: JiraRecord): boolean {
    return jiraRecord.issuetype.toLowerCase() == 'epic';
}

function transformWebHookRecord(record: InvalidRecord): WebHookRecord {
    return ({
        date: DateTime.fromSeconds(record.from).toFormat('MM/dd/yyyy'),
        employment: record.employment,
        employmentId: record.employmentId,
        project: record.project,
        duration: Duration.fromObject({seconds:record.to-record.from}).toFormat('hh:mm:ss'),
        note: record.note,
        error: record.error.message
    }) as WebHookRecord;
}

function sendInvalidRecord(webhook: string, records: InvalidRecord[]) {
    const result: WebHookRecord[] = records.map(transformWebHookRecord);
    const json = JSON.stringify({ total: result.length, records:result });

    axios.post(webhook, json, {
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

async function getJiraRecords(projectKey: string, scrinRecords: ValidRecord[]):Promise<JiraSearchRecords<JiraRecord>> {
    if (scrinRecords.length === 0) {
        return {};
    }

    const keys = _(scrinRecords).map('key').uniq().join(', ');

    const request:JiraSearchRequest<JiraFields, ['renderedFields']> = {
        expand: ['renderedFields'],
        jql: `project = ${projectKey} AND key in (${keys})`,
        fields: ['summary', 'issuetype'],
        validateQuery: 'warn',
    };

    return await getJiraSearchResults(request, (issue) => ({summary: issue.fields.summary, issuetype: issue.fields.issuetype.name} as JiraRecord));
}

async function* invalidateRecords(projectKey:string, records: ActivityRecord[]): ProgressBarEvents<InvalidRecord[]> {
    const invalidRecords: InvalidRecord[] = [];

    yield {type: "log", text: `Fetching issues from Jira Cloud`};

    const validRecords: ValidRecord[] = records.filter(instanceOfValidRecord).map(record=>record as ValidRecord);
    const jiraRecords: JiraSearchRecords<JiraRecord> = await getJiraRecords(projectKey, validRecords);

    for (let record of records) {
        yield {type: "progress", text: `${record.note}`};

        let invalidRecord:ActivityRecord = record;
        if (instanceOfValidRecord(record)) {
            const issue = jiraRecords[record.key];
            if (issue == undefined) {
                invalidRecord = { ...record, valid:false, error:new Error('issueKey doesn\'t exist in Jira Cloud')} as InvalidRecord;
            }else {
                if (record.description == '' && !isEpicRecord(issue)) {
                    invalidRecord = { ...record, valid:false, error:new Error('Description should not empty')} as InvalidRecord;
                } else if (record.description != '' && isEpicRecord(issue)) {
                    invalidRecord = { ...record, valid:false, error:new Error('Epic Description should empty')} as InvalidRecord;
                }
            }
        }

        if (instanceOfInvalidRecord(invalidRecord)) {
            invalidRecords.push(invalidRecord);

            const dateStr = DateTime.fromSeconds(invalidRecord.from).toLocaleString(DateTime.DATETIME_FULL);
            const durationStr = Duration.fromObject({seconds:invalidRecord.to-invalidRecord.from}).toISOTime({suppressSeconds:true});
            yield {
                type: "warning",
                text: `[${invalidRecord.employment}:${invalidRecord.employmentId}]-[${dateStr}]-[${durationStr}]-[${invalidRecord.project}]-[${invalidRecord.note}]-[${invalidRecord.error.message}]`};
        }
    }

    if (invalidRecords.length==0) {
        yield {type: "log", text: `There is no invalid activity`};
    }

    return invalidRecords;
}

async function project(options: Options, projectKey: string, records: ActivityRecord[], projectKeys: ProjectKeys, task: RemoteTask) {
    setGlobals(options);
    if (!(projectKey in projectKeys.ssm)) {
        await task.markFailed('This project does not exist in Scrin');
        return;
    }

    if (!projectKeys.jira.includes(projectKey)) {
        await task.markFailed('This project does not exist in Jira Cloud');
        return;
    }

    if (!projectKeys.confluence.includes(projectKey)) {
        await task.markFailed('This project does not have a corresponding Space in Confluence');
        return;
    }

    try {
        const invalidRecords = await task.add(`Validating: ${records.length} activities`).then(t =>
            t.wrap(invalidateRecords(projectKey, records), records.length, 'activities'));

        if (invalidRecords.success && invalidRecords.value.length >0){
            const webhooks = options["integromat-report-webhooks"];
            await task
                .add(`Sending invalid activities to Integromat`)
                .then((t) => t.wrap(Promise.all(webhooks.map(url=>sendInvalidRecord(url, invalidRecords.value)))));
        }
    } catch (error) {

    }
}

export default function wrapProjectHandler<T extends GlobalOptions>(fn: DailyProjectWorker<T>) {
    return async function (options: T, projectKey: string, records: ActivityRecord[], projectKeys: ProjectKeys, task: RemoteTask) {
        try {
            return await fn(options, projectKey, records, projectKeys, task);
        } catch (error) {
            if ((error as AxiosError).isAxiosError) {
                throw Object.assign(new Error(error.message), {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                    config: _.pick(error.config, [
                        'auth',
                        'baseURL',
                        'data',
                        'headers',
                        'method',
                        'params',
                        'responseType',
                        'timeout',
                        'url',
                    ]),
                    response: _.pick(error.response, ['data', 'status', 'statusText', 'headers']),
                });
            }
            throw error;
        }
    };
}

if (!isMainThread) {
    Comlink.expose(wrapProjectHandler(project), nodeEndpoint(parentPort!));
}