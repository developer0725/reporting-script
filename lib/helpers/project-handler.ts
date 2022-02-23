import { AxiosError } from 'axios';
import _ from 'lodash';

import type { StartWorker } from './create-handler';
import type { GlobalOptions } from './global-options';
import { ProjectKeys } from './prepare';
import { RemoteTask } from './tasktree';

export default function wrapProjectHandler<T extends GlobalOptions>(fn: StartWorker<T>) {
  return async function (options: T, projectKeys: ProjectKeys, key: string, task: RemoteTask) {
    try {
      return await fn(options, projectKeys, key, task);
    } catch (error) {
      if ((error as AxiosError).isAxiosError) {
        throw Object.assign(new Error(error.message), {
          message: error.message,
          stack: error.stack,
          name: error.name,
          config: _.pick(error.config, [
            'auth',
            'baseURL',
            'data',
            'headers',
            'method',
            'params',
            'responseType',
            'timeout',
            'url',
          ]),
          response: _.pick(error.response, ['data', 'status', 'statusText', 'headers']),
        });
      }

      throw error;
    }
  };
}
