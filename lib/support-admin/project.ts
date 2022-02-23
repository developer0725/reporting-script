import getReport, { TimeSpan } from "../../lib/helpers/get-ssm-report";
import {getCommonData, setGlobals} from "../../lib/helpers/global-options";
import { screenshotMonitorClient } from "../../lib/helpers/global-options";
import { uniqBy, intersection } from "lodash";
import moment from "moment";
import {CombinedSupportAdminOptions as Options} from "./index";

function getProjectId(projects: any, projectName: any) {
  return projects.find((e: any) => e.name === projectName).id;
}

function generateGUID(time: any) {
  let u =
    time.valueOf().toString(16) + Math.random().toString(16) + "0".repeat(16);
  return [
    u.substr(0, 8),
    u.substr(8, 4),
    "4000-8" + u.substr(13, 3),
    u.substr(16, 12),
  ].join("-");
}

async function addOfflineActivity(body: any, ticket:any) {
  //check body to send
  // console.log('body is ',body)
  console.log('Adding offline activity for ticket',ticket)
  if(1<2){
  try {
    await screenshotMonitorClient().post(
      "https://screenshotmonitor.com/api/v2/AddOfflineActivity",
      body,
      { responseType: "json" }
    );
  } catch (e) {
    console.log(e);
  }
}
}

export async function getLogs(options: Options) {
  let time: TimeSpan = options.time.toLocaleLowerCase() as TimeSpan
  await (async () => {
    setGlobals(options);
  })();
  const [reports, commonData] = await Promise.all([
    getReport([], [], time),
    getCommonData(),
  ]);
  const filteredReports = reports.filter(
    (r) =>
        intersection([r.Project], options.projects).length &&
        intersection([r.Employment], options.teamMembers).length
  );
  //check filtered result
  // console.log(filteredReports);
  const grouped = uniqBy(filteredReports, function(report) {
    return ''+report.Note.split(":")[0];
  });
  // console.log(grouped)
  let startTime = moment.utc("1", "DD");
  if(time =="this-month" || time =="this-week" || time =="last-week" || time=='today' || time=="all-time" ||time=="yesterday" || time=="this-year"){
    startTime = startTime;
  }else if(time == "last-month"){
    startTime = startTime.subtract(1,"month");
  } else if(time == "last-year"){
    startTime = startTime.subtract(1,"year");
  }else{
    throw new Error('Wrong time parameter')
  }
  console.log(startTime.format())
  const { employmentId } = commonData;
  const promises = grouped.map(async (report: any) => {
    const ticket = report.Note.split(":")[0]
    const body = {
      id: generateGUID(startTime),
      employmentId,
      projectId: getProjectId(commonData.companies[0].projects, report.Project),
      from: ''+startTime.format('X'),
      to: ''+startTime.add(options.st, "minutes").format('X'),
      note: "[" + ticket + "]" + options.description,
    }; 
      await addOfflineActivity([body],ticket);
  });
  await Promise.all(promises);
  console.log('Adding offline activites DONE')
  console.log('Number of added activities ',grouped.length)
}
