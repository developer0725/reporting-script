import { promises as fs } from 'fs';

import _ from 'lodash';
import { Task } from 'tasktree-cli/lib/Task';

import { GlobalOptions } from '..';
import { PROJECT_SEARCH_URL, SPACES_URL, STATUS_URL } from '../urls';
import {atlassianClient, getSsmProjects, Projects} from "./global-options";

interface ProjectsResponse {
  values: Array<{ key: string }>;
}

interface SpacesResponse {
  results: Array<{ key: string }>;
}

interface Status {
  self: string;
  description: string;
  iconUrl: string;
  name: string;
  untranslatedName: string;
  id: string;
  statusCategory: {
    self: string;
    id: number;
    key: string;
    colorName: string;
    name: string;
  };
}

export async function getJiraProjects(): Promise<string[]> {
  return await atlassianClient()
    .get<ProjectsResponse>(PROJECT_SEARCH_URL)
    .then((response) => response.data.values.map((project) => project.key.toUpperCase()));
}

async function getConfluenceSpaces(): Promise<string[]> {
  return await atlassianClient()
    .get<SpacesResponse>(SPACES_URL)
    .then((response) => response.data.results.map((space) => space.key.toUpperCase()));
}

async function validateCompletionStatuses(completionStatuses: string[]): Promise<void> {
  const allStatuses: Set<string> = await atlassianClient()
    .get<Status[]>(STATUS_URL)
    .then((response) => response.data.map((status) => status.name))
    .then((statuses) => new Set(statuses));

  const invalid = completionStatuses.filter((status) => !allStatuses.has(status));
  if (invalid.length > 0) {
    throw new Error(`The following statuses were not found in Jira Cloud: ${invalid.join(', ')}`);
  }
}

export type ReportType = 'Monthly' | 'Weekly' | 'Epics' | 'Command';

export interface ProjectKeys {
  ssm: Projects;
  jira: string[];
  confluence: string[];
  selected: string[];
}

async function prepare(options: GlobalOptions, task: Task): Promise<ProjectKeys> {
  await task.add('Creating output directory').wrap(fs.mkdir(options.output, { recursive: true }));

  const [ssm, jira, confluence] = await Promise.all([
    task.add('Fetching project list from Screenshot Monitor').wrap(getSsmProjects()),
    task.add('Fetching project list from Jira Cloud').wrap(getJiraProjects()),
    task.add('Fetching spaces from Confluence').wrap(getConfluenceSpaces()),
    task
      .add('Validating Jira Cloud completion statuses')
      .wrap(validateCompletionStatuses(options['jira-completion-statuses'])),
  ]);

  const projects = options.projects.length > 0 ? options.projects : _.union(Object.keys(ssm), jira);
  const selected = _(projects)
    .map((key) => key.toUpperCase())
    .uniq()
    .value();

  return { ssm, jira, confluence, selected };
}

export default prepare;
