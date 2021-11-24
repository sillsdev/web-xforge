#!/usr/bin/env ts-node
//
// List projects
//
// Copyright 2021 SIL International. MIT License.
//
// Display metadata about projects.
//
// This script needs ts-node. Setup: npm ci && sudo npm install --global ts-node
// Usage example: ./list-projects.ts
// More info: ./list-projects.ts --help

import { colored, colors, databaseConfigs, useColor } from './utils.js';
import { MongoClient, Db, Collection } from 'mongodb';
import { Connection } from 'sharedb/lib/client';
import WebSocket from 'ws';
import { Canon } from '../../src/RealtimeServer/scriptureforge/scripture-utils/canon';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

type BookMetadata = Map<string, { bookNumber: number; chaptersInProj: Array<number> }>;

const args: any = yargs(hideBin(process.argv))
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
  .option('proj', {
    type: 'string',
    description: 'Limit to project shortName (eg ABC)'
  })
  .option('sfid', {
    type: 'string',
    description: 'Limit to SF project Id'
  })
  .option('ptid', {
    type: 'string',
    description: 'Limit to PT project Id'
  })
  .option('book', {
    type: 'string',
    description: 'Limit to book abbreviation (eg GEN)'
  })
  .option('bookNum', {
    type: 'string',
    description: 'Limit to book number (eg 1 for GEN)'
  })
  .strict().argv;

const shouldUseColor: boolean = args.color;
useColor(shouldUseColor);
const server = args.server;
const connectionConfig = databaseConfigs.get(server);
const showBooks: boolean = args.books || args.chapters;
const showChapters: boolean = args.chapters;
const limitProj: string | undefined = args.proj;
const limitSFId: string | undefined = args.sfid;
const limitPTId: string | undefined = args.ptid;
const limitBook: string | undefined = args.book;
const limitbookNum: number | undefined = args.bookNum == null ? undefined : parseInt(args.bookNum);

function getProjectBookMetadata(projectDoc: any): BookMetadata {
  const bookMetadata: BookMetadata = new Map();
  const booksInProject: any = projectDoc.texts;
  for (const book of booksInProject) {
    const bookNumber = book.bookNum;
    const bookAbbr: string = Canon.bookNumberToId(bookNumber);
    // Chapters that are actually in the project, not just canonical
    const chaptersInProj: Array<number> = (book.chapters as Array<any>).map((chap: any) => chap.number);
    bookMetadata.set(bookAbbr, { bookNumber, chaptersInProj });
  }
  return bookMetadata;
}

async function run() {
  // Mapping of project SF Id to project doc.
  const metadata: Map<string, any> = new Map<string, any>();
  if (connectionConfig == null) {
    throw new Error('null connection config');
  }
  console.log(`Connecting to ${server}`);
  const ws = new WebSocket(connectionConfig.wsConnectionString);
  const conn: Connection = new Connection(ws);
  const client: MongoClient = await MongoClient.connect(connectionConfig.dbLocation, { useUnifiedTopology: true });
  try {
    const db: Db = client.db();
    const projectCollection: Collection<any> = db.collection('sf_projects');
    let projectsInDB: Array<any> = await projectCollection.find().toArray();
    if (limitProj != null) {
      projectsInDB = projectsInDB.filter((item: any) => item.shortName === limitProj);
    }
    if (limitSFId != null) {
      projectsInDB = projectsInDB.filter((item: any) => item._id === limitSFId);
    }
    if (limitPTId != null) {
      projectsInDB = projectsInDB.filter((item: any) => item.paratextId === limitPTId);
    }
    if (projectsInDB.length < 1) {
      console.log(`No projects in set to display.`);
      return;
    }
    projectsInDB.forEach((projDoc: any) => metadata.set(projDoc._id, projDoc));
    metadata.forEach((projDoc: any, sfId: string) => {
      const books: BookMetadata = getProjectBookMetadata(projDoc);
      let booksToExamine: Array<string> = Array.from(books.keys());
      if (limitBook) {
        booksToExamine = booksToExamine.filter(item => item === limitBook);
      }
      if (limitbookNum) {
        booksToExamine = booksToExamine.filter(item => books.get(item)?.bookNumber === limitbookNum);
      }
      const bookList: string = booksToExamine
        .map((bookAbbr: string) => {
          const bookItem = books.get(bookAbbr);
          const bookNum: number = bookItem!.bookNumber;
          const chapters: string = bookItem!.chaptersInProj.join(' ');
          const chaptersDisplay: string = ` (${chapters})`;
          return `${colored(colors.darkGrey, `[${bookNum}]`)}${colored(colors.orange, bookAbbr)}${
            showChapters ? chaptersDisplay : ''
          }`;
        })
        .join(' ');
      const optionalBooksDisplay: string = showBooks ? `; ${bookList}` : '';
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

run();
