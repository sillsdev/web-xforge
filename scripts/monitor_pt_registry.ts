#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-net

import { existsSync } from 'https://deno.land/std@0.223.0/fs/exists.ts';
import axios from 'npm:axios@1.6.8';

if (Deno.args.length !== 4 || Deno.args[0] !== '--client-id' || Deno.args[2] !== '--client-secret') {
  console.error('Usage: ./monitor_pt_registry.ts --client-id some_id --client-secret some_secret');
  Deno.exit(1);
}

const clientId = Deno.args[1];
const clientSecret = Deno.args[3];

const tokens = JSON.parse(Deno.readTextFileSync('tokens.json'));

const apiRoot = 'https://registry.paratext.org/api8';
let accessToken = tokens.access_token;
let refreshToken = tokens.refresh_token;
const intervalRefreshTokenMinutes = 5;
const intervalQueryMembersMinutes = 1;
const logFileName = 'request_log.json';

type RequestEvent = {
  timestamp: Date;
  endpoint: string;
  success: boolean;
  response_time_ms: number;
};

const requestLog: RequestEvent[] = existsSync(logFileName) ? JSON.parse(Deno.readTextFileSync(logFileName)) : [];

function logRequest(event: RequestEvent) {
  requestLog.push(event);
  Deno.writeTextFileSync(logFileName, JSON.stringify(requestLog, null, 2));
}

// Make sure tokens are up to date before starting
await refreshTokenWithRegistry();
const projectId = await getFirstPTProjectId();
setInterval(refreshTokenWithRegistry, 1000 * 60 * intervalRefreshTokenMinutes);
queryMembers();
setInterval(queryMembers, 1000 * 60 * intervalQueryMembersMinutes);

async function refreshTokenWithRegistry(): Promise<void> {
  const startTime = new Date();
  console.log(`${startTime.toISOString()} Refreshing token`);
  return await axios
    .post(`${apiRoot}/token`, {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    })
    .catch((error: any) => {
      const endTime = new Date();
      console.error(`Error: refreshTokenWithRegistry ${error.response.status} ${error.response.statusText}`);
      console.error(error.response.data);
      const duration = endTime.getTime() - startTime.getTime();
      logRequest({
        timestamp: startTime,
        endpoint: 'POST /token',
        success: false,
        response_time_ms: duration
      });
    })
    .then((response: any) => {
      const endTime = new Date();
      accessToken = response.data.access_token;
      refreshToken = response.data.refresh_token;
      console.log('Refreshed token');
      console.log('New access token:', accessToken);
      console.log('New refresh token:', refreshToken);

      const tokens = { access_token: accessToken, refresh_token: refreshToken };
      Deno.writeTextFileSync('tokens.json', JSON.stringify(tokens, null, 2));

      const duration = endTime.getTime() - startTime.getTime();
      logRequest({
        timestamp: startTime,
        endpoint: 'POST /token',
        success: true,
        response_time_ms: duration
      });
    });
}

async function getFirstPTProjectId(): Promise<string> {
  const userProjects = await queryProjects();
  return firstProjectId(userProjects);
}

async function queryProjects(): Promise<object[] | undefined> {
  const startTime = new Date();
  console.log(`${startTime.toISOString()} Querying projects`);
  let response;
  try {
    response = await axios.get(`${apiRoot}/projects`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`
      }
    });
  } catch (error) {
    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();
    console.error(`Error: queryProjects ${error.response.status} ${error.response.statusText}`);
    console.error(error.response.data);
    logRequest({
      timestamp: startTime,
      endpoint: 'GET /projects',
      success: false,
      response_time_ms: duration
    });
    return undefined;
  }
  const endTime = new Date();
  const duration = endTime.getTime() - startTime.getTime();
  logRequest({
    timestamp: startTime,
    endpoint: 'GET /projects',
    success: true,
    response_time_ms: duration
  });
  return response.data;
}

function firstProjectId(projects: any): string {
  return projects[0].identification_systemId.filter(item => item.type === 'paratext')[0].text;
}

async function queryMembers(): Promise<void> {
  const startTime = new Date();
  console.log(`${startTime.toISOString()} Querying members`);
  return await axios
    .get(`${apiRoot}/projects/${projectId}/members`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`
      }
    })
    .catch((error: any) => {
      const endTime = new Date();
      console.error(`Error: queryMembers ${error.response.status} ${error.response.statusText}`);
      console.error(error.response.data);
      const duration = endTime.getTime() - startTime.getTime();
      logRequest({
        timestamp: startTime,
        endpoint: 'GET /projects/id/members',
        success: false,
        response_time_ms: duration
      });
    })
    .then((response: any) => {
      const endTime = new Date();
      console.log(response.data);
      const duration = endTime.getTime() - startTime.getTime();
      logRequest({
        timestamp: startTime,
        endpoint: 'GET /projects/id/members',
        success: true,
        response_time_ms: duration
      });
    });
}
