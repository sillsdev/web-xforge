#!./node_modules/.bin/ts-node
//
// Find problem cids
//
// Find potentially problematic usages of character ids (cids) in op inserts in a text doc, which could indicate poor
// handling of character styling.
// This script needs ts-node and must be run from the containing directory. Setup: npm ci
// Usage information: ./find-problem-cids.ts --help
// Usage example: ./find-problem-cids.ts --server dev --no-color > output.txt
// Potential problems are flagged with 'NOT EQUAL' and less significantly, 'more than one'.

import * as RichText from 'rich-text';
import { MongoClient, Db, Collection } from 'mongodb';
import OTJson0 from 'ot-json0';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import ShareDB, { Snapshot } from 'sharedb';
import { Connection, Doc } from 'sharedb/lib/client';
import {
  colored,
  colors,
  ConnectionSettings,
  databaseConfigs,
  fetchSnapshotByVersion,
  useColor,
  visualizeOps,
  createWS
} from './utils';
import { Canon } from '../../src/RealtimeServer/scriptureforge/scripture-utils/canon';

type ProgArgs = { color: boolean; server: string; proj: string | undefined };
type StyleUsage = { style: string; cid: string };

/** Can look for problems with usages of character ids. */
class ProblemCidFinder {
  server: string | undefined;
  connectionConfig: ConnectionSettings | undefined;
  limitProj: string | undefined;

  constructor() {
    this.processArguments();
  }

  processArguments() {
    const args: ProgArgs = yargs(hideBin(process.argv))
      .option('color', {
        type: 'boolean',
        default: true,
        requiresArg: true,
        description: 'colourize output'
      })
      .option('server', {
        type: 'string',
        choices: ['dev', 'qa', 'live'],
        default: 'dev',
        requiresArg: true,
        description: 'server to connect to'
      })
      .option('proj', {
        type: 'string',
        description: 'Limit to project shortName (eg ABC)'
      })
      .strict()
      .parseSync();
    const shouldUseColor: boolean = args.color;
    useColor(shouldUseColor);
    this.server = args.server;
    this.connectionConfig = databaseConfigs.get(this.server);
    this.limitProj = args.proj;
  }

  /** Examine the latest snapshot for a text, as found by project short name, book, and chapter. */
  async examine(
    conn: Connection,
    textOperationCollection: Collection<Doc>,
    projectDoc: any,
    book: string,
    chapter: number
  ) {
    const shortName = projectDoc.shortName;
    const ptId = projectDoc.paratextId;
    const sfId: string = projectDoc._id;
    console.log(`Examining ${shortName} (PTId ${ptId}, SFId ${sfId}) ${book} ${chapter}`);
    const docId: string = `${sfId}:${book}:${chapter}:target`;
    const docs: any[] = await textOperationCollection
      .find({ d: docId }, { projection: { v: 1, m: 1 }, sort: { v: 1 } })
      .toArray();
    // Just work with the last doc in the list.
    const i: number = docs.length - 1;
    const doc: any = docs[i];
    if (doc == null) {
      console.log(`doc is not defined. Does your project really have the specified book and chapter?`);
      return;
    }
    const snapshot: Snapshot = await fetchSnapshotByVersion(conn, 'texts', docId, doc.v + 1);
    this.displaySnapshot(snapshot);
  }

  async main() {
    ShareDB.types.register(RichText.type);
    ShareDB.types.register(OTJson0.type);
    console.log(`Connecting to ${this.server}`);
    if (this.connectionConfig == null) {
      throw new Error('null connection config');
    }
    const ws = createWS(this.connectionConfig);
    const conn: Connection = new Connection(ws);
    const client: MongoClient = await MongoClient.connect(this.connectionConfig.dbLocation);
    try {
      const db: Db = client.db();
      const projectCollection: Collection<any> = db.collection('sf_projects');
      const textOperationCollection: Collection<any> = db.collection('o_texts');
      let projectsInDB: any[] = await projectCollection.find().toArray();
      if (this.limitProj != null) {
        projectsInDB = projectsInDB.filter((item: any) => item.shortName === this.limitProj);
      }
      for (const projectDoc of projectsInDB) {
        const booksInProject: any = projectDoc.texts;
        for (const book of booksInProject) {
          const bookNumber = book.bookNum;
          const bookAbbr: string = Canon.bookNumberToId(bookNumber);
          for (const chapterNumber of (book.chapters as any[]).map((chap: any) => chap.number)) {
            await this.examine(conn, textOperationCollection, projectDoc, bookAbbr, chapterNumber);
          }
        }
      }
    } finally {
      client.close();
      (conn as any).close();
    }
  }

