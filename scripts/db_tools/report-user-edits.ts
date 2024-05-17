#!/usr/bin/env -S bash -c '"$(dirname "$0")"/node_modules/.bin/ts-node "$(dirname "$0")/$(basename "$0")" "$@"'
// The above causes the local ts-node to be used even if run from another directory. Setup: npm ci

/**
 * Generates a TSV file with user edit counts by chapter for a given project within a given time range.
 * Usage: ./report-user-edits.ts
 *        --env [dev|qa|live] (default: dev)
 *        --project [projectId] (required)
 *        --from [YYYY-MM-DD] (optional)
 *        --to [YYYY-MM-DD] (optional)
 *        --outfile [filename] (default: summary.tsv)
 */

import * as fs from 'fs';
import { AbstractCursor, Db, MongoClient } from 'mongodb';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ConnectionSettings, databaseConfigs } from './utils';

interface ScriptArgs {
  env?: string;
  project: string;
  from?: string;
  to?: string;
  outfile?: string;
}

interface UserEditData {
  userId: string;
  userDisplayName: string;
  bookChapter: string;
  inserts: number;
  deletes: number;
}

class UserEditReport {
  connectionConfig: ConnectionSettings;
  env: string;
  projectId: string;
  from?: Date;
  to?: Date;
  outfile: string;

  fromPretty: string;
  toPretty: string;

  summary = new Map<string, UserEditData>();

  constructor() {
    const args: ScriptArgs = this.processArguments();
    this.env = args.env!;
    this.connectionConfig = databaseConfigs.get(this.env)!;
    this.projectId = args.project;
    this.from = args.from ? new Date(args.from) : undefined;
    this.to = args.to ? new Date(args.to) : undefined;
    this.outfile = args.outfile!;

    this.fromPretty = this.from?.toLocaleDateString() ?? 'beginning';
    this.toPretty = this.to?.toLocaleDateString() ?? 'now';
  }

  /**
   * Converts a map of UserEditData objects to a TSV string.
   */
  toTsv(dataMap: Map<string, UserEditData>): string {
    const title = `User edits on ${this.env} for project "${this.projectId}" from ${this.fromPretty} to ${this.toPretty}`;
    const header: string[] = ['User ID', 'User Name', 'Book:Chapter', 'Insertions', 'Deletions'];
    const dataRows: string[] = Object.values(dataMap).map(this.toDataRow);

    return [title + '\n', header.join('\t'), ...dataRows].join('\n');
  }

  /**
   * Stringifies a UserEditData object to a TSV row.
   */
  toDataRow(editData: UserEditData): string {
    return [editData.userId, editData.userDisplayName, editData.bookChapter, editData.inserts, editData.deletes].join(
      '\t'
    );
  }

  /**
   * Parses the user edits in a projection from an o_text doc and adds it to the summary map.
   */
  parseEdits(doc: any): void {
    const userId = doc.userId;
    const userDisplayName = doc.userDisplayName;

    const [_, book, chapter] = doc.d.split(':');
    const key = `${userId}|${book}|${chapter}`;

    if (!this.summary[key]) {
      this.summary[key] = { userId, userDisplayName, bookChapter: `${book}:${chapter}`, inserts: 0, deletes: 0 };
    }

    for (const op of doc.op.ops) {
      if (typeof op.insert === 'string') {
        this.summary[key].inserts += op.insert.length;
      } else if (op.delete) {
        this.summary[key].deletes += op.delete;
      }
    }
  }

  writeFile() {
    console.log(`Writing summary to "${this.outfile}"`);
    const encoder = new TextEncoder();
    fs.writeFileSync(this.outfile, encoder.encode(this.toTsv(this.summary)));
  }

  queryDB(db: Db): AbstractCursor {
    console.log(`Querying edits for project ${this.projectId} from ${this.fromPretty} to ${this.toPretty}.`);

    const startTime: number | undefined = this.from?.getTime();
    const endTime: number | undefined = this.to?.getTime();

    const query = {
      d: new RegExp(`^${this.projectId}:`),
      'm.uId': { $exists: true }, // User id that performed the edit
      'op.ops': { $exists: true }, // Present for edits (not creates)
      // Time range if provided
      ...((startTime || endTime) && {
        'm.ts': {
          ...(startTime && { $gte: startTime }),
          ...(endTime && { $lte: endTime })
        }
      })
    };

    const pipeline = [
      {
        $match: query
      },
      // Join users collection to get user display name
      {
        $lookup: {
          from: 'users',
          localField: 'm.uId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $addFields: {
          userDisplayName: '$user.name',
          userId: '$m.uId'
        }
      },
      {
        $project: {
          d: 1,
          op: 1,
          userId: 1,
          userDisplayName: 1
        }
      }
    ];

    return db.collection('o_texts').aggregate(pipeline);
  }

  async run() {
    console.log(`Connecting to ${this.env} at ${this.connectionConfig.dbLocation}`);

    const client = new MongoClient(this.connectionConfig.dbLocation);

    try {
      await client.connect();
      const cursor = this.queryDB(client.db());

      for await (const doc of cursor) {
        this.parseEdits(doc);
      }

      this.writeFile();
    } finally {
      await client.close();
    }
  }

  processArguments(): ScriptArgs {
    return yargs(hideBin(process.argv))
      .option('env', {
        type: 'string',
        choices: ['dev', 'qa', 'live'],
        default: 'dev',
        requiresArg: true,
        description: 'DB env'
      })
      .option('project', {
        type: 'string',
        requiresArg: true,
        demandOption: true,
        description: 'Project ID'
      })
      .option('from', {
        type: 'string',
        requiresArg: true,
        description: 'Start date in the format YYYY-M-D'
      })
      .option('to', {
        type: 'string',
        requiresArg: true,
        description: 'End date in the format YYYY-M-D'
      })
      .option('outfile', {
        type: 'string',
        default: 'summary.tsv',
        requiresArg: true,
        description: 'File path to write report to'
      })
      .strict()
      .parseSync();
  }
}

new UserEditReport().run();
