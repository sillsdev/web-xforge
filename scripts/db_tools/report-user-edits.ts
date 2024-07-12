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
 *        --log-diff [true|false] (default: false)
 */

import diff from 'fast-diff';
import * as fs from 'fs';
import { AbstractCursor, Db, MongoClient } from 'mongodb';
import { DeltaOperation } from 'rich-text';
import { Connection } from 'sharedb/lib/client';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { colored, colors, ConnectionSettings, createWS, databaseConfigs, fetchSnapshotByVersion } from './utils';

function getColorFunc(color: number) {
  return colored.bind(null, color);
}

const yellow = getColorFunc(colors.yellow);
const blue = getColorFunc(colors.lightBlue);
const green = getColorFunc(colors.lightGreen);
const red = getColorFunc(colors.orange);

interface ScriptArgs {
  env: string;
  project: string;
  from?: string;
  to?: string;
  outfile: string;
  logDiff: boolean;
}

interface UserEditReportData {
  years: UserEditReportYearData[];
}

interface UserEditReportYearData {
  year: number;
  months: UserEditReportMonthData[];
}

interface UserEditReportMonthData {
  month: number;
  users: UserEditReportUserData[];
}

interface UserEditReportUserData {
  userId: string;
  userName: string;
  bookChapters: UserEditReportBookChapterData[];
}

interface UserEditReportBookChapterData {
  bookChapter: string;
  inserts: number;
  deletes: number;
  wordAdds: number;
  wordDeletes: number;
}

interface VersionOp {
  v: number;
  op: { ops: DeltaOperation[] };
}

class UserEditReport {
  connectionConfig: ConnectionSettings;
  env: string;
  projectId?: string;
  projectShortName: string;
  from?: Date;
  to?: Date;
  outfile: string;
  logDiff: boolean;

  fromPretty: string;
  toPretty: string;

  readonly reportName = 'user-edit-counts';

  constructor() {
    const args: ScriptArgs = this.processArgs();
    this.env = args.env;
    this.connectionConfig = databaseConfigs.get(this.env)!;
    this.projectShortName = args.project;
    this.from = this.toDate(args.from, 'start-of-day'); // Use start of day for 'from' date if time not specified
    this.to = this.toDate(args.to, 'end-of-day'); // Use end of day for 'to' date if time not specified
    this.outfile = args.outfile;
    this.logDiff = args.logDiff;

    this.fromPretty = this.formatDate(this.from) ?? 'beginning';
    this.toPretty = this.formatDate(this.to ?? new Date())!;
  }

