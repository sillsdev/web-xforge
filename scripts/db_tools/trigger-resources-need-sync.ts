#!/usr/bin/env -S bash -c '"$(dirname "$0")"/node_modules/.bin/ts-node "$(dirname "$0")/$(basename "$0")" "$@"'
// The above causes the local ts-node to be used even if run from another directory. Setup: npm i

import * as RichText from 'rich-text';
import { Db, MongoClient } from 'mongodb';
import ShareDB from 'sharedb';
import { Connection, Doc } from 'sharedb/lib/client';
import WebSocket from 'ws';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ConnectionSettings, createWS, databaseConfigs, submitDocOp } from './utils';
import { SFProject } from '../../src/RealtimeServer/scriptureforge/models/sf-project';

type ProgArgs = {
  server: string;
};

class Program {
  server: string | undefined;
  connectionConfig: ConnectionSettings | undefined;

  constructor() {
    this.processArguments();
  }

  processArguments() {
    const args: ProgArgs = yargs(hideBin(process.argv))
      .option('server', {
        type: 'string',
        choices: ['dev', 'qa', 'live'],
        default: 'dev',
        requiresArg: true,
        description: 'server to connect to'
      })
      .strict()
      .parseSync();

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
      await client.close();
      (conn as any).close();
    }
  }

  async main() {
    ShareDB.types.register(RichText.type);
    await this.withDB(async (conn: Connection, db: Db) => {
      // This script marks all resources so they need to be synchronized.

      const SF_PROJECTS_COLLECTION = 'sf_projects';
      await new Promise<void>((resolve, reject) => {
        conn.createFetchQuery(
          SF_PROJECTS_COLLECTION,
          { resourceConfig: { $exists: true } },
          {},
          async (err, results: Doc[]) => {
            if (err) {
              console.error('Error fetching documents:', err);
              return;
            }

            console.log(`Fetched ${results.length} documents.`);
            for (const projDoc of results) {
              const proj: SFProject = projDoc.data;
              console.log(`${proj.shortName} had resourceConfig.revision ${proj.resourceConfig?.revision}`);
              if (proj.resourceConfig != null) {
                await submitDocOp(projDoc, {
                  p: ['resourceConfig', 'revision'],
                  od: proj.resourceConfig.revision,
                  oi: -1
                });
              }
            }
            resolve();
          }
        );
      });
    });
  }
}

const program = new Program();
program.main();
