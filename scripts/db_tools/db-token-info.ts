#!./node_modules/.bin/ts-node

import { MongoClient } from 'mongodb';
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

// Set to the email of the user to look up
const email = '';
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
  } finally {
    client.close();
  }
}

run();