  async run() {
    console.log(`Connecting to ${this.env} at ${this.connectionConfig.dbLocation}`);

    const summary: UserEditReportData = { years: [] };
    const client = new MongoClient(this.connectionConfig.dbLocation);
    const ws = createWS(this.connectionConfig);

    try {
      await client.connect();
      const conn = new Connection(ws);
      const cursor = await this.queryDB(client.db());

      for await (const doc of cursor) {
        summary.years.push({
          year: doc._id,
          months: await Promise.all(
            (doc.months as []).map(
              async (monthData: any) =>
                ({
                  month: monthData.month,
                  users: await Promise.all(
                    (monthData.users as []).map(async (user: any) => {
                      return {
                        userId: user.userId,
                        userName: user.userName,
                        bookChapters: await Promise.all(
                          (user.bookChapters as []).map(async (bookChapterData: any) => {
                            const result: UserEditReportBookChapterData = {
                              bookChapter: bookChapterData.bookChapter,
                              inserts: 0,
                              deletes: 0,
                              wordAdds: 0,
                              wordDeletes: 0
                            };

                            // Baseline is the first version for the user-book-chapter grouping
                            let baselineVersion = bookChapterData.versionOps[0].v;
                            let prevVersion = baselineVersion - 1;

                            for (const versionOp of bookChapterData.versionOps) {
                              // Sum the raw edit counts
                              const { inserts, deletes } = this.parseRawEdits(versionOp);
                              result.inserts += inserts;
                              result.deletes += deletes;

                              // Sum the net word edits when there is a gap in versions
                              if (versionOp.v !== prevVersion + 1) {
                                console.log(prevVersion, versionOp.v, user.userName, bookChapterData.bookChapter);

                                const netWordEdits = await this.parseNetWordEdits(
                                  conn,
                                  bookChapterData.snapshotId,
                                  baselineVersion,
                                  prevVersion + 1, // Snapshot version is one more than op doc version
                                  user.userName,
                                  doc._id,
                                  monthData.month
                                );

                                result.wordAdds += netWordEdits.inserts;
                                result.wordDeletes += netWordEdits.deletes;

                                // New baseline
                                baselineVersion = versionOp.v;
                              }

                              prevVersion = versionOp.v;
                            }

                            // Sum the net word edits for the last version
                            const lastVersion = bookChapterData.versionOps[bookChapterData.versionOps.length - 1].v;
                            const netWordEdits = await this.parseNetWordEdits(
                              conn,
                              bookChapterData.snapshotId,
                              baselineVersion,
                              lastVersion + 1, // Snapshot version is one more than op doc version
                              user.userName,
                              doc._id,
                              monthData.month
                            );

                            result.wordAdds += netWordEdits.inserts;
                            result.wordDeletes += netWordEdits.deletes;

                            return result;
                          })
                        )
                      } as UserEditReportUserData;
                    })
                  )
                } as UserEditReportMonthData)
            )
          )
        } as UserEditReportYearData);
      }

      this.writeFile(summary);
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

  /**
   * Returns the name of the month given its number (1-12).
   */
  getMonthName(month: number): string {
    const date = new Date();
    date.setMonth(month - 1); // Months are 0-indexed
    return date.toLocaleString('default', { month: 'long' });
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

  /**
   * Parses the net user word insert/delete counts between the two versions.
   */
  private async parseNetWordEdits(
    conn: Connection,
    docId: any,
    versionA: number,
    versionB: number,
    userName: string,
    year: number,
    month: number
  ): Promise<{ inserts: number; deletes: number }> {
    if (versionA === versionB) {
      throw new Error('Versions must be different.');
    }
    const snapshotA = await fetchSnapshotByVersion(conn, 'texts', docId, versionA);
    const snapshotB = await fetchSnapshotByVersion(conn, 'texts', docId, versionB);

    console.log(`\n${yellow(`${this.getMonthName(month)} ${year}`)}`);
    console.log(`${yellow(userName)} - Net word edits for ${yellow(docId)} v${versionA} -> v${versionB}`);

    const results = SnapshotDiffer.diffDocs(snapshotA.data.ops, snapshotB.data.ops, this.logDiff);

    console.log(
      `${yellow('===')}  ${green(results.inserts.toString())} words added, ${red(
        results.deletes.toString()
      )} words deleted.\n`
    );

    return results;
  }

  /**
   * Parses the user raw insert/delete counts.
   */
  private parseRawEdits(versionOp: VersionOp): { inserts: number; deletes: number } {
    const result = {
      inserts: 0,
      deletes: 0
    };

    for (const op of versionOp.op.ops) {
      if (typeof op.insert === 'string') {
        result.inserts += op.insert.length;
      } else if (op.delete) {
        result.deletes += op.delete;
      }
    }

    return result;
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
      .option('log-diff', {
        type: 'boolean',
        default: false,
        requiresArg: false,
        description: 'Whether to log the word diff between snapshots'
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
      {
        // Convert the dateModified field from ms to date object for each text op
        $addFields: {
          timestampDate: { $toDate: '$m.ts' },
          bookChapter: {
            $concat: [
              { $arrayElemAt: [{ $split: ['$d', ':'] }, 1] }, // Gets the 'book' part
              ':',
              { $arrayElemAt: [{ $split: ['$d', ':'] }, 2] } // Gets the 'chapter' part
            ]
          }
        }
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
          userName: '$user.name',
          userId: '$m.uId'
        }
      },
      {
        $project: {
          d: 1,
          v: 1,
          op: 1,
          userId: 1,
          userName: 1,
          year: { $year: '$timestampDate' },
          month: { $month: '$timestampDate' },
          bookChapter: 1
        }
      },
      {
        // Group by year, month, user, and book chapter to collect version ops
        $group: {
          _id: {
            year: '$year',
            month: '$month',
            userId: '$userId',
            userName: '$userName',
            bookChapter: '$bookChapter',
            snapshotId: '$d'
          },
          versionOps: {
            $push: {
              v: '$v',
              op: '$op'
            }
          }
        }
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
          '_id.userName': 1,
          '_id.bookChapter': 1
        }
      },
      {
        // Regroup the documents by year, month, and user name to collect book chapters and their version ops
        $group: {
          _id: {
            year: '$_id.year',
            month: '$_id.month',
            userId: '$_id.userId',
            userName: '$_id.userName'
          },
          bookChapters: {
            $push: {
              bookChapter: '$_id.bookChapter',
              snapshotId: '$_id.snapshotId',
              versionOps: '$versionOps'
            }
          }
        }
      },
      {
        // Sort the regrouped results by year, month, and user name
        $sort: {
          '_id.year': 1,
          '_id.month': 1,
          '_id.userName': 1
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
              userName: '$_id.userName',
              bookChapters: '$bookChapters'
            }
          }
        }
      },
      {
        // Sort the regrouped results by year and month
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
    ];

    return db.collection('o_texts').aggregate(pipeline);
  }

  /**
   * Converts UserEditReportData object to a TSV string.
   */
  private toTsv(summary: UserEditReportData): string {
    const header: string[] = [
      'Year',
      'Month',
      'User Name',
      'Book:Chapter',
      'Raw Insertions',
      'Raw Deletions',
      'Net Word Insertions',
      'Net Word Deletions'
    ];

    const dataRows = [];

    for (const yearData of summary.years) {
      dataRows.push(yearData.year);

      for (const monthData of yearData.months) {
        dataRows.push(`\t${this.getMonthName(monthData.month)}`);

        for (const userData of monthData.users) {
          dataRows.push(`\t\t${userData.userName}`);

          for (const bookChapterData of userData.bookChapters) {
            const countsColumns = `${bookChapterData.inserts}\t${bookChapterData.deletes}\t${bookChapterData.wordAdds}\t${bookChapterData.wordDeletes}`;
            dataRows.push(`\t\t\t${bookChapterData.bookChapter}\t${countsColumns}`);
            console.log(
              `${yearData.year}/${monthData.month} - ${userData.userName} - ${bookChapterData.bookChapter} - ${countsColumns}`
            );
          }
        }
      }
    }

    return [header.join('\t'), ...dataRows].join('\n');
  }

  private writeFile(summary: UserEditReportData) {
    const outfile = this.getOutfileName();

    console.log(`\nWriting summary to "${outfile}"`);
    const encoder = new TextEncoder();
    fs.writeFileSync(outfile, encoder.encode(this.toTsv(summary)));
  }
}

class SnapshotDiffer {
  /**
   * Gets the word count number of inserts and deletes between two snapshots.
   */
  static diffDocs(opsA: DeltaOperation[], opsB: DeltaOperation[], log: boolean): { inserts: number; deletes: number } {
    const rawDiff = this.createRawDiff(opsA, opsB);
    return this.processRawDiff(rawDiff, log);
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

  private static processRawDiff(diffArr: [number, string][], log: boolean): { inserts: number; deletes: number } {
    const result = {
      inserts: 0,
      deletes: 0
    };

    for (const [i, text] of diffArr) {
      const wordsChanged = this.countWords(text);

      if (i === 1) {
        if (log) {
          console.log(`+${wordsChanged}`, green(text));
        }

        result.inserts += wordsChanged;
      } else if (i === -1) {
        if (log) {
          console.log(`-${wordsChanged}`, red(text));
        }

        result.deletes += wordsChanged;
      }
    }

    return result;
  }
}

new UserEditReport().run();
