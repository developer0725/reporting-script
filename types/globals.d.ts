import url from 'url';
import worker from 'worker_threads';
import { GlobalOptions } from '../lib';
import { SsmData } from "../lib/helpers/global-options";

declare global {
  interface URLConstructor {
    new (...args: ConstructorParameters<typeof url.URL>): url.URL;
  }

  var URL: URLConstructor;
  type URL = url.URL;

  type Transferable = ArrayBuffer | MessagePort;
  type MessagePort = worker.MessagePort;

  type EventListenerOrEventListenerObject = (() => void) | ((arg: any) => void) | ((...args: any[]) => void);

  namespace NodeJS {
    interface Global {
      timeTrackingOptions: GlobalOptions;
      ssmData: SsmData;
    }
  }
}
