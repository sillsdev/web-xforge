#!/usr/bin/env -S bash -c '"$(dirname "$0")"/node_modules/.bin/ts-node "$(dirname "$0")/$(basename "$0")" "$@"'
// The above causes the local ts-node to be used even if run from another directory. Setup: npm ci

// ping-rts - Query the state of the realtime server.
//
// This script tries connecting to the realtime server. Results include:
//   - "Unexpected server response: 401" when we are unauthorized (a good result here)
//   - "ECONNREFUSED" when the server is offline.
//   - "WebSocket was closed before the connection was established" when we timeout

import process from 'node:process';
import { io } from 'socket.io-client';
import { databaseConfigs } from './utils';

// Server to ping
const server: string = 'dev';

const programName = 'ping-rts';
function log(message: string) {
  const when = new Date().toISOString();
  console.log(`${when} ${programName}: ${message}`);
}

const uri: string | undefined = databaseConfigs.get(server)?.wsConnectionString;
if (uri == null) throw new Error('Could not find URI for server.');
const socket = io(uri, {
  transports: ['websocket'],
  timeout: 1000
});

socket.on('error', err => {
  log(`on error: ${err}`);
  console.log(err);
  process.exit(1);
});
socket.on('connect', () => {
  log(`on connect`);
  process.exit(1);
});
socket.on('disconnect', reason => {
  log(`on disconnect: ${reason}`);
  process.exit(1);
});

socket.on('connect_error', err => {
  log(`Socket Connect error: ${(err as any).description.message}`);
  process.exit(1);
});
