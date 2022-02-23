import { isMainThread, parentPort } from "worker_threads";

import * as Comlink from "comlink";
import nodeEndpoint from "comlink/dist/umd/node-adapter";
import { group } from "d3-array";
import _ from "lodash";
import { DateTime } from "luxon";

import { CombinedSetProjectOptions as Options } from "./index";
import { ProjectWorker, ValidRecord } from "./handler";
import { ProjectKeys } from "../helpers/prepare";
import {
  ProgressBarEvent,
  ProgressBarEvents,
  RemoteTask,
} from "../helpers/tasktree";
import "../helpers/tasktree"; // patch comlink and tasktree-cli
import {
  atlassianClient,
  GlobalOptions,
  setGlobals,
} from "../helpers/global-options";
import { splitActivity, SplitActivityRequest } from "./ssm-activity";
import { AxiosError } from "axios";
import { issueUrl } from "../urls";
import { createLogPage, saveEvents } from "./output";
import { TaskStatus } from "tasktree-cli/lib/Task";

async function isJiraIssue(issueKey: string) {
  try {
    const response = await atlassianClient().get(issueUrl(issueKey));
    return response && response.status == 200;
  } catch (e) {
    return false;
  }
}

async function* matchProject(
  issueKey: string,
  projectId: string,
  activities: ValidRecord[]
): ProgressBarEvents {
  const isValidIssue = await isJiraIssue(issueKey);
  if (!isValidIssue) {
    yield {
      type: "progress",
      ticks: 0,
      text: `non-exist issue on Jira Cloud:[${issueKey}]`,
    };
    yield {
      type: "warning",
      text: `non-exist issue on Jira Cloud:[${issueKey}]`,
    };
  } else {
    yield {
      type: "progress",
      ticks: 0,
      text: `exist issue on Jira Cloud:[${issueKey}]`,
    };
  }
  for (let activity of activities) {
    if (isValidIssue) {
      yield {
        type: "progress",
        text: `setting [${activity.note}]`,
      };
      const activityRequest: SplitActivityRequest = {
        id: activity.id,
        items: [
          {
            id: activity.id,
            from: activity.from,
            to: activity.to,
            note: activity.note,
            projectId: projectId,
          },
        ],
      };
      await splitActivity(activityRequest);
      const fromDateTime = DateTime.fromSeconds(activity.from, {zone: "utc"});
      const duration = DateTime.fromSeconds(activity.to).diff(DateTime.fromSeconds(activity.from));
      yield {
        type: "log",
        text: `setting [${activity.employment}]-[${fromDateTime.toLocaleString(DateTime.DATETIME_FULL)}]-[${duration.toISOTime({suppressSeconds:true})}]-[${activity.note}]`,
      };
    } else {
      yield {
        type: "progress",
        text: `skipping [${activity.note}]`,
      };
      yield {
        type: "warning",
        text: `skipping [${activity.employment}]-[${DateTime.fromSeconds(
          activity.from,
          {
            zone: "utc",
          }
        ).toLocaleString(DateTime.DATE_SHORT)}]-[${DateTime.fromSeconds(
          activity.from,
          {
            zone: "utc",
          }
        ).toLocaleString(
          DateTime.TIME_24_WITH_SHORT_OFFSET
        )}]-[${DateTime.fromSeconds(activity.to, {
          zone: "utc",
        }).toLocaleString(DateTime.TIME_24_WITH_SHORT_OFFSET)}]-[${
          activity.note
        }]`,
      };
    }
  }
}

async function project(
  options: Options,
  projectKey: string,
  records: ValidRecord[],
  projectKeys: ProjectKeys,
  projectTask: RemoteTask
) {
  const started = DateTime.utc();
  setGlobals(options);

  if (!(projectKey in projectKeys.ssm)) {
    await projectTask.markFailed(
      "This project does not exist in Screenshot Monitor"
    );
    return;
  }

  if (!projectKeys.jira.includes(projectKey)) {
    await projectTask.markFailed("This project does not exist in Jira Cloud");
    return;
  }

  let projectEvents: ProgressBarEvent[] = [];
  const grouped = group(records, (r) => r.key);
  for (let [issueKey, activities] of grouped) {
    const { events } = await projectTask
      .add(`Issue ${issueKey}`)
      .then((task) =>
        task.wrap(
          matchProject(issueKey, projectKeys.ssm[projectKey], activities),
          activities.length,
          "activities"
        )
      );
    projectEvents = projectEvents.concat(events);
  }

  await projectTask
    .add("Saving logs setting project")
    .then((task) =>
      task.wrap(saveEvents(projectKey, projectEvents, options.output, started))
    );
}

export default function wrapProjectHandler<T extends GlobalOptions>(
  fn: ProjectWorker<T>
) {
  return async function (
    options: T,
    projectKey: string,
    records: ValidRecord[],
    projectKeys: ProjectKeys,
    projectTask: RemoteTask
  ) {
    let status = TaskStatus.Pending;
    try {
      status = TaskStatus.Completed;
      return await fn(options, projectKey, records, projectKeys, projectTask);
    } catch (error) {
      status = TaskStatus.Failed;
      if ((error as AxiosError).isAxiosError) {
        throw Object.assign(new Error(error.message), {
          message: error.message,
          stack: error.stack,
          name: error.name,
          config: _.pick(error.config, [
            "auth",
            "baseURL",
            "data",
            "headers",
            "method",
            "params",
            "responseType",
            "timeout",
            "url",
          ]),
          response: _.pick(error.response, [
            "data",
            "status",
            "statusText",
            "headers",
          ]),
        });
      }

      throw error;
    } finally {
      await projectTask
        .add("Creating log page in Confluence")
        .then((task) =>
          task.wrap(createLogPage(projectKey, projectKeys, projectTask, task, status))
        );
    }
  };
}

if (!isMainThread) {
  Comlink.expose(wrapProjectHandler(project), nodeEndpoint(parentPort!));
}
