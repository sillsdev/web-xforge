#!/usr/bin/env -S bash -c '"$(dirname "$0")"/node_modules/.bin/ts-node "$(dirname "$0")/$(basename "$0")" "$@"'
// The above causes the local ts-node to be used even if run from another directory. Setup: npm ci

/**
 * Generates a TSV file with user comment counts by chapter for a given project within a given time range.
 * Usage: ./report-user-comments.ts
 *        --env [dev|qa|live] (default: dev)
 *        --project [project short name] (required)
 *        --from [YYYY-MM-DD] or YYYY-MM-DDTHH:MM:SS (optional)
 *        --to [YYYY-MM-DD] or YYYY-MM-DDTHH:MM:SS (optional)
 *        --outfile [filename] (default: [project]_[report]_([dateFrom]_to_[dateTo]).tsv)
 */

import { Canon } from '@sillsdev/scripture';
import * as fs from 'fs';
import { AbstractCursor, Db, MongoClient } from 'mongodb';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { colored, colors, ConnectionSettings, createWS, databaseConfigs } from './utils';

interface ScriptArgs {
  env?: string;
  project: string;
  from?: string;
  to?: string;
  outfile?: string;
}

interface UserCommentData {
  userId: string;
  userName: string;
  bookChapter: string;
  commentCount: number;
}

class UserCommentReport {
  connectionConfig: ConnectionSettings;
  env: string;
  projectId?: string;
  projectShortName: string;
  from?: Date;
  to?: Date;
  outfile: string;

  fromPretty: string;
  toPretty: string;

  summary?: Map<string, UserCommentData[]>;

  readonly reportName = 'user-comment-counts';

  constructor() {
    const args: ScriptArgs = this.processArgs();
    this.env = args.env!;
    this.connectionConfig = databaseConfigs.get(this.env)!;
    this.projectShortName = args.project;
    this.from = this.toDate(args.from, 'start-of-day'); // Use start of day for 'from' date if time not specified
    this.to = this.toDate(args.to, 'end-of-day'); // Use end of day for 'to' date if time not specified
    this.outfile = args.outfile!;

    this.fromPretty = this.formatDate(this.from) ?? 'beginning';
    this.toPretty = this.formatDate(this.to ?? new Date())!;
  }

