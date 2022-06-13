#!./node_modules/.bin/ts-node

import { createWS, devConfig, fetchDoc, visualizeOps } from './utils';
import * as RichText from 'rich-text';
import ShareDB from 'sharedb';
import { Connection } from 'sharedb/lib/client';

const docId = '';
const connectionConfig = devConfig;
const collection = 'texts';

ShareDB.types.register(RichText.type);

async function run() {
  const ws = createWS(connectionConfig as any);
  const conn = new Connection(ws);
  try {
    const doc = conn.get(collection, docId);
    await fetchDoc(doc);
    visualizeOps(doc.data.ops, true);
  } finally {
    ws.close();
  }
}

run();
