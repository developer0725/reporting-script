import { ProgressBarEvent, RemoteTask } from "../helpers/tasktree";
import { DateTime } from "luxon";
import { group } from "d3-array";
import _ from "lodash";
import { promises as fs } from "fs";
import path from "path";
import { InvalidRecord } from "./handler";
import { TaskStatus } from "tasktree-cli/lib/Task";
import { createPage, updatePage } from "../helpers/confluence";
import { ProjectKeys } from "../helpers/prepare";
import {IncomingWebhook, IncomingWebhookSendArguments} from "@slack/webhook";
import config from "../../configs/reports/monthly.json";

export async function saveInvalid(
  records: InvalidRecord[],
  output: string,
  started: DateTime
) {
  function replacer(key: string, value: any) {
    if (key === "error") {
      return (value as Error).message;
    } else {
      return value;
    }
  }
  const data = JSON.stringify(records, replacer, 2);

  const name = `Invalid Notes`;
  const filename = `set_project_${_.kebabCase(
    name
  )}_${started.toISODate()}.json`;
  await fs.writeFile(path.join(output, filename), data);
}

export async function saveEvents(
  key: string,
  events: ProgressBarEvent[],
  output: string,
  started: DateTime
) {
  const grouped = group(events, (event) => event.type);

  const summary = grouped.get("log") ?? [];
  if (summary.length > 0) {
    const data = summary.map((line) => line.text).join("\n");
    const filename = `set_project_${_.kebabCase(
      key
    )}-summary_${started.toISODate()}.txt`;
    await fs.writeFile(path.join(output, filename), data);
  }

  const warnings = grouped.get("warning") ?? [];
  if (warnings.length > 0) {
    const data = warnings.map((line) => line.text).join("\n");
    const filename = `set_project_${_.kebabCase(
      key
    )}-warnings_${started.toISODate()}.txt`;
    await fs.writeFile(path.join(output, filename), data);
  }

  const log = grouped.get("progress") ?? [];
  if (log.length > 0) {
    const data = log.map((line) => line.text).join("\n");
    const filename = `set_project_${_.kebabCase(
      key
    )}-log_${started.toISODate()}.txt`;
    await fs.writeFile(path.join(output, filename), data);
  }
}

export async function createLogPage(
  projectKey: string,
  projectKeys: ProjectKeys,
  projectTask: RemoteTask,
  task: RemoteTask,
  status: TaskStatus
) {
  const started = DateTime.utc();

  if (!projectKeys.confluence.includes(projectKey)) {
    await task.markFailed(
      "This project does not have a corresponding Space in Confluence"
    );
    return;
  }

  const { id: pageId } = await task
    .add("Creating log page for time-tracking command on Confluence")
    .then((task) =>
      task.wrap(createPage({ type: "Command", started, key: projectKey }))
    );

  const log = await projectTask.simpleRender();
  await task
    .add("Updating Confluence page")
    .then((update) =>
      update.wrap(updatePage(pageId, { started, log, status }))
    );
}

export async function sendSlackReport(logs:string[]) {
  const message: IncomingWebhookSendArguments = {
    text: logs.join('\n'),
  };

  await new IncomingWebhook(config["slack-valid-report-webhooks"][0]).send(
      message
  );
}
