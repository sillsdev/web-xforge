#!/usr/bin/env node

// Delete a doc (though it still exists in the DB), then recreate it in another state. This is useful for when a
// document has been corrupted in such a way that it cannot be fixed by just applying a operation to it.

const utils = require('./utils.js');
const RichText = utils.requireFromRealTimeServer('rich-text');
const ShareDB = utils.requireFromRealTimeServer('sharedb/lib/client');
const WebSocket = utils.requireFromRealTimeServer('ws');

// Edit these settings to specify which doc to revert
const docId = '';
const connectionConfig = utils.devConfig;
const collection = 'texts';
const dryRun = true;

ShareDB.types.register(RichText.type);

async function run() {
  const ws = new WebSocket(connectionConfig.wsConnectionString);
  const conn = new ShareDB.Connection(ws);
  try {
    const doc = conn.get(collection, docId);
    await utils.fetchDoc(doc);

    const newOps = fixDoc(doc);

    if (!dryRun) {
      await utils.deleteDoc(doc);
      console.log('deleted doc');
    }

    if (dryRun) {
      console.log('would set doc to:');
      utils.visualizeOps(newOps, true);
    } else {
      await utils.createDoc(doc, newOps, RichText.type.name);
      console.log('recreated doc');
    }
  } finally {
    conn.close();
  }
}

function fixDoc(doc) {
  return doc.data.ops.filter(op => typeof op.insert !== 'undefined');
}

run();
