import path from "path";
import { promises as fs } from "fs";
import { intersection } from "lodash";
import { DateTime } from "luxon";
import util from "util";
import { Arguments, Argv } from "yargs";
import { TaskTree } from "tasktree-cli";
import * as Comlink from "comlink";
import nodeEndpoint from "comlink/dist/umd/node-adapter";
import { Worker } from "worker_threads";

import { CombinedSupportMailJiraOptions as Options } from "./index";
import { setGlobals } from "../helpers/global-options";
import { RemoteTask } from "../helpers/tasktree";
import { getJiraProjects } from "../helpers/prepare";
import { getMails } from "../mails/project";
import { getMailsCommandIssues } from "../reports/weekly/get-jira-issues";
import { GroupRequest } from "./project";
import { Task } from "tasktree-cli/lib/Task";

async function getGroupRequest<T extends Options>(options: T, task: Task): Promise<GroupRequest> {
  const jiraProjects = await task
    .add("Fetching projects.")
    .wrap(getJiraProjects());
  const projects = options.projects.length > 0 ? options.projects : [];
  const selected = intersection(projects, jiraProjects).map((key) => key.toUpperCase());

  const issues = await task
    .add("Fetching issues.")
    .wrap(getMailsCommandIssues(selected, options.exceptLabels));
  const emails = await task.add("Fetching emails.").wrap(getMails());

  return { issues, emails };
}

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
    const task = TaskTree.add(taskName);
    try {
      setGlobals(options);
      const preparing = task.add("Preparing");
      const groupRequest = await preparing.wrap(getGroupRequest(options, preparing));

      const groupTask = (task.add("Grouping issues and emails.") as unknown) as RemoteTask;
      const projectWorker = Comlink.wrap<(groupRequest: GroupRequest, options: Options, groupTask: RemoteTask) => Promise<void>>(nodeEndpoint(new Worker(workerPath, {
        execArgv: ["--require", "source-map-support/register"],
      })));
      try {
        await groupTask.wrap(projectWorker(groupRequest, options, groupTask));
      } finally {
        projectWorker[Comlink.releaseProxy]();
      }

      task.markCompleted();
    } catch (error) {
      task.markFailed();
      await fs.writeFile(path.join(options.output, `error-${DateTime.utc().toISODate()}.txt`), util.inspect(error, { depth: null }));
      throw error;
    } finally {
      TaskTree.tree().stop();
    }
  };
}
