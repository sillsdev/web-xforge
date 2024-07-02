#!/usr/bin/env -S bash -c '"$(dirname "$0")"/node_modules/.bin/ts-node "$(dirname "$0")/$(basename "$0")" "$@"'
// The above causes the local ts-node to be used even if run from another directory. Setup: npm ci

/**
 * Generates a TSV file with user edit counts by chapter for a given project within a given time range.
 * Usage: ./report-user-edits.ts
 *        --env [dev|qa|live] (default: dev)
 *        --project [project short name] (required)
 *        --from [YYYY-MM-DD] (optional)
 *        --to [YYYY-MM-DD] (optional)
 *        --outfile [filename] (default: [project]_[report]_([dateFrom]_to_[dateTo]).tsv)
 */

import diff from 'fast-diff';
import * as fs from 'fs';
import { AbstractCursor, Db, MongoClient } from 'mongodb';
import { DeltaOperation } from 'rich-text';
import { Connection } from 'sharedb/lib/client';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { colored, colors, ConnectionSettings, createWS, databaseConfigs, fetchSnapshotByVersion } from './utils';

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
  wordAdds: number;
  wordDeletes: number;
}

class UserEditReport {
  connectionConfig: ConnectionSettings;
  env: string;
  projectId?: string;
  projectShortName: string;
  from?: Date;
  to?: Date;
  outfile: string;

  fromPretty: string;
  toPretty: string;

  summary?: Map<string, UserEditData>;

  readonly reportName = 'user-edit-counts';

  constructor() {
    const args: ScriptArgs = this.processArgs();
    this.env = args.env!;
    this.connectionConfig = databaseConfigs.get(this.env)!;
    this.projectShortName = args.project;
    this.from = args.from ? new Date(args.from) : undefined;
    this.to = args.to ? new Date(args.to) : undefined;
    this.outfile = args.outfile!;

    this.fromPretty = this.formatDate(this.from) ?? 'beginning';
    this.toPretty = this.formatDate(this.to ?? new Date())!;
  }

  async run() {
    console.log(`Connecting to ${this.env} at ${this.connectionConfig.dbLocation}`);

    this.summary = new Map<string, UserEditData>();
    const client = new MongoClient(this.connectionConfig.dbLocation);
    const ws = createWS(this.connectionConfig);

    try {
      await client.connect();
      const conn = new Connection(ws);
      const cursor = await this.queryDB(client.db());
      let baselineSnapshotVersion = 0;
      let prevKey: string | null = null;
      let prevDoc: any = null;

      for await (const doc of cursor) {
        const isLastDoc = !(await cursor.hasNext());
        const key = this.initSummaryKey(doc);

        // Get initial key for comparison and get baseline from the version previous to the first queried doc
        if (prevKey == null) {
          baselineSnapshotVersion = doc.v;
          prevKey = key;
        }

        // Calc word count edits when the user or book/chapter changes
        if (key !== prevKey) {
          // Snapshot version is one more than op doc version
          await this.parseNetWordEdits(conn, prevDoc.d, baselineSnapshotVersion, prevDoc.v + 1, prevKey);

          // Update baseline for comparison to next user changes
          baselineSnapshotVersion = doc.v;
          prevKey = key;
        }

        if (isLastDoc) {
          // Calculate last doc word count edits
          await this.parseNetWordEdits(conn, doc.d, baselineSnapshotVersion, doc.v + 1, key);
        }

        // Add the raw edit counts to the summary
        this.parseRawEdits(doc, key);

        prevDoc = doc;
      }

      this.writeFile();
    } finally {
      ws.close();
      await client.close();
    }
  }

  /**
   * Formats a date to a string in the format 'YYYY-MM-DD'.
   */
  private formatDate(date: Date | undefined | null): string | undefined {
    return date?.toLocaleDateString('en-CA', { year: 'numeric', month: 'numeric', day: 'numeric' });
  }

  private getColorFunc(color: number) {
    return colored.bind(null, color);
  }

  private getOutfileName(): string {
    return this.outfile
      .replace(/\[project\]/g, this.projectShortName)
      .replace(/\[report\]/g, this.reportName)
      .replace(/\[dateFrom\]/g, this.fromPretty)
      .replace(/\[dateTo\]/g, this.toPretty);
  }

  /**
   * Get or create a key that represents the user and book/chapter.
   */
  private initSummaryKey(doc: any): string {
    if (this.summary == null) {
      throw new Error('Summary not initialized.');
    }

    const userId = doc.userId;
    const userDisplayName = doc.userDisplayName;

    const [_, book, chapter] = doc.d.split(':');
    const key = `${userId}|${book}|${chapter}`;

    if (!this.summary[key]) {
      this.summary[key] = {
        userId,
        userDisplayName,
        bookChapter: `${book}:${chapter}`,
        inserts: 0,
        deletes: 0,
        wordAdds: 0,
        wordDeletes: 0
      };
    }

    return key;
  }

