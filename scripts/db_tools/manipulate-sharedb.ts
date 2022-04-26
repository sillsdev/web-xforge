#!./node_modules/.bin/ts-node
//
// Manipulate sharedb
//
// Copyright 2022 SIL International. MIT License.
//
// This script needs ts-node and must be run from the containing directory. Setup: npm ci
// Usage info: ./manipulate-sharedb.ts --help
// Example: ./manipulate-sharedb.ts --server live

import { Db, MongoClient } from 'mongodb';
import { Connection } from 'sharedb/lib/client';
import WebSocket from 'ws';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ConnectionSettings, createWS, databaseConfigs, useColor } from './utils';

type ProgArgs = {
  server: string;
  color: boolean;
};

class Program {
  server: string | undefined;
  connectionConfig: ConnectionSettings | undefined;

  constructor() {
    this.processArguments();
  }

  processArguments() {
    const args: ProgArgs = yargs(hideBin(process.argv))
      .option('color', {
        type: 'boolean',
        default: true,
        description: 'colourize output (turn off with --no-color)'
      })
      .option('server', {
        type: 'string',
        choices: ['dev', 'qa', 'live'],
        default: 'dev',
        requiresArg: true,
        description: 'server to connect to'
      })
      .strict()
      .parseSync();

    const shouldUseColor: boolean = args.color;
    useColor(shouldUseColor);
    this.server = args.server;
    this.connectionConfig = databaseConfigs.get(this.server);
  }

  async withDB(activity: (conn: Connection, db: Db) => Promise<void>): Promise<void> {
    if (this.connectionConfig == null) {
      throw new Error('null connection config');
    }
    console.log(`Connecting to ${this.server}.`);
    const ws: WebSocket = createWS(this.connectionConfig);
    const conn: Connection = new Connection(ws);

    const client: MongoClient = await MongoClient.connect(this.connectionConfig.dbLocation, {
      useUnifiedTopology: true
    });
    try {
      const db: Db = client.db();
      await activity(conn, db);
    } finally {
      client.close();
      (conn as any).close();
    }
  }

  async main() {
    this.withDB(async (conn: Connection, db: Db) => {
      // Here, manipulate sharedb or mongodb.
      // For example:
      // const userDoc: Doc = conn.get('users', '1234');
      // await fetchDoc(userDoc);
      // console.log(JSON.stringify(userDoc.data));
      // await submitDocOp(userDoc, {
      //   p: ['paratextId'],
      //   od: 'abc123'
      // });
    });
  }
}

const program = new Program();
program.main();
