import path from 'path';
import { Argv } from 'yargs';

import { GlobalOptions, OPTION_GROUP_OPTIONS } from '../..';
import { validateUrls } from '../../helpers/validation';

import config from '../../../configs/reports/daily.json';
import workerHandler from "./handler";

export const command = 'daily';
export const describe = 'Generate grouped daily reports for Scrin records';

export interface DailyOptions {
  'integromat-report-webhooks': string[];
}

export interface CombinedDailyOptions extends GlobalOptions, DailyOptions {}

export function builder(yargs: Argv<GlobalOptions>): Argv<CombinedDailyOptions> {
  return (
    yargs
      // output: update description
      .describe('output', 'A directory to save generated reports to')

      // integromat-report-webhooks
      .describe('integromat-report-webhooks', 'Integromat Webhook URLs to send messages to for successful reports')
      .array('integromat-report-webhooks')
      .coerce('integromat-report-webhooks', validateUrls)
      .demandOption('integromat-report-webhooks')
      .alias('integromat-report-webhooks', 'valid-webhooks')
      .group('integromat-report-webhooks', OPTION_GROUP_OPTIONS)
      .hide('integromat-report-webhooks')

      // config
      .config(config)
  );
}

export const handler = workerHandler(path.join(__dirname, 'project.js'), 'Generating reports');