  /**
   * Parses the net user word insert/delete counts between the two versions.
   */
  private async parseNetWordEdits(
    conn: Connection,
    docId: any,
    versionA: number,
    versionB: number,
    key: string
  ): Promise<void> {
    if (this.summary == null) {
      throw new Error('Summary not initialized.');
    }

    if (versionA === versionB) {
      throw new Error('Versions must be different.');
    }

    const user = this.summary[key].userDisplayName;
    const bookChapter = this.summary[key].bookChapter;
    const yellow = this.getColorFunc(colors.yellow);
    console.log(`\n${yellow(user)} - Net word edits for ${yellow(bookChapter)} v${versionA} -> v${versionB}`);

    const snapshotA = await fetchSnapshotByVersion(conn, 'texts', docId, versionA);
    const snapshotB = await fetchSnapshotByVersion(conn, 'texts', docId, versionB);
    const { inserts, deletes } = SnapshotDiffer.diffDocs(snapshotA.data.ops, snapshotB.data.ops);

    this.summary[key].wordAdds += inserts;
    this.summary[key].wordDeletes += deletes;
  }

  /**
   * Parses the user raw insert/delete counts in a projection from an o_text doc and adds it to the summary map.
   */
  private parseRawEdits(doc: any, key: string): void {
    if (this.summary == null) {
      throw new Error('Summary not initialized.');
    }

    for (const op of doc.op.ops) {
      if (typeof op.insert === 'string') {
        this.summary[key].inserts += op.insert.length;
      } else if (op.delete) {
        this.summary[key].deletes += op.delete;
      }
    }
  }

  private processArgs(): ScriptArgs {
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
        description: 'Project short name'
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
        default: '[project]_[report]_([dateFrom]_to_[dateTo]).tsv',
        requiresArg: true,
        description: 'File path to write report to'
      })
      .strict()
      .parseSync();
  }

  private async queryDB(db: Db): Promise<AbstractCursor> {
    const blue = this.getColorFunc(colors.lightBlue);

    console.log(
      `Querying edits for project "${blue(this.projectShortName)}" from ${blue(this.fromPretty)} to ${blue(
        this.toPretty
      )}.`
    );

    const startTime: number | undefined = this.from?.getTime();
    const endTime: number | undefined = this.to?.getTime();

    // First, find projects with given 'shortName' and get the project ids
    const projects = await db
      .collection('sf_projects')
      .find({ shortName: new RegExp(`^${this.projectShortName}$`, 'i') }, { projection: { _id: 1, shortName: 1 } })
      .toArray();

    // Ensure only one matching project (there are occasional collisions with short names)
    if (projects.length === 0) {
      throw new Error(`No project found with shortName ${this.projectShortName}`);
    } else if (projects.length > 1) {
      throw new Error(
        `Multiple projects found with shortName "${this.projectShortName}" ${projects.map(p => p._id).join(', ')}`
      );
    }

    this.projectId = projects[0]._id.toString();
    this.projectShortName = projects[0].shortName; // Update project short name to match case in db

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
          v: 1,
          op: 1,
          userId: 1,
          userDisplayName: 1
        }
      }
    ];

    return db.collection('o_texts').aggregate(pipeline);
  }

  /**
   * Stringifies a UserEditData object to a TSV row.
   */
  private toDataRow(data: UserEditData): string {
    return [data.userDisplayName, data.bookChapter, data.inserts, data.deletes, data.wordAdds, data.wordDeletes].join(
      '\t'
    );
  }

  /**
   * Converts a map of UserEditData objects to a TSV string.
   */
  private toTsv(summary: Map<string, UserEditData>): string {
    const title = `User edits on ${this.env} for project "${this.projectShortName} (${this.projectId})" from ${this.fromPretty} to ${this.toPretty}`;
    const header: string[] = [
      'User Name',
      'Book:Chapter',
      'Raw Insertions',
      'Raw Deletions',
      'Net Word Insertions',
      'Net Word Deletions'
    ];
    const dataRows: string[] = Object.values(summary).map(this.toDataRow);

    return [title + '\n', header.join('\t'), ...dataRows].join('\n');
  }

  private writeFile() {
    if (this.summary == null) {
      throw new Error('Summary not initialized.');
    }

    const outfile = this.getOutfileName();

    console.log(`\nWriting summary to "${outfile}"`);
    const encoder = new TextEncoder();
    fs.writeFileSync(outfile, encoder.encode(this.toTsv(this.summary)));
  }
}

class SnapshotDiffer {
  /**
   * Gets the word count number of inserts and deletes between two snapshots.
   */
  static diffDocs(opsA: DeltaOperation[], opsB: DeltaOperation[]): { inserts: number; deletes: number } {
    const rawDiff = this.createRawDiff(opsA, opsB);
    return this.processRawDiff(rawDiff);
  }

  private static countWords(text: string) {
    return text.trim().split(/\s+/).length;
  }

  private static createRawDiff(opsA: DeltaOperation[], opsB: DeltaOperation[]): [number, string][] {
    // Concat string inserts
    const aStr = opsA.map(op => (typeof op.insert === 'string' ? op.insert : '')).join('');
    const bStr = opsB.map(op => (typeof op.insert === 'string' ? op.insert : '')).join('');

    return diff(aStr, bStr, undefined, true);
  }

  private static processRawDiff(diffArr: [number, string][]): { inserts: number; deletes: number } {
    const result = {
      inserts: 0,
      deletes: 0
    };

    for (const [i, text] of diffArr) {
      const wordsChanged = this.countWords(text);

      if (i === 1) {
        console.log(`+${wordsChanged}`, colored(colors.lightGreen, text));
        result.inserts += wordsChanged;
      } else if (i === -1) {
        console.log(`-${wordsChanged}`, colored(colors.orange, text));
        result.deletes += wordsChanged;
      }
    }

    return result;
  }
}

new UserEditReport().run();
