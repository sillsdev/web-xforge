#!/usr/bin/env node

// Delete a doc (though it still exists in the DB), then recreate it in another state. This is useful for when a
// document has been corrupted in such a way that it cannot be fixed by just applying a operation to it. This script is
// intended to be edited to be used as needed.

const utils = require('./utils.js');
const RichText = utils.requireFromRealTimeServer('rich-text');
const ShareDB = utils.requireFromRealTimeServer('sharedb/lib/client');

// Edit these settings to specify which doc to revert
const docId = '';
const connectionConfig = utils.devConfig;
const collection = 'texts';
const dryRun = true;

ShareDB.types.register(RichText.type);

async function run() {
  const ws = utils.createWS(connectionConfig);
  const conn = new ShareDB.Connection(ws);
  try {
    const doc = conn.get(collection, docId);
    await utils.fetchDoc(doc);

    const newOps = cleanupOps(doc.data.ops);

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

// Edit this function to modify the ops to whatever state they should be in
function cleanupOps(ops) {
  return ops.filter(op => op.insert != null && ['object', 'string'].includes(typeof op.insert));
}

run();
