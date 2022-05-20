#!./node_modules/.bin/ts-node
//
// Manipulate sharedb
//
// This script needs ts-node and must be run from the containing directory. Setup: npm ci
// Usage info: ./manipulate-sharedb.ts --help
// Example: ./manipulate-sharedb.ts --server live

import * as RichText from 'rich-text';
import { Db, MongoClient } from 'mongodb';
import ShareDB from 'sharedb';
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

  /** Run the lambda with a connection to the db. */
  async withDB(activity: (conn: Connection, db: Db) => Promise<void>): Promise<void> {
    if (this.connectionConfig == null) {
      throw new Error('null connection config');
    }
    console.log(`Connecting to ${this.server}.`);
    const ws: WebSocket = createWS(this.connectionConfig);
    const conn: Connection = new Connection(ws);

    const client: MongoClient = await MongoClient.connect(this.connectionConfig.dbLocation);
    try {
      const db: Db = client.db();
      await activity(conn, db);
    } finally {
      client.close();
      (conn as any).close();
    }
  }

  async main() {
    ShareDB.types.register(RichText.type);
    await this.withDB(async (conn: Connection, db: Db) => {
      // Here, manipulate sharedb or mongodb.
      // For example:
      // const userDoc: Doc = conn.get('users', '1234');
      // await fetchDoc(userDoc);
      // console.log(JSON.stringify(userDoc.data));
      // await submitDocOp(userDoc, {
      //   p: ['paratextId'],
      //   od: 'abc123'
      // });
      // Example by applying a diff:
      // const origOps: DeltaOperation[] = textDoc.data.ops.slice();
      // const updatedOps: DeltaOperation[] = textDoc.data.ops.splice(1, 7);
      // const diff = textDoc.type.diff(origOps, updatedOps);
      // await submitDocOp(textDoc, diff);

    });
  }
}

const program = new Program();
program.main();
