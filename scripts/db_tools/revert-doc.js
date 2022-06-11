#!/usr/bin/env node

// Delete a doc (though it still exists in the DB), then recreate it in a state that it was in at a
// previous version

const utils = require('./utils.js');
const RichText = require('rich-text');
const ShareDB = require('sharedb/lib/client');

// Edit these settings to specify which doc to revert
const docId = '';
const connectionConfig = utils.devConfig;
const resetToVersion = 0;
const collection = 'texts';
const dryRun = true;

ShareDB.types.register(RichText.type);

async function run() {
  const ws = utils.createWS(connectionConfig);
  const conn = new ShareDB.Connection(ws);
  try {
    const doc = conn.get(collection, docId);
    await utils.fetchDoc(doc);

    const revertToSnapshot = await utils.fetchSnapshotByVersion(conn, collection, docId, resetToVersion);

    if (!dryRun) {
      await utils.deleteDoc(doc);
      console.log('deleted doc');
    }

    if (dryRun) {
      console.log('would reset doc to:');
      console.log(revertToSnapshot.data.ops);
    } else {
      await utils.createDoc(doc, revertToSnapshot.data.ops, RichText.type.name);
      console.log('recreated doc');
    }
  } finally {
    conn.close();
  }
}

run();
