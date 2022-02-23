import { Argv } from "yargs";
import { GlobalOptions, OPTION_GROUP_OPTIONS } from "..";
import config from "../../configs/support-email-jira-rec.json";
import workerHandler from "./handler";
import path from "path";

interface SupportMailJiraOptions {
  exceptLabels: string[];
  maxMessageLength: number;
}

export const command = "support-email-jira-rec";
export const describe = "Group tickets and send notifications";

export interface CombinedSupportMailJiraOptions
  extends GlobalOptions,
    SupportMailJiraOptions {}

export function builder(
  yargs: Argv<GlobalOptions>
): Argv<CombinedSupportMailJiraOptions> {
  return yargs
    .default("projects", [], "empty projects")
    .options({
      exceptLabels: {
        demandOption: false,
        default: [],
        describe: "Labels expecting Jira issues",
        type: "array",
        group: OPTION_GROUP_OPTIONS,
        hidden: true,
      },
      maxMessageLength: {
        demandOption: false,
        default: 10000,
        describe: "set length limitation for a message in slack channel ",
        type: "number",
        group: OPTION_GROUP_OPTIONS,
        hidden: true,
      },
    })
    .config(config);
}

export const handler = workerHandler(
  path.join(__dirname, "project.js"),
  "Reconciliation of Outlook and Jira Cloud."
);
