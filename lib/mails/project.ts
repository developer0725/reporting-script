import axios from "axios";
import qs from "querystring";
import { concat } from "lodash";
import config from "../../configs/office.json";

const endPoints = {
  loginURL: `https://login.microsoftonline.com/${config.officeConfig.tenant_id}/oauth2/v2.0/token`,
  mailURL: `https://graph.microsoft.com/v1.0/users/${config.officeConfig.mail}/mailFolders/Inbox`,
  listMessages:'/messages?$select=categories,subject,from,receivedDateTime'
};

export interface OutlookMessage {
  id: string;
  categories: string[];
  receivedDateTime: string;
  subject: string;
  from: {
    emailAddress: {
      address: "string";
      name: "string";
    };
  };
}

async function authenticate() {
  const { data } = await axios.post(
    endPoints.loginURL,
    qs.stringify(config.officeConfig.body),
    config.loginUrlConfig
  );
  return data;
}

// get mails subjects and categories
// the filter is done through $select
// ** Make sure to activate user and mail permissions on Azure
export async function getMails() {
  let messages: OutlookMessage[] = [];
  const { access_token } = await authenticate();

  let reqURL = `${endPoints.mailURL}${endPoints.listMessages}`;
  do {
    const { data } = await axios.get(reqURL, {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    });
    messages = concat<OutlookMessage>(messages, data.value);
    reqURL = data["@odata.nextLink"];
  } while (reqURL);

  return messages;
}

export async function showMailsSubjectsAndTickets() {
  const mails = await getMails();
  let promises = mails.map((mail: any, i: any) => {
    console.log(
      `Mail ${i} , Subject : ${mail.subject || ""} ,` +
        (mail.categories && mail.categories.length
          ? `Ticket ${mail.categories}`
          : "No ticket")
    );
  });
  await Promise.all([promises]);
}
