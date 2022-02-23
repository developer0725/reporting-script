import path from 'path';
import _ from 'lodash';
import { Argv } from 'yargs';

import { GlobalOptions } from '../..';

import config from '../../../configs/reports/epics.json';
import createHandler from '../../helpers/create-handler';

export const command = 'epics';
export const describe = 'Generate aggregated issue reports for Jira Cloud epics';

export interface EpicsOptions {}

export interface CombinedEpicsOptions extends GlobalOptions, EpicsOptions {}

export function builder(yargs: Argv<GlobalOptions>): Argv<CombinedEpicsOptions> {
  return (
    yargs
      // output: update description
      .describe('output', 'A directory to save generated reports to')

      // config
      .config(config)
  );
}

export const handler = createHandler<CombinedEpicsOptions>(path.join(__dirname, 'project.js'), 'Generating reports');
