import { screenshotMonitorClient } from "../helpers/global-options";
import { ACTIVITY_URL, SPLIT_ACTIVITY_URL } from "../urls";
import { getTimeRange, TimeSpan } from "../helpers/get-ssm-report";

export interface Activity {
  id: string;
  from: number;
  to: number;
  note: string;
  projectId: string | null;
}

export interface SplitActivityRequest {
  id: string;
  items: Activity[];
}

export type EmploymentActivity = Activity & {
  employmentId: number;
  offline: boolean;
};

export async function splitActivity(body: SplitActivityRequest) {
  try {
    await screenshotMonitorClient().post(SPLIT_ACTIVITY_URL, body, {
      responseType: "json",
    });
  } catch (e) {
    console.log(e);
  }
}

export async function getActivities(
  employmentIds: string[],time: TimeSpan
): Promise<EmploymentActivity[]> {
  const timeRange = await getTimeRange(time);
  const body = employmentIds.map((employmentId) => ({
    employmentId,
    from: timeRange.from.toSeconds(),
    to: timeRange.to.toSeconds(),
  }));
  const response = await screenshotMonitorClient().post<EmploymentActivity[]>(
    ACTIVITY_URL,
    body,
    { responseType: "json" }
  );

  return response.data;
}
