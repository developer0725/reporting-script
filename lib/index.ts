import yargs from 'yargs';
import os from 'os';

import { TaskTree } from 'tasktree-cli';

import './helpers/tasktree';
import * as sync from './sync';
import * as monthly from './reports/monthly';
import * as weekly from './reports/weekly';
import * as daily from './reports/daily';
import * as epics from './reports/epics';
import * as mails from './mails'
import * as supportEmailJiraRec from './support-email-jira-rec'
import * as supportAdmin from './support-admin'
import * as setProject from './set-project'

import config from '../configs/index.json';

export { GlobalOptions } from './helpers/global-options';

export const OPTION_GROUP_CREDENTIALS = 'Credentials:';
export const OPTION_GROUP_OPTIONS = 'Options:';
export const OPTION_GROUP_HELP = 'Help:';

// properly stop `TaskTree` when process exits unexpectedly (e.g. CTRL-C or uncaught exception)
// otherwise terminal cursor isn't properly reset, causing it to be invisible after the process exits
function signalHandler(signal: NodeJS.Signals): never {
  process.exit(128 + os.constants.signals[signal]);
}
process.once('exit', () => TaskTree.tree().stop());
process.once('SIGINT', signalHandler);
process.once('SIGTERM', signalHandler);

yargs
  // screenshot-monitor-token
  .describe(
    'screenshot-monitor-token',
    'Your Screenshot Monitor API Token, retrieved from the API section of the My Account page'
  )
  .string('screenshot-monitor-token')
  .demandOption('screenshot-monitor-token')
  .requiresArg('screenshot-monitor-token')
  .alias('screenshot-monitor-token', 'ssm-token')
  .group('screenshot-monitor-token', OPTION_GROUP_CREDENTIALS)
  .hide('screenshot-monitor-token')

  // atlassian-username
  .describe('atlassian-username', 'Your Atlassian username, usually your email address')
  .string('atlassian-username')
  .demandOption('atlassian-username')
  .requiresArg('atlassian-username')
  .alias('atlassian-username', 'atl-user')
  .group('atlassian-username', OPTION_GROUP_CREDENTIALS)
  .hide('atlassian-username')

  // atlassian-api-token
  .describe(
    'atlassian-api-token',
    'Your Atlassian API token, retrieved from your Atlassian account at id.atlassian.com'
  )
  .string('atlassian-api-token')
  .demandOption('atlassian-api-token')
  .requiresArg('atlassian-api-token')
  .alias('atlassian-api-token', 'atl-token')
  .group('atlassian-api-token', OPTION_GROUP_CREDENTIALS)
  .hide('atlassian-api-token')

  // projects
  .describe('projects', 'Limit processing to one or more projects from Jira Cloud and Screenshot Monitor')
  .array('projects')
  .string('projects')
  .coerce('projects', (projects: string[]) => projects.map((project) => project.toUpperCase()))
  .demandOption('projects')
  .requiresArg('projects')
  .default('projects', [], 'all projects')
  .alias('projects', 'p')
  .group('projects', OPTION_GROUP_OPTIONS)

  //SSM time period
  .describe('time', 'SSM time period')
  .string('time')
  .demandOption('time')
  .requiresArg('time')
  .default('time', 'this-month', '"time" is this-month')
  .normalize('time')
  .alias('time', 't')
  .group('time', OPTION_GROUP_OPTIONS)

  // jira-completion-statuses
  .describe(
    'jira-completion-statuses',
    'Set the Jira Cloud statuses that mark issues as completed to propertly filter open and closed issues for reports'
  )
  .array('jira-completion-statuses')
  .string('jira-completion-statuses')
  .demandOption('jira-completion-statuses')
  .requiresArg('jira-completion-statuses')
  .alias('jira-completion-statuses', 'status')
  .group('jira-completion-status', OPTION_GROUP_OPTIONS)

  // output
  .describe('output', 'A directory to save files to')
  .string('output')
  .demandOption('output')
  .requiresArg('output')
  .default('output', './output', '"output" subdirectory under the current directory (./output)')
  .normalize('output')
  .alias('output', 'o')
  .group('output', OPTION_GROUP_OPTIONS)

  // config
  .config(config)

  // commands
  .command(sync)
  .command(weekly)
  .command(monthly)
  .command(epics)
  .command(daily)
  .command(mails)
  .command(supportEmailJiraRec)
  .command(supportAdmin)
  .command(setProject)

  // help flags
  .help()
  .alias('h', 'help')
  .group(['help', 'version'], OPTION_GROUP_HELP)

  // make parsing strict
  .demandCommand(1, '')
  .recommendCommands()
  .strict()

  // display
  .wrap(yargs.terminalWidth())
  .middleware(() => yargs.showHelpOnFail(false), false) // don't show usage help for runtime errors
  .parse();
