import axios, { AxiosInstance } from 'axios';
import {COMMON_DATA_URL} from "../urls";

export interface GlobalOptions {
  'screenshot-monitor-token': string;
  'atlassian-username': string;
  'atlassian-api-token': string;
  projects: string[];
  output: string;
  'jira-completion-statuses': string[];
  time: string;
}

export interface Project {
  id: string;
  name: string;
}

export type Employment = {
  id: number;
  name: string;
  lastActive: number;
  [key: string]: any;
};

export interface SsmData {
  currentCompanyId: number;
  currentCompanyEmploymentId: number;
  accountId: number;
  employmentId: number;
  now: number;
  dateFormat: string;
}

export interface CommonDataResponse extends SsmData{
  companies: Array<{
    id: number;
    projects: Array<Project>;
    employments: Array<Employment>;
  }>;
}

export interface Projects {
  [key: string]: string;
}

export function setGlobals<T extends GlobalOptions>(options: T) {
  global.timeTrackingOptions = options;
}

export function atlassianClient(baseURL?: string): AxiosInstance {
  return axios.create({
    baseURL,
    auth: {
      username: global.timeTrackingOptions['atlassian-username'],
      password: global.timeTrackingOptions['atlassian-api-token'],
    },
  });
}

export function screenshotMonitorClient(): AxiosInstance {
  return axios.create({
    headers: {
      'X-SSM-Token': global.timeTrackingOptions['screenshot-monitor-token'],
    },
  });
}

export async function getCommonData():Promise<CommonDataResponse>{
  const response = await screenshotMonitorClient().post<CommonDataResponse>(COMMON_DATA_URL);
  if (!global.ssmData) {
    await setSsmData(response.data);
  }
  return response.data
}

export async function getSsmProjects(): Promise<Projects> {
  const commonData = await getCommonData();
  const company = commonData.companies.find((company) => company.id === commonData.currentCompanyId);

  if (company === undefined) {
    throw new Error('Could not find data for current Screenshot Monitor company');
  }

  return Object.fromEntries(company.projects.map((project) => [project.name.toUpperCase(), project.id]));
}

async function setSsmData(commonData:CommonDataResponse) {
  global.ssmData = commonData;
}

export async function getSsmData() {
  if (!global.ssmData) {
    await getCommonData();
  }

  return global.ssmData;
}

export function completionStatusJql(): string {
  return `(${global.timeTrackingOptions['jira-completion-statuses']
    .map((status) => JSON.stringify(status))
    .join(', ')})`;
}

