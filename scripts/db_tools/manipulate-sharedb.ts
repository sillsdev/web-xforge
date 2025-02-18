#!/usr/bin/env -S bash -c '"$(dirname "$0")"/node_modules/.bin/ts-node "$(dirname "$0")/$(basename "$0")" "$@"'
// The above causes the local ts-node to be used even if run from another directory. Setup: npm i
//
// Manipulate sharedb
//
// This script needs ts-node and must be run from the containing directory. Setup: npm ci
// Usage info: ./manipulate-sharedb.ts --help
// Example: ./manipulate-sharedb.ts --server live

import { Db, MongoClient } from 'mongodb';
import * as RichText from 'rich-text';
import ShareDB from 'sharedb';
import { Connection, Doc } from 'sharedb/lib/client';
import WebSocket from 'ws';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import utils from './utils';

type ProgArgs = {
  server: string;
  color: boolean;
};

class Program {
  server: string | undefined;
  connectionConfig: utils.ConnectionSettings | undefined;

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
    utils.useColor(shouldUseColor);
    this.server = args.server;
    this.connectionConfig = utils.databaseConfigs.get(this.server);
  }

  /** Run the lambda with a connection to the db. */
  async withDB(activity: (conn: Connection, db: Db) => Promise<void>): Promise<void> {
    if (this.connectionConfig == null) {
      throw new Error('null connection config');
    }
    console.log(`Connecting to ${this.server}.`);
    const ws: WebSocket = utils.createWS(this.connectionConfig);
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

  // /** Example method that makes changes to a document by omitting ops and applying the diff. */
  // private async makeAndApplyOpDiff(doc: Doc, docId: string) {
  //   // Needs:
  //   // import * as child_process from 'child_process';
  //   // import * as fs from 'fs/promises';

  //   function isGoodOp(op: any) {
  //     if (op.insert != null && typeof op.insert === 'object' && op.insert.hasOwnProperty('link')) {
  //       console.log('bad:', op);
  //       return false;
  //     }
  //     return true;
  //   }

  //   const origOps: RichText.DeltaOperation[] = doc.data.ops.slice();
  //   // utils.visualizeOps(origOps, false);
  //   const changedOps = doc.data.ops.filter((op: any) => isGoodOp(op));
  //   const origOpsFilepath = `/tmp/${docId}-origOps.txt`;
  //   const changedOpsFilepath = `/tmp/${docId}-changedOps.txt`;
  //   await fs.writeFile(origOpsFilepath, JSON.stringify(origOps, null, 2));
  //   await fs.writeFile(changedOpsFilepath, JSON.stringify(changedOps, null, 2));
  //   console.log(`Wrote original ops to ${origOpsFilepath} and changed ops to ${changedOpsFilepath} for inspection.`);

  //   const diffProcess = child_process.spawnSync('diff', ['-U0', origOpsFilepath, changedOpsFilepath]);
  //   const textDiff = diffProcess.stdout.toString();
  //   console.log('Text diff between them:', textDiff);

  //   const diff = doc.type.diff(origOps, changedOps);
  //   console.log('Diff ops:', diff);
  //   // await utils.submitDocOp(doc, diff);
  // }

  async main() {
    ShareDB.types.register(RichText.type);
    await this.withDB(async (conn: Connection, db: Db) => {
      // Here, manipulate sharedb or mongodb.

      const docCollectionName: string = 'texts';
      const docIdsToProcess: string[] = [
        // '123456789012345678901234:MAT:1:target',
        // '213456789012345678902345:JHN:2:target',
      ];

      for (const docId of docIdsToProcess) {
        console.log(`Processing doc id ${docId}`);
        const doc: Doc = conn.get(docCollectionName, docId);
        await utils.fetchDoc(doc);
        console.log(`Original doc data:`, JSON.stringify(doc.data, null, 2));

        // // Example changing a user doc field value:
        // await utils.submitDocOp(doc, {
        //   // Path to the field to update, expressed as an array of strings, such as "['resourceConfig', 'revision']".
        //   p: ['paratextId'],
        //   // Old value:
        //   od: 'abc123',
        //   // New value:
        //   oi: 'def456'
        // });

        // // Example applying a diff to a text doc:
        // const origOps: RichText.DeltaOperation[] = doc.data.ops.slice();
        // const updatedOps: RichText.DeltaOperation[] = doc.data.ops.splice(1, 7);
        // const diff = doc.type.diff(origOps, updatedOps);
        // await utils.submitDocOp(doc, diff);

        // // Example modifying ops and applying the resulting diff:
        // await this.makeAndApplyOpDiff(doc, docId);
      }
    });
  }
}

const program = new Program();
program.main();
