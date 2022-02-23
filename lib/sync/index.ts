import path from "path";
import { Argv } from "yargs";
import { GlobalOptions, OPTION_GROUP_OPTIONS } from "..";
import createHandler from "../helpers/create-handler";
import config from "../../configs/sync.json";

export const command = "sync";
export const describe =
  "Synchronize records from Screenshot Monitor to Jira Cloud";

interface SyncOptions {
  days: number;
}

export interface CombinedSyncOptions extends GlobalOptions, SyncOptions {}

export function builder(yargs: Argv<GlobalOptions>): Argv<CombinedSyncOptions> {
  return yargs
    .describe("output", "A directory to save sync logs and invalid records to")
    .options({
      days: {
        alias: "d",
        demandOption: false,
        default: 30,
        describe: "days for syncing",
        type: "number",
        group: OPTION_GROUP_OPTIONS,
      }
    })
    .config(config);
}

export const handler = createHandler(
  path.join(__dirname, "project.js"),
  "Synchronizing Screenshot Monitor records to Jira Cloud"
);
