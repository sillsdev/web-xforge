#!/usr/bin/env -S bash -c '"$(dirname "$0")"/node_modules/.bin/ts-node "$(dirname "$0")/$(basename "$0")" "$@"'
// The above causes the local ts-node to be used even if run from another directory. Setup: npm i
//
// Manage DB
//
// This script connects to the database and runs JavaScript code specified on the command line. This is useful for small
// tasks that don't merit their own script, and without modifying versioned files.
//
// For example, remove a doc from a Mongo db collection:
/*
  ./manage-db.ts --server dev --eval "
    const sfUserId = "111111111111111111111111";
    console.log('Removing user secret doc id', sfUserId);
    await db.collection('user_secrets').findOneAndDelete({ _id: sfUserId });
  "
*/
// More complex example allowing values to be set from Bash, and using ShareDB / realtime server to change a project's
// resourceConfig.revision field:
/*
  # Setting values ahead of time in Bash.
  collection="sf_projects"
  id="111111111111111111111111"
  field="['resourceConfig', 'revision']"
  oldValue="8"
  newValue="-1"
  # Run script, consuming those values.
  ./manage-db.ts --server dev --eval "
    const id = \"${id}\";
    const collection = \"${collection}\";
    const field = eval(\"${field}\");
    const oldValue = \"${oldValue}\";
    const newValue = \"${newValue}\";
    const doc = conn.get(collection, id);
    await utils.fetchDoc(doc);
    console.log('Orig doc data:', doc.data);
    await utils.submitDocOp(doc, {
      p: field,
      od: oldValue,
    oi: newValue
    });
  "
*/

import { Db, MongoClient } from 'mongodb';
import * as RichText from 'rich-text';
import ShareDB from 'sharedb';
import { Connection } from 'sharedb/lib/client';
import WebSocket from 'ws';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import utilsLib from './utils';

type ProgArgs = {
  server: string;
  eval: string;
};

class Program {
  server: string = 'dev';
  connectionConfig: utilsLib.ConnectionSettings | undefined;
  codeToRun: string = 'console.log("Hello.");';

  constructor() {
    this.processArguments();
  }

  processArguments() {
    const args: ProgArgs = yargs(hideBin(process.argv))
      .option('server', {
        type: 'string',
        choices: ['dev', 'qa', 'live'],
        default: this.server,
        requiresArg: true,
        description: 'server to connect to'
      })
      .option('eval', {
        type: 'string',
        requiresArg: true,
        description: 'code to run',
        default: this.codeToRun
      })
      .strict()
      .parseSync();

    this.server = args.server;
    this.connectionConfig = utilsLib.databaseConfigs.get(this.server);
    this.codeToRun = args.eval;
  }

  /** Run the lambda with a connection to the db. */
  async withDB(activity: (conn: Connection, db: Db) => Promise<void>): Promise<void> {
    if (this.connectionConfig == null) throw new Error('null connection config');
    console.log(`Connecting to ${this.server}.`);
    const ws: WebSocket = utilsLib.createWS(this.connectionConfig);
    const conn: Connection = new Connection(ws);
    const client: MongoClient = await MongoClient.connect(this.connectionConfig.dbLocation);
    try {
      const db: Db = client.db();
      await activity(conn, db);
    } finally {
      await client.close();
      (conn as any).close();
    }
  }

  async main() {
    ShareDB.types.register(RichText.type);
    await this.withDB(async (conn: Connection, db: Db) => {
      const utils: any = utilsLib;
      const evaluation = eval(`async () => { ${this.codeToRun}}`);
      await evaluation();
    });
  }
}

const program = new Program();
program.main();
