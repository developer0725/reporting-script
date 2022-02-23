import {Arguments, Argv} from "yargs";
import { GlobalOptions, OPTION_GROUP_OPTIONS } from "..";
import { getLogs } from "./project";
import config from '../../configs/support-admin.json';



interface SupportAdminOptions {
  st: number;
  teamMembers: string[];
  description: string;
}

export const command = "support-admin";
export const describe = "Add offline activities";

export interface CombinedSupportAdminOptions extends GlobalOptions, SupportAdminOptions {}

export function builder(yargs: Argv<GlobalOptions>): Argv<CombinedSupportAdminOptions> {
  return yargs
    .default("projects", [], "empty projects")
    .options({
      st: {
        demandOption: false,
        default: 20,
        describe: "set number of minute to add offline activities",
        type: "number",
        group: OPTION_GROUP_OPTIONS,
      },
      teamMembers: {
        demandOption: true,
        default: [],
        defaultDescription: "empty team members",
        describe: "set employees for activities to aceept",
        type: "array",
        group: OPTION_GROUP_OPTIONS,
        hidden: true,
      },
      description: {
        demandOption: true,
        default: "",
        describe: "Description to add in time entry",
        type: "string",
        group: OPTION_GROUP_OPTIONS,
        hidden: true,
      },
      time: {
        default: "this-month",
      },
    })
    .config(config);
}

export const handler = async (argv: Arguments<CombinedSupportAdminOptions>) => {
  getLogs(argv);
};
