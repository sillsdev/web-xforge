#!/usr/bin/env node

// Show a doc at each state it was in over time. For showing changes to text docs over time, consider using
// text-doc-history.js

const utils = require('./utils.js');
const RichText = utils.requireFromRealTimeServer('rich-text');
const OTJson0 = utils.requireFromRealTimeServer('ot-json0');
const ShareDB = utils.requireFromRealTimeServer('sharedb/lib/client');
const WebSocket = utils.requireFromRealTimeServer('ws');

// Edit these settings to specify which doc to show
const docId = '';
const collection = '';
const connectionConfig = utils.devConfig;

ShareDB.types.register(RichText.type);
ShareDB.types.register(OTJson0.type);

async function run() {
  const ws = new WebSocket(connectionConfig.wsConnectionString);
  const conn = new ShareDB.Connection(ws);
  try {
    const doc = conn.get(collection, docId);
    await utils.fetchDoc(doc);
    const versions = doc.version * 1;
    for (let i = versions; i > 0; i--) {
      const snapshot = await utils.fetchSnapshotByVersion(conn, collection, docId, i);
      console.log(snapshot.data);
    }
  } finally {
    conn.close();
  }
}

run();
