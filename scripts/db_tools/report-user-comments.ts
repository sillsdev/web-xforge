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
import { colored, colors, ConnectionSettings, databaseConfigs } from './utils';

interface ScriptArgs {
  env?: string;
  project: string;
  from?: string;
  to?: string;
  outfile?: string;
}

interface UserCommentReportData {
  years: UserCommentReportYearData[];
}

interface UserCommentReportYearData {
  year: number;
  months: UserCommentReportMonthData[];
}

interface UserCommentReportMonthData {
  month: number;
  users: UserCommentReportUserData[];
}

interface UserCommentReportUserData {
  userId: string;
  userName: string;
  bookChapters: UserCommentReportBookChapterData[];
}

interface UserCommentReportBookChapterData {
  bookChapter: string;
  noteCount: number;
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

  summary: UserCommentReportData = { years: [] };

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

    const client = new MongoClient(this.connectionConfig.dbLocation);

    try {
      await client.connect();
      const cursor = await this.queryDB(client.db());

      this.summary = { years: [] };

      for await (const doc of cursor) {
        this.summary.years.push({
          year: doc._id,
          months: doc.months.map((month: any) => ({
            month: month.month,
            users: month.users.map((user: any) => ({
              userId: user.userId,
              userName: user.userName,
              bookChapters: user.bookChapters.map((item: any) => ({
                bookChapter: this.getBookChapter(item.bookNum, item.chapterNum),
                noteCount: item.noteCount
              }))
            }))
          }))
        });
      }

      this.writeFile();
    } finally {
      await client.close();
    }
  }

  /**
   * Formats a date to a string in the format 'YYYY-MM-DD'.
   */
  private formatDate(date: Date | undefined | null): string | undefined {
    return date?.toLocaleDateString('en-CA', { year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  }

  /**
   * Formats a book number and chapter number to a string in the format 'book:chapter'.
   */
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

    const normalizedDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    let timeSuffix = timeToken ? `T${timeToken}` : '';

    // If timeSuffix contains timezone info ('+', '-', or ends with 'Z'), don't modify, as user has specified time zone.
    // Otherwise, append 'Z' to indicate UTC time.
    if (timeSuffix !== '' && !/[+\-Z]/.test(timeSuffix)) {
      timeSuffix += 'Z';
    }

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

    // Add time if not already present in date string.  Use UTC.
    if (!normalizedDateString.includes('T')) {
      timeString = `T${time === 'start-of-day' ? '00:00Z' : '23:59:59Z'}`;
    }

    return new Date(normalizedDateString + timeString);
  }

  /**
   * Returns the name of the month given its number (1-12).
   */
  getMonthName(month: number): string {
    const date = new Date();
    date.setMonth(month - 1); // Months are 0-indexed
    return date.toLocaleString('default', { month: 'long' });
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
        // Flexibility for month and day (1 or 2 digits), as this will be normalized later.  Optional timezone suffix.
        const dateFormatRegex =
          /^\d{4}-\d{1,2}-\d{1,2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+\-]\d{2}:?\d{2})?)?$/;

        if (argv.from && !dateFormatRegex.test(argv.from)) {
          throw new Error("The 'from' date must be in the format YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS");
        }

        if (argv.to && !dateFormatRegex.test(argv.to)) {
          throw new Error("The 'to' date must be in the format YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS");
        }

        if (argv.from && argv.to && new Date(argv.from) >= new Date(argv.to)) {
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
        // Unwind the notes array to process each note document individually
        $unwind: '$notes'
      },
      {
        // Convert the dateModified field from string to date object for each note
        $addFields: {
          'notes.dateModifiedDate': { $toDate: '$notes.dateModified' }
        }
      },
      {
        // Filter for project, date range, and notes that are not conflict notes or biblical terms notes (BT_)
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
        // Group by year, month, userId, bookNum, and chapterNum, and count the number of notes
        $group: {
          _id: {
            year: { $year: '$notes.dateModifiedDate' },
            month: { $month: '$notes.dateModifiedDate' },
            userId: '$notes.ownerRef',
            bookNum: '$verseRef.bookNum',
            chapterNum: '$verseRef.chapterNum'
          },
          noteCount: { $sum: 1 }
        }
      },
      {
        // Sort the grouped results by year, month, bookNum, and chapterNum in ascending order
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
          '_id.bookNum': 1,
          '_id.chapterNum': 1
        }
      },
      {
        // Regroup the documents by year, month, and userId to collect book chapters and their note counts
        $group: {
          _id: {
            year: '$_id.year',
            month: '$_id.month',
            userId: '$_id.userId'
          },
          bookChapters: {
            $push: {
              bookNum: '$_id.bookNum',
              chapterNum: '$_id.chapterNum',
              noteCount: '$noteCount'
            }
          }
        }
      },
      {
        // Sort the regrouped results by year, month, and userId in ascending order
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
          '_id.userId': 1
        }
      },
      {
        // Lookup user details from the 'users' collection based on userId
        $lookup: {
          from: 'users',
          localField: '_id.userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        // Unwind the user details to grab the user name
        $unwind: '$user'
      },
      {
        // Project year, month, userId, userName, and book chapters with their note counts
        $project: {
          _id: 1,
          userName: '$user.name',
          bookChapters: 1
        }
      },
      {
        // Group by year and month, pushing user details and their book chapters into an array
        $group: {
          _id: {
            year: '$_id.year',
            month: '$_id.month'
          },
          users: {
            $push: {
              userId: '$_id.userId',
              userName: '$userName',
              bookChapters: '$bookChapters'
            }
          }
        }
      },
      {
        // Sort by year and month
        $sort: {
          '_id.year': 1,
          '_id.month': 1
        }
      },
      {
        // Group by year to collect all months, including the users and their book chapters for each month
        $group: {
          _id: '$_id.year',
          months: {
            $push: {
              month: '$_id.month',
              users: '$users'
            }
          }
        }
      },
      {
        // Sort the final output by year
        $sort: {
          _id: 1
        }
      }
    ]);
  }

  private toTsv(summary: UserCommentReportData): string {
    const header: string[] = ['Year', 'Month', 'User Name', 'Book:Chapter', 'Comment Count'];
    const data = [];

    for (const yearData of summary.years) {
      data.push(yearData.year);

      for (const monthData of yearData.months) {
        data.push(`\t${this.getMonthName(monthData.month)}`);

        for (const userData of monthData.users) {
          data.push(`\t\t${userData.userName}`);

          for (const bookChapterData of userData.bookChapters) {
            data.push(`\t\t\t${bookChapterData.bookChapter}\t${bookChapterData.noteCount}`);
            console.log(
              `${yearData.year}/${monthData.month} - ${userData.userName} - ${bookChapterData.bookChapter} - ${bookChapterData.noteCount}`
            );
          }
        }
      }
    }

    return [header.join('\t'), ...data].join('\n');
  }

  private writeFile() {
    const outfile = this.getOutfileName();

    console.log(`\nWriting summary to "${outfile}"`);
    const encoder = new TextEncoder();
    fs.writeFileSync(outfile, encoder.encode(this.toTsv(this.summary)));
  }
}

new UserCommentReport().run();
