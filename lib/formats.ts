import { DateTime, Duration } from 'luxon';
import util from 'util';

const DATE_FORMAT = 'MM/dd/yy';
const TIME_FORMAT = 'hh:mma';
const DURATION_FORMAT = 'h:mm';

const JIRA_DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss.uZZZ";

declare module 'luxon' {
  interface DateTime {
    [util.inspect.custom]: util.CustomInspectFunction;
  }

  interface Duration {
    [util.inspect.custom]: util.CustomInspectFunction;
  }
}

DateTime.prototype[util.inspect.custom] = function () {
  return this.toISODate();
};

Duration.prototype[util.inspect.custom] = function () {
  return this.toFormat(DURATION_FORMAT);
};

export { DATE_FORMAT, TIME_FORMAT, DURATION_FORMAT, JIRA_DATETIME_FORMAT };
