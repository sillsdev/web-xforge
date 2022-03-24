#!./node_modules/.bin/ts-node
//
// Show project metadata and data
//
// Copyright 2021 SIL International. MIT License.
//
// Display data and metadata about projects.
//
// This script needs ts-node and must be run from the containing directory. Setup: npm ci
// Usage info: ./show-projects.ts --help
// Examples:
//   Show a list of projects and their Ids: ./show-projects.ts
//   Show a list of books in each project: ./show-project.ts --books
//   Show a textdoc: ./show-projects.ts --proj ABC --book RUT --chapter 1 --text --no-color > out.json

import { MongoClient, Db, Collection } from 'mongodb';
import WebSocket from 'ws';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Connection } from 'sharedb/lib/client';
import { colored, colors, ConnectionSettings, databaseConfigs, useColor } from './utils';
import { Canon } from '../../src/RealtimeServer/scriptureforge/scripture-utils/canon';

type ProgArgs = {
  color: boolean;
  server: string;
  books: boolean;
  chapters: boolean;
  text: boolean;
  proj: string | undefined;
  sfId: string | undefined;
  ptId: string | undefined;
  book: string | undefined;
  bookNum: number | undefined;
  chapter: number | undefined;
};
type BookMetadata = Map<string, { bookNumber: number; chaptersInProj: number[] }>;

/** Can query for various project data to display. */
class ProjectInquirer {
  server: string | undefined;
  connectionConfig: ConnectionSettings | undefined;
  showBooks: boolean = false;
  showChapters: boolean = false;
  showChapterText: boolean = false;
  limitProj: string | undefined;
  limitSFId: string | undefined;
  limitPTId: string | undefined;
  limitBook: string | undefined;
  limitbookNum: number | undefined;
  limitChapter: number | undefined;

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
      .option('books', {
        type: 'boolean',
        default: false,
        description: 'include books in metadata'
      })
      .option('chapters', {
        type: 'boolean',
        default: false,
        description: 'include chapters in metadata (implies --books)'
      })
      .option('text', {
        type: 'boolean',
        default: false,
        description: 'include chapter text in output (implies --chapters)'
      })
      .option('proj', {
        type: 'string',
        description: 'Limit to project shortName (eg ABC)'
      })
      .option('sfId', {
        type: 'string',
        description: 'Limit to SF project Id'
      })
      .option('ptId', {
        type: 'string',
        description: 'Limit to PT project Id'
      })
      .option('book', {
        type: 'string',
        description: 'Limit book list to book abbreviation (eg GEN)'
      })
      .option('bookNum', {
        type: 'number',
        description: 'Limit book list to book number (eg 1 for GEN)'
      })
      .option('chapter', {
        type: 'number',
        description: 'Limit chapter list to chapter number (eg 1)'
      })
      .strict()
      .parseSync();

