const ATLASSIAN_CLOUD_SUBDOMAIN = 'flyingdonkey';

const JIRA_CLOUD_API_ROOT = new URL(`https://${ATLASSIAN_CLOUD_SUBDOMAIN}.atlassian.net/rest/api/3/`);

export const STATUS_URL = new URL('status', JIRA_CLOUD_API_ROOT).toString();
export const ISSUE_SEARCH_URL = new URL('search', JIRA_CLOUD_API_ROOT).toString();
export const PROJECT_SEARCH_URL = new URL('project/search', JIRA_CLOUD_API_ROOT).toString();

export function issueUrl(key: string): string {
  return new URL('issue/' + key, JIRA_CLOUD_API_ROOT).toString();
}

export function worklogUrl(key: string): string {
  return new URL(`issue/${key}/worklog`, JIRA_CLOUD_API_ROOT).toString();
}

const CONFLUENCE_CLOUD_API_ROOT = new URL(`https://${ATLASSIAN_CLOUD_SUBDOMAIN}.atlassian.net/wiki/rest/api/`);

export const SPACES_URL = new URL('space?type=global&limit=1000', CONFLUENCE_CLOUD_API_ROOT).toString();
export const PAGE_SEARCH_URL = new URL('search', CONFLUENCE_CLOUD_API_ROOT).toString();
export const PAGE_CREATE_URL = new URL('content', CONFLUENCE_CLOUD_API_ROOT).toString();

export function pageUrl(id: string): string {
  return new URL(`content/${id}`, CONFLUENCE_CLOUD_API_ROOT).toString();
}

export function attachmentUrl(pageId: string): string {
  return new URL(`content/${pageId}/child/attachment`, CONFLUENCE_CLOUD_API_ROOT).toString();
}

const SCREENSHOT_MONITOR_API_ROOT = new URL('https://screenshotmonitor.com/api/v2/');

export const REPORT_URL = new URL('GetReport', SCREENSHOT_MONITOR_API_ROOT).toString();
export const COMMON_DATA_URL = new URL('GetCommonData', SCREENSHOT_MONITOR_API_ROOT).toString();
export const ACTIVITY_URL = new URL('GetActivities', SCREENSHOT_MONITOR_API_ROOT).toString();
export const SPLIT_ACTIVITY_URL = new URL('SplitActivityExact', SCREENSHOT_MONITOR_API_ROOT).toString();