  /** Return character styles from an op's attributes. */
  opCharStyles(op: any): StyleUsage[] {
    let styles: StyleUsage[] = [];
    if (typeof op.attributes?.char?.style === 'string') {
      const style = op.attributes?.char?.style;
      const cid = op.attributes?.char?.cid;
      styles.push({ style, cid });
    } else if (Array.isArray(op.attributes?.char)) {
      styles = styles.concat(op.attributes?.char);
    }
    return styles;
  }

  /** Return a set of ops and their associated character stylings. */
  allOpCharStyles(ops: any[]): { opNumber: number; styles: StyleUsage[] }[] {
    const opsStyling: { opNumber: number; styles: StyleUsage[] }[] = [];
    for (let i = 0; i < ops.length; i++) {
      const op: any = ops[i];
      const styles: StyleUsage[] = this.opCharStyles(op);
      opsStyling.push({ opNumber: i, styles });
    }
    return opsStyling;
  }

  /** Print out info on character styles used, and flag character styles that use cids that aren't consistent in
   *  adjacent character formatting. */
  detectAdjacentBadCids(ops: any[]) {
    console.log(`Looking for inconsistent adjacent cids ...`);
    const opsStyling: { opNumber: number; styles: StyleUsage[] }[] = this.allOpCharStyles(ops);

    for (let i = 0; i < opsStyling.length; i++) {
      if (opsStyling[i].styles.length === 0) {
        continue;
      }
      if (i === opsStyling.length) {
        // There is not a next op/style to look at.
        continue;
      }
      // array of style names in this and next ops
      const thisOpStyles = opsStyling[i].styles.map(style => style.style);
      const nextOpStyles = opsStyling[i + 1].styles.map(style => style.style);
      thisOpStyles.forEach((style, styleIndex) => {
        if (nextOpStyles.includes(style)) {
          const thisOpCid = opsStyling[i].styles[styleIndex].cid;
          const nextOpCid = opsStyling[i + 1].styles.find(s => s.style === style)!.cid;
          const sameCids = thisOpCid === nextOpCid;
          console.log(
            `op ${i} and op ${i + 1} both have char style ${style}. cids: ${thisOpCid} ${nextOpCid} (${
              sameCids ? 'equal' : 'THEY ARE NOT EQUAL'
            })`
          );
        }
      });
    }
  }

  /** Look at character styling and character ids and flag character ids that are not consistent with other character
   *  style usages. */
  detectInconsistentCids(ops: any[]) {
    console.log(`Looking for inconsistent cids ...`);
    const opsStyling = this.allOpCharStyles(ops);
    // hashmap of character style names and an array of cids that are used for that style name
    const stylesAndTheirCids = new Map();
    // For every op's set of styles:
    opsStyling.forEach(opStyling => {
      const styles = opStyling.styles;
      if (styles == null || styles.length < 1) {
        return;
      }
      // For every style in a given ops's set of character styles:
      styles.forEach((style: StyleUsage) => {
        const styleName = style.style;
        const cid = style.cid;
        if (!stylesAndTheirCids.has(styleName)) {
          stylesAndTheirCids.set(styleName, new Set());
        }
        // Associate the cid with the style, if not already
        stylesAndTheirCids.get(styleName).add(cid);
      });
    });
    console.log(stylesAndTheirCids);
    stylesAndTheirCids.forEach((associatedCids, styleName) => {
      let additionalInfo = ``;
      if (associatedCids.size > 1) {
        additionalInfo = ` (note: more than one)`;
      }
      console.log(`Style ${styleName} has ${associatedCids.size} associated cids.${additionalInfo}`);
    });
  }

  displaySnapshot(snapshot: Snapshot) {
    const showAttributes: boolean = true;
    if (snapshot.data == null) {
      console.log(colored(colors.red, `Not rendering snapshot with null data.`));
      return;
    }
    visualizeOps(snapshot.data.ops, showAttributes);
    console.log();
    // Ways to find potential problems:
    this.detectAdjacentBadCids(snapshot.data.ops);
    this.detectInconsistentCids(snapshot.data.ops);
  }
}

const program = new ProblemCidFinder();
program.main();
