import path from 'path';
import _ from 'lodash';
import { Argv } from 'yargs';

import { GlobalOptions, OPTION_GROUP_OPTIONS } from '../..';
import { validateUrls } from '../../helpers/validation';

import config from '../../../configs/reports/monthly.json';
import createHandler from '../../helpers/create-handler';

export const command = 'monthly';
export const describe = 'Generate grouped monthly reports for Screenshot Monitor records';

export interface MonthlyOptions {
  'slack-valid-report-webhooks': string[];
  'slack-invalid-report-webhooks': string[];
}

export interface CombinedMonthlyOptions extends GlobalOptions, MonthlyOptions {}

export function builder(yargs: Argv<GlobalOptions>): Argv<CombinedMonthlyOptions> {
  return (
    yargs
      // output: update description
      .describe('output', 'A directory to save generated reports to')

      // slack-valid-report-webhooks
      .describe('slack-valid-report-webhooks', 'Slack webhook URLs to send messages to for successful reports')
      .array('slack-valid-report-webhooks')
      .coerce('slack-valid-report-webhooks', validateUrls)
      .demandOption('slack-valid-report-webhooks')
      .alias('slack-valid-report-webhooks', 'valid-webhooks')
      .group('slack-valid-report-webhooks', OPTION_GROUP_OPTIONS)
      .hide('slack-valid-report-webhooks')

      // slack-invalid-report-webhooks
      .describe('slack-invalid-report-webhooks', 'Slack webhook URLs to send messages to for successful reports')
      .array('slack-invalid-report-webhooks')
      .coerce('slack-invalid-report-webhooks', validateUrls)
      .demandOption('slack-invalid-report-webhooks')
      .alias('slack-invalid-report-webhooks', 'invalid-webhooks')
      .group('slack-invalid-report-webhooks', OPTION_GROUP_OPTIONS)
      .hide('slack-invalid-report-webhooks')

      // config
      .config(config)
  );
}

export const handler = createHandler<CombinedMonthlyOptions>(path.join(__dirname, 'project.js'), 'Generating reports');
