import path from 'path';

import { EmailJSON } from '@sendgrid/helpers/classes/email-address';
import _ from 'lodash';
import { Argv } from 'yargs';

import { GlobalOptions, OPTION_GROUP_CREDENTIALS, OPTION_GROUP_OPTIONS } from '../..';
import { validateEmailName, validateProjectEmailNames, ProjectEmailMap } from '../../helpers/validation';

import config from '../../../configs/reports/weekly.json';
import createHandler from '../../helpers/create-handler';

export const command = 'weekly';
export const describe = 'Generate aggregated weekly time tracking reports for Jira Cloud issues';

export interface WeeklyOptions {
  'from-address': EmailJSON;
  'cc-addresses': EmailJSON[];
  'to-addresses': ProjectEmailMap;
  'sendgrid-api-key': string;
}

export interface CombinedWeeklyOptions extends GlobalOptions, WeeklyOptions {}

export function builder(yargs: Argv<GlobalOptions>): Argv<CombinedWeeklyOptions> {
  return (
    yargs
      // output: update description
      .describe('output', 'A directory to save generated reports to')

      // from-address
      .describe('from-address', 'The email address to email reports from, in "Name <user@domain.tld>" format')
      .coerce('from-address', (address: string) => validateEmailName(address))
      .demandOption('from-address')
      .alias('from-address', 'from')
      .group('from-address', OPTION_GROUP_OPTIONS)
      .hide('from-address')

      // cc-addresses
      .describe('cc-addresses', 'Email addresses to CC reports to, in "Full Name <user@domain.tld>" format')
      .array('cc-addresses')
      .coerce('cc-addresses', (addresses: string[]) => addresses.map(validateEmailName))
      .demandOption('cc-addresses')
      .requiresArg('cc-addresses')
      .alias('cc-addresses', 'cc')
      .group('cc-addresses', OPTION_GROUP_OPTIONS)
      .hide('cc-addresses')

      // to-addresses
      .describe('to-addresses', 'Email addresses to email reports to, in "project=Full Name <user@domain.tld>" format')
      .array('to-addresses')
      .coerce('to-addresses', (addresses: string[]) => validateProjectEmailNames(addresses))
      .demandOption('to-addresses')
      .requiresArg('to-addresses')
      .alias('to-addresses', 'to')
      .group('to-addresses', OPTION_GROUP_OPTIONS)
      .hide('to-addresses')

      // sendgrid-api-key
      .describe('sendgrid-api-key', 'Your SendGrid API key')
      .string('sendgrid-api-key')
      .demandOption('sendgrid-api-key')
      .alias('sendgrid-api-key', 'sg-key')
      .group('sendgrid-api-key', OPTION_GROUP_CREDENTIALS)
      .hide('sendgrid-api-key')

      // config
      .config(config)
      .check((argv) => {
        const cc = new Set(argv.cc.map((entry) => entry.email));
        if (cc.size < argv.cc.length) {
          return new Error(`One or more 'cc-addresses' values are duplicates`);
        }

        for (let project of argv.projects) {
          const to = argv['to-addresses'][project];
          if (to === undefined || to.length < 1) {
            return new Error(`Project '${project}' is missing a corresponding 'to-address' value`);
          }

          for (let entry of to) {
            if (cc.has(entry.email)) {
              return new Error(
                `Project '${project}' contains a 'to-address' value "${entry.email}" that is already in 'cc-addresses'`
              );
            }
          }
        }

        return true;
      })
  );
}

export const handler = createHandler<CombinedWeeklyOptions>(path.join(__dirname, 'project.js'), 'Generating reports');