  async run() {
    console.log(`Connecting to ${this.env} at ${this.connectionConfig.dbLocation}`);

    this.summary = new Map<string, UserCommentData[]>();
    const client = new MongoClient(this.connectionConfig.dbLocation);
    const ws = createWS(this.connectionConfig);

    try {
      await client.connect();
      const cursor = await this.queryDB(client.db());

      for await (const doc of cursor) {
        this.summary.set(
          doc.userId,
          doc.chapterNotes.map((item: any) => ({
            userId: doc.userId,
            userName: doc.userName,
            bookChapter: this.getBookChapter(item.bookNum, item.chapterNum),
            commentCount: item.noteCount
          }))
        );
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

  private getBookChapter(bookNum: number, chapterNum: number): string {
    const book = Canon.bookNumberToId(bookNum);
    return `${book}:${chapterNum}`;
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
   * Converts a date string from 'YYYY-M-D' to 'YYYY-MM-DD'.  Time is preserved if present.
   */
  private normalizeDateString(date: string): string {
    const [dateToken, timeToken] = date.split('T');
    const [year, month, day] = dateToken.split('-').map(Number);

    let normalizedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    const timeSuffix = timeToken ? `T${timeToken}` : '';

    return normalizedDate + timeSuffix;
  }

  /**
   * Converts the date string to a Date object. 'time' specifies the time to use if time not present in the date string.
   */
  private toDate(dateString: string | undefined, time: 'start-of-day' | 'end-of-day'): Date | undefined {
    if (dateString == null) {
      return undefined;
    }

    const normalizedDateString: string = this.normalizeDateString(dateString);
    let timeString: string = '';

    // Add time if not already present in date string
    if (!normalizedDateString.includes('T')) {
      timeString = `T${time === 'start-of-day' ? '00:00' : '23:59:59'}`;
    }

    return new Date(this.normalizeDateString(normalizedDateString) + timeString);
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
        description: 'Start date in the format YYYY-M-D or YYYY-MM-DDTHH:MM:SS'
      })
      .option('to', {
        type: 'string',
        requiresArg: true,
        description: 'End date in the format YYYY-M-D or YYYY-MM-DDTHH:MM:SS'
      })
      .option('outfile', {
        type: 'string',
        default: '[project]_[report]_([dateFrom]_to_[dateTo]).tsv',
        requiresArg: true,
        description: 'File path to write report to'
      })
      .check(argv => {
        const dateFormatRegex = /^\d{4}-\d{1,2}-\d{1,2}(T\d{2}:\d{2}(:\d{2})?)?$/;

        if (argv.from && !dateFormatRegex.test(argv.from)) {
          throw new Error("The 'from' date must be in the format YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS");
        }

        if (argv.to && !dateFormatRegex.test(argv.to)) {
          throw new Error("The 'to' date must be in the format YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS");
        }

        if (argv.from && argv.to && new Date(argv.from) > new Date(argv.to)) {
          throw new Error('Start date must be before end date');
        }

        return true;
      })
      .strict()
      .parseSync();
  }

  private async queryDB(db: Db): Promise<AbstractCursor> {
    const blue = this.getColorFunc(colors.lightBlue);

    console.log(
      `Querying comments for project "${blue(this.projectShortName)}" from ${blue(this.fromPretty)} to ${blue(
        this.toPretty
      )}.`
    );

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

    return db.collection('note_threads').aggregate([
      {
        $unwind: '$notes'
      },
      {
        // Convert date string to date object
        $addFields: {
          'notes.dateModifiedDate': { $toDate: '$notes.dateModified' }
        }
      },
      {
        $match: {
          projectRef: this.projectId,
          'notes.threadId': { $not: /^BT_/ },
          'notes.type': { $ne: 'conflict' },
          'notes.content': { $exists: true },
          // Time range if provided
          ...((this.from || this.to) && {
            'notes.dateModifiedDate': {
              ...(this.from && { $gte: this.from }),
              ...(this.to && { $lte: this.to })
            }
          })
        }
      },
      {
        $group: {
          _id: {
            ownerRef: '$notes.ownerRef',
            bookNum: '$verseRef.bookNum',
            chapterNum: '$verseRef.chapterNum'
          },
          noteCount: { $sum: 1 }
        }
      },
      {
        $sort: {
          '_id.bookNum': 1,
          '_id.chapterNum': 1
        }
      },
      {
        $group: {
          _id: '$_id.ownerRef',
          chapterNotes: {
            $push: {
              bookNum: '$_id.bookNum',
              chapterNum: '$_id.chapterNum',
              noteCount: '$noteCount'
            }
          }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          userName: '$user.name',
          chapterNotes: 1
        }
      }
    ]);
  }

  /**
   * Stringifies a UserCommentData object to a TSV row.
   */
  private toDataRow(data: UserCommentData): string {
    return [data.userName, data.bookChapter, data.commentCount].join('\t');
  }

  private toTsv(summary: Map<string, UserCommentData[]>): string {
    const title = `User comments on ${this.env} for project "${this.projectShortName} (${this.projectId})" from ${this.fromPretty} to ${this.toPretty}`;
    const header: string[] = ['User Name', 'Book:Chapter', 'Comment Count'];
    const userDataGroups: string[] = [];

    for (const userBookChapterNotes of summary.values()) {
      userDataGroups.push(...userBookChapterNotes.map(this.toDataRow));
    }

    return [title + '\n', header.join('\t'), ...userDataGroups].join('\n');
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

new UserCommentReport().run();
