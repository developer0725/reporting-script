import path from "path";
import { promises as fs } from "fs";
import { Worker } from "worker_threads";
import util from "util";

import { DateTime } from "luxon";
import { Arguments, Argv } from "yargs";
import * as Comlink from "comlink";
import nodeEndpoint from "comlink/dist/umd/node-adapter";
import { TaskTree } from "tasktree-cli";
import { group } from "d3-array";

import { CombinedSetProjectOptions as Options } from "./index";
import { EmploymentActivity, getActivities } from "./ssm-activity";
import { getCommonData, getSsmData, GlobalOptions, setGlobals } from "../helpers/global-options";
import parseNote, { InvalidNote, ValidNote } from "../helpers/note-parser";
import prepare, {ProjectKeys} from "../helpers/prepare";
import { RemoteTask } from "../helpers/tasktree";
import {saveInvalid, sendSlackReport} from "./output";
import { TimeSpan } from "../helpers/get-ssm-report";

export type ValidRecord = EmploymentActivity &
  ValidNote & { employment: string, project: string };
export type InvalidRecord = EmploymentActivity &
  InvalidNote & { employment: string, project: string };

export type ProjectWorker<T extends GlobalOptions> = (
  options: T,
  projectKey: string,
  records: ValidRecord[],
  projectKeys: ProjectKeys,
  task: RemoteTask
) => Promise<Error | void>;

function transformRecord(
    entry: EmploymentActivity,
    project: string,
    employment: string
): ValidRecord | InvalidRecord | null {
  if (entry.projectId != null) {
    let error: Error;
    if (project) {
      if (entry.note.trim().startsWith(project)) {
        return null;
      }
      error = new Error("Mismatching Project and IssueKey");
    } else {
      error = new Error("Project doesn't exist in SSM");
    }
    return {...entry, ...parseNote(entry.note), error: error, valid: false, employment:employment, project:project} as InvalidRecord;
  }

  return {...entry, ...parseNote(entry.note), employment:employment, project:project} as InvalidRecord | ValidRecord ;
}

async function fetchSsmRecords(time: TimeSpan) {
  const commonData = await getCommonData();
  const targetCompany = commonData.companies.find(
    (company: any) => company.id === commonData.currentCompanyId
  );
  const projects = targetCompany ? Object.fromEntries(targetCompany.projects.map(project => [project.id, project.name.toUpperCase()])) : {};
  const employments = targetCompany ? Object.fromEntries(targetCompany.employments.map(employment => [employment.id, employment.name])) : {};
  const ssm = await getActivities(Object.keys(employments), time);

  return ssm.reduce((result, entry)=>{
    const record = transformRecord(entry, entry.projectId && projects[entry.projectId] ? projects[entry.projectId] : 'non-project', employments[entry.employmentId])
    if (record){
      result.push(record);
    }
    return result;
  },[] as (ValidRecord | InvalidRecord)[]);
}

export default function workerHandler<T extends Options>(
  workerPath: string,
  taskName: string
) {
  return async function handler(argv: Arguments<T>): Promise<void> {

    TaskTree.tree().start();

    // - the typings for command modules are incorrect
    // - `yargs.command(...)` will pass the full `Argv` object, which cannot be sent through
    //   Comlink
    // - force cast to get the plain options object
    const args = ((argv as unknown) as Argv<T>).argv;

    // - further, it appears that a generic object type (e.g. `T extends GlobalOptions`) causes
    //   type inference issues with Comlink's `UnproxyOrClone` type
    // - thus, explicitly cast `Arguments<T>` to that wrapper type
    const options = args as Comlink.UnproxyOrClone<Arguments<T>>;
    try {
      setGlobals(options);
      const task = TaskTree.add(taskName);
      const preparing = task.add("Preparing");
      const projectKeys = await preparing.wrap(prepare(options, preparing));

      const ssmData = await getSsmData();
      const started = DateTime.fromSeconds(ssmData.now).set({hour: 0, minute: 0, second: 0});
      const time: TimeSpan = options.days > 0 ? {
        from: started.minus({ days: options.days }),
        to: started.plus({ days: 1 })
      } : options.time.toLocaleLowerCase() as TimeSpan;
      const ssm = await task
        .add("Fetching activities from Screenshot Monitor")
        .wrap(
          fetchSsmRecords(time)
        );

      const formatTask = task.add("Checking description format for activities");
      const validRecords = ssm.filter((r) => r && r.valid) as ValidRecord[];
      const invalidRecords = ssm.filter((r) =>r && !r.valid) as InvalidRecord[];
      let slackLogs:string[] = [];
      if (invalidRecords.length > 0) {
        const empGrouped = group(invalidRecords, (record) => record.employmentId);
        for (const [,errors] of empGrouped) {
          const employmentTask = formatTask.add(errors[0].employment);
          for (const record of errors) {
            const fromDateTime = DateTime.fromSeconds(record.from, {zone: "utc"});
            const duration = DateTime.fromSeconds(record.to).diff(DateTime.fromSeconds(record.from));
            employmentTask.warn(`${record.error.message.split('\n')[0]}:[${record.project}]-[${fromDateTime.toLocaleString(DateTime.DATETIME_FULL)}]-[${duration.toISOTime({suppressSeconds:true})}]-[${record.note}]-[${record.employment}]`);

          }
          employmentTask.markCompleted();
        }
        slackLogs.push(formatTask.simpleRender());
        await formatTask
          .add(`Saving invalid activities to disk`)
          .wrap(saveInvalid(invalidRecords, options.output, started));
      }
      formatTask.markCompleted();

      const projectsTask = task.add("Starting to set project to activities");
      const grouped = group(validRecords, (record) => record.key.split("-")[0]);
      for (let projectKey of projectKeys.selected) {
        const projectTask = (projectsTask.add(
          `Project ${projectKey}`
        ) as unknown) as RemoteTask;
        const records = grouped.get(projectKey);
        if (records && records.length > 0) {
          const projectWorker = Comlink.wrap<ProjectWorker<T>>(
            nodeEndpoint(
              new Worker(workerPath, {
                execArgv: ["--require", "source-map-support/register"],
              })
            )
          );

          try {
            await projectTask.wrap<Error | void>(
              projectWorker(
                options,
                projectKey,
                records,
                projectKeys,
                projectTask
              )
            );
          } finally {
            projectWorker[Comlink.releaseProxy]();
            slackLogs.push(await projectTask.simpleRender());
          }
        } else {
          projectTask.log(
            "There are nothing  valid activities missing project."
          );
          projectTask.markCompleted();
        }
      }
      projectsTask.markCompleted();

      if (slackLogs.length > 0){
        await task
            .add("sending log to reports channel on Slack")
            .wrap(sendSlackReport(slackLogs));
      }
      task.markCompleted();
    } catch (error) {
      await fs.writeFile(
        path.join(options.output, `error-${DateTime.utc().toISODate()}.txt`),
        util.inspect(error, { depth: null })
      );
      throw error;
    } finally {
      TaskTree.tree().stop();
    }
  };
}
