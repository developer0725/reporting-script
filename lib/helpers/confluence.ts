import encode from 'stringify-entities';
import FormData from 'form-data';
import { DateTime } from 'luxon';
import { TaskStatus } from 'tasktree-cli/lib/Task';

import { PAGE_SEARCH_URL, PAGE_CREATE_URL, pageUrl, attachmentUrl } from '../urls';
import { ReportType } from './prepare';
import { atlassianClient } from './global-options';

function hierarchy(date: DateTime, report: ReportType) {
  return [
    'Auto Reports',
    `${report} Reports`,
    `${report} Reports: ${date.toFormat('LLLL yyyy')}`,
    `${report} Reports: ${date.toFormat(`LLLL dd, yyyy 'at' hh:mm a`)}`,
  ];
}

interface PageSearchResponse {
  results: Array<{
    content: {
      id: string;
      title: string;
      version: { number: number };
      ancestors: Array<{ id: string }>;
    };
  }>;
}

interface PageCreateResponse {
  id: string;
}

interface PageDetailResponse {
  id: string;
  title: string;
  version: { number: number };
  _links: {
    base: string;
    webui: string;
  };
}

interface Page {
  url: URL;
  id: string;
}

async function applyHierarchy(space: string, pages: string[]): Promise<Page> {
  const client = atlassianClient();

  let previousPage: undefined | string = undefined;

  for (let page of pages) {
    const searchResults = (await client.get<PageSearchResponse>(PAGE_SEARCH_URL, {
      params: {
        cql: `space = "${space}" AND title = "${page}"`,
        expand: 'content.ancestors,content.version',
      },
    })).data.results || [];

    if (!searchResults.length) {
      const options: any = {
        title: page,
        type: 'page',
        space: { key: space },
        ...(previousPage ? { ancestors: [{ id: previousPage }] } : {}),
        ...(!page.endsWith('Reports') ? { body: { storage: { value: '', representation: 'storage' } } } : {}),
      };

      const postResponse = await client.post<PageCreateResponse>(PAGE_CREATE_URL, options);

      previousPage = postResponse.data.id;
    } else {
      previousPage = searchResults[0].content.id;
    }
  }

  if (previousPage != undefined) {
    const {
      data: {
        _links: { base, webui },
      },
    } = await client.get<PageDetailResponse>(pageUrl(previousPage));

    const url = new URL(base + webui);

    return { url, id: previousPage };
  } else {
    throw new Error(`Unexpected undefined final page when applying page hierarchy to Confluence Space "${space}"`);
  }
}

interface CreatePageOptions {
  type: ReportType;
  started: DateTime;
  key: string;
}

async function createPage(options: CreatePageOptions): Promise<Page> {
  const pages = hierarchy(options.started, options.type);
  return await applyHierarchy(options.key, pages);
}

async function addAttachment(pageId: string, report: Buffer, filename: string) {
  const data = new FormData();
  data.append('file', report, { filename });
  data.append('minorEdit', 'true');

  await atlassianClient().put(attachmentUrl(pageId), data.getBuffer(), { headers: data.getHeaders() });
}

const ATTACHMENT_LIST_CONTENT = `
<p>
  <ac:structured-macro ac:name="attachments" ac:schema-version="1" ac:macro-id="09f54333-a1dd-4c60-9460-9f3894066c20">
    <ac:parameter ac:name="upload">false</ac:parameter >
    <ac:parameter ac:name="old">false</ac:parameter>
  </ac:structured-macro>
</p>
`;

interface PageData {
  started: DateTime;
  log: string;
  status: TaskStatus;
}

function statusDescription(status: TaskStatus): string {
  switch (status) {
    case TaskStatus.Completed:
      return 'completed';
    case TaskStatus.Failed:
      return 'failed';
    case TaskStatus.Pending:
      throw new Error('Unexpected incomplete task');
    case TaskStatus.Skipped:
      return 'skipped';
  }
}

async function updatePage(id: string, data: PageData) {
  const { started, log, status } = data;
  const client = atlassianClient();

  const response = await client.get<PageDetailResponse>(pageUrl(id), { params: { expand: 'version' } });
  const version = response.data.version.number;
  const title = response.data.title;

  const ended = DateTime.utc();
  const duration = ended.diff(started);
  const contents = `
    ${ATTACHMENT_LIST_CONTENT}
    <p>
      Report started at ${started.toFormat('hh:mm a')}
      and ${statusDescription(status)} at ${ended.toFormat('hh:mm a')}
      in ${duration.toFormat("m'm's's")}.
    </p>
    <pre>${encode(log)}</pre>
  `;

  await client.put(pageUrl(id), {
    version: { number: version + 1 },
    title,
    type: 'page',
    body: { storage: { value: contents, representation: 'storage' } },
  });
}

export { createPage, addAttachment, updatePage };
