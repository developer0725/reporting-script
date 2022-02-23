import { promises as fs } from 'fs';
import path from 'path';
import util from 'util';
import { Worker } from 'worker_threads';

import * as Comlink from 'comlink';
import nodeEndpoint from 'comlink/dist/umd/node-adapter';
import _ from 'lodash';
import { DateTime } from 'luxon';
import { TaskTree } from 'tasktree-cli';
import { Argv, Arguments } from 'yargs';

import { GlobalOptions } from '..';
import { RemoteTask } from './tasktree';
import prepare, { ProjectKeys } from './prepare';
import { setGlobals } from './global-options';

export type StartWorker<T extends GlobalOptions> = (
  options: T,
  projectKeys: ProjectKeys,
  key: string,
  task: RemoteTask
) => Promise<Error | void>;

export default function createHandler<T extends GlobalOptions>(workerPath: string, taskName: string) {
  return async function handler(argv: Arguments<T>): Promise<void> {
    TaskTree.tree().start();

    // - the typings for command modules are incorrect
    // - `yargs.command(...)` will pass the full `Argv` object, which cannot be sent through
    //   Comlink
    // - force cast to get the plain options object
    const args = ((argv as unknown) as Argv<T>).argv;

    // - further, it appears that a generic object type (e.g. `T extends GlobalOptions`) causes
    //   type inference issues with Comlink's `UnproxyOrClone` type
    // - thus, explicitly cast `Arguments<T>` to that wrapper type
    const options = args as Comlink.UnproxyOrClone<Arguments<T>>;

    try {
      setGlobals(options);
      const preparing = TaskTree.add('Preparing');
      const projectKeys = await preparing.wrap(prepare(options, preparing));

      const task = TaskTree.add(taskName);
      for (let key of projectKeys.selected) {
        const projectTask = (task.add(`Project ${key}`) as unknown) as RemoteTask;
        const start = Comlink.wrap<StartWorker<T>>(
          nodeEndpoint(
            new Worker(workerPath, {
              execArgv: ['--require', 'source-map-support/register'],
            })
          )
        );
        try {
          await projectTask.wrap<Error | void>(start(options, projectKeys, key, projectTask));
        } finally {
          start[Comlink.releaseProxy]();
        }
      }
      task.markCompleted();
    } catch (error) {
      await fs.writeFile(
        path.join(options.output, `error-${DateTime.utc().toISODate()}.txt`),
        util.inspect(error, { depth: null })
      );
      throw error;
    } finally {
      TaskTree.tree().stop();
    }
  };
}
