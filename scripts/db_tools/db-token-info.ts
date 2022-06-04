#!./node_modules/.bin/ts-node

import { MongoClient } from 'mongodb';
import { showJwt } from './show-jwt';
import { devConfig } from './utils';

type UserSecret = {
  _id: string;
  paratextTokens: {
    accessToken: string;
    refreshToken: string;
  };
};

const email = '';
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
