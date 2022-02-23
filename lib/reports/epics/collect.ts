import { ProgressBarEvents } from '../../helpers/tasktree';

import { EpicDetailEntry, LinkedEpicDetailEntry } from './project';

import {
  getAllTicketsCount,
  getOpenTicketsCount,
  getRecentlyUpdatedAllTicketsCount,
  getRecentlyUpdatedOpenTicketsCount,
  getAllNonLinkedTicketsCount,
  getNonLinkedOpenTicketsCount,
  getNonLinkedRecentlyUpdatedAllTicketsCount,
  getNonLinkedRecentlyUpdatedOpenTicketsCount,
} from './jira-queries';

export default async function* collectIssuesForEpics(
  projectKey: string,
  epics: EpicDetailEntry[],
  recentlyUpdated: boolean
): ProgressBarEvents {
  for (let entry of epics as LinkedEpicDetailEntry[]) {
    yield { type: 'progress', text: `[${entry.key}] ${entry.title}` };

    const total = recentlyUpdated
      ? await getRecentlyUpdatedAllTicketsCount(projectKey, entry.key)
      : await getAllTicketsCount(projectKey, entry.key);

    const open = recentlyUpdated
      ? await getRecentlyUpdatedOpenTicketsCount(projectKey, entry.key)
      : await getOpenTicketsCount(projectKey, entry.key);

    entry.total = total;
    entry.open = open;
  }

  yield { type: 'progress', text: `Issues not linked to an epic` };

  const epicKeys = epics.map((entry) => entry.key!);

  const total = recentlyUpdated
    ? await getNonLinkedRecentlyUpdatedAllTicketsCount(projectKey, epicKeys)
    : await getAllNonLinkedTicketsCount(projectKey, epicKeys);

  const open = recentlyUpdated
    ? await getNonLinkedRecentlyUpdatedOpenTicketsCount(projectKey, epicKeys)
    : await getNonLinkedOpenTicketsCount(projectKey, epicKeys);

  epics.push({ key: null, title: null, open, total });
}
