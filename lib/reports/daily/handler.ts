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

import prepare, {ProjectKeys} from "../../helpers/prepare";
import { RemoteTask } from "../../helpers/tasktree";
import {ActivityRecord, fetchScrinRecords, TimeInterval} from '../../helpers/get-scrin-activity';
import { GlobalOptions, setGlobals} from '../../helpers/global-options';
import {CombinedDailyOptions as Options} from "./index";
import "../../helpers/tasktree";


export type DailyProjectWorker<T extends GlobalOptions> = (
    options: T,
    projectKey: string,
    records: ActivityRecord[],
    projectKeys: ProjectKeys,
    task: RemoteTask
) => Promise<Error | void>;

export default function workerHandler<T extends Options>(workerPath: string, taskName: string) {
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

            const scrinRecords: ActivityRecord[] = await task
                .add("Fetching activities from Scrin")
                .wrap(
                    fetchScrinRecords(TimeInterval.TODAY, projectKeys.selected)
                );
            if (scrinRecords.length === 0) {
                task.warn('There are no activities for selected projects in Scrin');
            } else {
                const projectsTask = task.add("Validating activities");
                const grouped = group(scrinRecords, (record) => record.group);
                for (let projectKey of projectKeys.selected) {
                    const projectTask = (projectsTask.add(
                        `Project ${projectKey}`
                    ) as unknown) as RemoteTask;
                    const records = grouped.get(projectKey);
                    if (records && records.length > 0) {
                        const projectWorker = Comlink.wrap<DailyProjectWorker<T>>(
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
                        }
                    } else {
                        const projectResultTask = await projectTask.add(`There is no activity`);
                        await projectResultTask.markCompleted();
                        await projectTask.markCompleted();
                    }
                }
                projectsTask.markCompleted();
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

