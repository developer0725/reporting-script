import { Argv } from "yargs";

import { GlobalOptions } from "..";

import config from '../../configs/office.json'

import { showMailsSubjectsAndTickets } from "./project";

interface SyncOptions {
  output: string;
}

export const command = "mails";
export const describe = "Get mails from office365 outlook";

export interface CombinedSyncOptions extends GlobalOptions, SyncOptions {}

export function builder(yargs: Argv<GlobalOptions>): Argv<CombinedSyncOptions> {
  return (
    yargs
      // config
      .config(config.yargsConfig)
  );
}

export const handler = async () => {
  showMailsSubjectsAndTickets();
};
