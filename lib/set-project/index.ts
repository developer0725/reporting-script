import path from "path";

import { Argv } from "yargs";
import { GlobalOptions, OPTION_GROUP_OPTIONS } from "..";
import config from "../../configs/set-project.json";
import workerHandler from "./handler";

export const command = "set-project";
export const describe =
  "Set valid project based on description to non-project activities in Screenshot Monitor";

interface SetProjectOptions {
  days: number;
}

export interface CombinedSetProjectOptions
  extends GlobalOptions,
    SetProjectOptions {}

export function builder(
  yargs: Argv<GlobalOptions>
): Argv<CombinedSetProjectOptions> {
  return yargs
    .describe("output", "A directory to save logs and invalid records to")
    .options({
      days: {
        alias: "d",
        demandOption: false,
        default: -1,
        describe: "days for date range",
        type: "number",
        group: OPTION_GROUP_OPTIONS,
      },
    })
    .config(config);
}

export const handler = workerHandler(
  path.join(__dirname, "project.js"),
  "setting project to Screenshot Monitor activities"
);
