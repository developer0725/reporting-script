import { MessageChannel } from 'worker_threads';

import * as Comlink from 'comlink';
import nodeEndpoint from 'comlink/dist/umd/node-adapter';
import { TaskTree } from 'tasktree-cli';
import { TaskStatus, Task } from 'tasktree-cli/lib/Task';
import { ProgressBar } from 'tasktree-cli/lib/ProgressBar';
import { Theme } from 'tasktree-cli/lib/Theme';
import stripAnsi from 'strip-ansi';

const TASK_TRANSFER_HANDLER: Comlink.TransferHandler<Task, MessagePort> = {
  canHandle(obj: unknown): obj is Task {
    return obj instanceof Task;
  },
  serialize(obj: Task): [MessagePort, Transferable[]] {
    const { port1, port2 } = new MessageChannel();
    Comlink.expose(obj, nodeEndpoint(port1));
    return [port2, [port2]];
  },
  deserialize(port: MessagePort): Task {
    const endpoint = nodeEndpoint(port);
    endpoint.start!();
    const task = Comlink.wrap<Task>(endpoint);

    // replace proxied wrap with local function instance
    // this way promises and generators doesn't need to be transferred
    const proxy = new Proxy(task, {
      get(target, prop, receiver) {
        return prop === 'wrap' ? Task.prototype.wrap : Reflect.get(target, prop, receiver);
      },
    });

    return (proxy as unknown) as Task;
  },
};

Comlink.transferHandlers.set('task', TASK_TRANSFER_HANDLER);

const PROGRESS_TRANSFER_HANDLER: Comlink.TransferHandler<ProgressBar, MessagePort> = {
  canHandle(obj: unknown): obj is ProgressBar {
    return obj instanceof ProgressBar;
  },
  serialize(obj: ProgressBar): [MessagePort, Transferable[]] {
    const { port1, port2 } = new MessageChannel();
    Comlink.expose(obj, nodeEndpoint(port1));
    return [port2, [port2]];
  },
  deserialize(port: MessagePort): ProgressBar {
    const endpoint = nodeEndpoint(port);
    endpoint.start!();
    const progressbar = Comlink.wrap<ProgressBar>(endpoint);

    return (progressbar as unknown) as ProgressBar;
  },
};

Comlink.transferHandlers.set('progress', PROGRESS_TRANSFER_HANDLER);

declare module 'tasktree-cli/lib/Task' {
  interface Task {
    wrap<T = void>(events: ProgressBarEvents<T>, total: number, recordType: string): Promise<ProgressBarResult<T>>;
    wrap<T>(promise: Promise<T>): Promise<T>;
    markCompleted(): void;
    markFailed(error?: string | Error, clear?: boolean): void;
    simpleRender(): string;
  }
}

export type ProgressBarResult<T> =
  | { success: true; events: ProgressBarEvent[]; value: T }
  | { success: false; events: ProgressBarEvent[] };

export type RemoteTask = Comlink.Remote<Omit<Task, 'add' | 'bar' | 'wrap'>> & {
  add: (...args: Parameters<Task['add']>) => Promise<RemoteTask>;
  bar: (...args: Parameters<Task['bar']>) => Promise<Comlink.Remote<ReturnType<Task['bar']>>>;
  wrap: Task['wrap'];
};

const originalError = Task.prototype.error;
Task.prototype.error = function (this: Task, error?: string | Error) {
  if (error instanceof Error) {
    // don't include full stack from error messages, only the message
    return originalError.call(this, error.message);
  } else {
    return originalError.call(this, error);
  }
};

Task.prototype.markFailed = function (this: Task, error?: string | Error, clear?: boolean): void {
  this.error(error, clear);

  // @ts-ignore
  this.setStatus(TaskStatus.Failed);
};

Task.prototype.markCompleted = function (this: Task): void {
  if (this.isPending()) {
    this.complete();
  }
};

Task.prototype.simpleRender = function (this: Task): string {
  // @ts-ignore
  const theme = TaskTree.tree().theme as Theme;
  return stripAnsi(this.render(theme).join('\n'));
};

function wrap<T>(this: Task | RemoteTask, promise: Promise<T>): Promise<T>;
function wrap<T>(
  this: Task | RemoteTask,
  events: ProgressBarEvents,
  total: number,
  recordType: string
): Promise<ProgressBarResult<T>>;
async function wrap<T>(
  this: Task | RemoteTask,
  wrapee: Promise<T> | ProgressBarEvents<T>,
  total?: number,
  recordType?: string
): Promise<T | ProgressBarResult<T>> {
  if (wrapee instanceof Promise) {
    try {
      const value = await wrapee;
      await this.markCompleted();
      return value;
    } catch (error) {
      await this.markFailed(error);
      throw error;
    }
  } else {
    const progress = await this.bar(
      `:elapseds elapsed, :etas remaining, :current/:total ${recordType} :bar :currentText`,
      { total }
    );

    const events: ProgressBarEvent[] = [];
    let value: T;
    try {
      let result: IteratorResult<ProgressBarEvent, T> = await wrapee.next();
      while (!result.done) {
        const entry = result.value;
        events.push(entry);
        // if parent task failed, stop iteration
        if (!(await this.isPending())) {
          return { success: false, events };
        }

        // escape curly braces to prevent `chalk` template errors
        entry.text = entry.text.replace(/(?<!\\)}/, '\\}');

        if (entry.type === 'progress') {
          if (entry.ticks === 0) {
            // passing in a step value of 0 doesn't work correctly
            await progress.tick(1, { currentText: entry.text });
            await progress.tick(-1, { currentText: entry.text });
          } else {
            await progress.tick(entry.ticks, { currentText: entry.text });
          }
        } else if (entry.type === 'log') {
          await this.log(entry.text);
        } else if (entry.type === 'warning') {
          await this.warn(entry.text);
        }

        result = await wrapee.next();
      }

      progress.tick(0, { currentText: '' });
      await progress.complete();
      await this.markCompleted();

      value = result.value;
    } catch (error) {
      await this.markFailed(error);
      throw error;
    }
    return { success: true, events, value };
  }
}

Task.prototype.wrap = wrap;

export type ProgressBarEvent =
  | { type: 'progress'; ticks?: number; text: string }
  | { type: 'log' | 'warning'; text: string };

export type ProgressBarEvents<TReturn = void> = AsyncGenerator<ProgressBarEvent, TReturn>;
