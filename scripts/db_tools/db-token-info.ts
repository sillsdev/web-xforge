#!/usr/bin/env -S bash -c '"$(dirname "$0")"/node_modules/.bin/ts-node "$(dirname "$0")/$(basename "$0")" "$@"'
// The above causes the local ts-node to be used even if run from another directory. Setup: npm ci

import { MongoClient } from 'mongodb';
import { exit } from 'node:process';
import { showJwt } from './show-jwt';
import { devConfig } from './utils';

// This script finds a user by email address and then looks up the Paratext access token for that user from the user
// secrets collection. It can be run by itself, or the token can be monitored by running e.g.
// watch -n 10 ./db-token-info.ts
// which will run the script every 10 seconds.

type UserSecret = {
  _id: string;
  paratextTokens: {
    accessToken: string;
    refreshToken: string;
  };
};

// Set to the email of the user to look up (here or via command line argument)
let email = '';
const args = process.argv.slice(2);
if (args.length > 0 && email === '') email = args[0];
if (email === '') {
  console.error('Specify user email.');
  exit(1);
}

// Set to the connection to fetch the token from
const connectionConfig = devConfig;

async function run() {
  const client = new MongoClient(connectionConfig.dbLocation);
  try {
    await client.connect();
    const db = client.db();
    const userCollection = db.collection<{ _id: string }>('users');
    const user = await userCollection.findOne({ email });
    const userId = user!._id;
    const userSecretsCollection = db.collection<UserSecret>('user_secrets');
    const userSecrets = await userSecretsCollection.findOne({ _id: userId });
    const jwt = userSecrets!.paratextTokens.accessToken;
    showJwt(jwt);
    console.log(`refresh_token: ${userSecrets!.paratextTokens.refreshToken}`);
  } finally {
    await client.close();
  }
}

run();