    const shouldUseColor: boolean = args.color;
    useColor(shouldUseColor);
    this.server = args.server;
    this.connectionConfig = databaseConfigs.get(this.server);
    this.showBooks = args.books || args.chapters || args.text;
    this.showChapters = args.chapters || args.text;
    this.showChapterText = args.text;
    this.limitProj = args.proj;
    this.limitSFId = args.sfId;
    this.limitPTId = args.ptId;
    this.limitBook = args.book;
    this.limitbookNum = args.bookNum;
    this.limitChapter = args.chapter;
  }

  getProjectBookMetadata(projectDoc: any): BookMetadata {
    const bookMetadata: BookMetadata = new Map();
    const booksInProject: any = projectDoc.texts;
    for (const book of booksInProject) {
      const bookNumber = book.bookNum;
      const bookAbbr: string = Canon.bookNumberToId(bookNumber);
      // Chapters that are actually in the project, not just canonical
      const chaptersInProj: number[] = (book.chapters as any[]).map((chap: any) => chap.number);
      bookMetadata.set(bookAbbr, { bookNumber, chaptersInProj });
    }
    return bookMetadata;
  }

  getChapterText(textsInDB: any[], projectId: string, bookAbbr: string, chapter: number): string {
    const lookupId = `${projectId}:${bookAbbr}:${chapter}:target`;
    const chapterTexts: any[] = textsInDB.filter((item: any) => item._id === lookupId);
    if (chapterTexts.length < 1) {
      throw new Error(`Could not find expected chapter text for ${lookupId}.`);
    }
    if (chapterTexts.length > 1) {
      throw new Error(`Expected 1 matching chapter text, found ${chapterTexts.length} for ${lookupId}.`);
    }
    return chapterTexts[0];
  }

  async main() {
    // Mapping of project SF Id to project doc.
    const metadata: Map<string, any> = new Map<string, any>();
    if (this.connectionConfig == null) {
      throw new Error('null connection config');
    }
    console.log(`Connecting to ${this.server}`);
    const ws = new WebSocket(this.connectionConfig.wsConnectionString);
    const conn: Connection = new Connection(ws);
    const client: MongoClient = await MongoClient.connect(this.connectionConfig.dbLocation, {
      useUnifiedTopology: true
    });
    try {
      const db: Db = client.db();
      const textsCollection: Collection<any> = db.collection('texts');
      const textsInDB: any[] = await textsCollection.find().toArray();
      const projectCollection: Collection<any> = db.collection('sf_projects');
      let projectsInDB: any[] = await projectCollection.find().toArray();
      if (this.limitProj != null) {
        projectsInDB = projectsInDB.filter((item: any) => item.shortName === this.limitProj);
      }
      if (this.limitSFId != null) {
        projectsInDB = projectsInDB.filter((item: any) => item._id === this.limitSFId);
      }
      if (this.limitPTId != null) {
        projectsInDB = projectsInDB.filter((item: any) => item.paratextId === this.limitPTId);
      }
      if (projectsInDB.length < 1) {
        console.log(`No projects in set to display.`);
        return;
      }
      projectsInDB.forEach((projDoc: any) => metadata.set(projDoc._id, projDoc));
      metadata.forEach(async (projDoc: any, sfId: string) => {
        const books: BookMetadata = this.getProjectBookMetadata(projDoc);
        let booksToExamine: string[] = Array.from(books.keys());
        if (this.limitBook) {
          booksToExamine = booksToExamine.filter(item => item === this.limitBook);
        }
        if (this.limitbookNum != null) {
          booksToExamine = booksToExamine.filter(item => books.get(item)?.bookNumber === this.limitbookNum);
        }
        let optionalBooksDisplay: string = '';
        if (this.showChapterText) {
          for (const bookAbbr of booksToExamine) {
            const bookItem = books.get(bookAbbr);
            const bookNum: number = bookItem!.bookNumber;
            let chapters: number[] = bookItem!.chaptersInProj;
            if (this.limitChapter != null) {
              chapters = chapters.filter((chapNum: number) => chapNum === this.limitChapter);
            }
            for (const chapNum of chapters) {
              const chapText = JSON.stringify(this.getChapterText(textsInDB, sfId, bookAbbr, chapNum), null, '  ');
              optionalBooksDisplay = `${optionalBooksDisplay}\n${sfId} ${colored(
                colors.darkGrey,
                `[${bookNum}]`
              )}${colored(colors.orange, bookAbbr)} ${chapNum}\n${chapText}`;
            }
          }
        } else {
          const bookList: string = booksToExamine
            .map((bookAbbr: string) => {
              const bookItem = books.get(bookAbbr);
              const bookNum: number = bookItem!.bookNumber;
              let chapters: number[] = bookItem!.chaptersInProj;
              if (this.limitChapter != null) {
                chapters = chapters.filter((chapNum: number) => chapNum === this.limitChapter);
              }
              const chapterList: string = chapters.join(' ');
              const chaptersDisplay: string = ` (${chapterList})`;
              return `${colored(colors.darkGrey, `[${bookNum}]`)}${colored(colors.orange, bookAbbr)}${
                this.showChapters ? chaptersDisplay : ''
              }`;
            })
            .join(' ');
          optionalBooksDisplay = this.showBooks ? `; ${bookList}` : '';
        }
        console.log(
          `${colored(colors.yellow, sfId)}; ${projDoc.paratextId}; ${colored(colors.lightBlue, projDoc.shortName)}; ${
            projDoc.name
          }${optionalBooksDisplay}`
        );
      });
      return;
    } finally {
      client.close();
      (conn as any).close();
    }
  }
}

const program = new ProjectInquirer();
program.main();
