#!/usr/bin/env node

// Clone a doc and import it into the location where another doc is, by first deleting the doc and then creating it.
// This is useful because when a doc is corrupted there isn't always a way to apply an op to it that will get it to
// another given state.

const utils = require('./utils.js');
const RichText = utils.requireFromRealTimeServer('rich-text');
const ShareDB = utils.requireFromRealTimeServer('sharedb/lib/client');

// Edit these settings to specify what doc to import to where
const fromDocId = '';
const toDocId = '';
const fromConfig = utils.liveConfig;
const toConfig = utils.devConfig;
const collection = 'texts';
const dryRun = true;

ShareDB.types.register(RichText.type);

async function run() {
  const fromWs = utils.createWS(fromConfig);
  const toWs = utils.createWS(toConfig);
  const fromConn = new ShareDB.Connection(fromWs);
  const toConn = new ShareDB.Connection(toWs);
  try {
    const fromDoc = fromConn.get(collection, fromDocId);
    await utils.fetchDoc(fromDoc);
    const toDoc = toConn.get(collection, toDocId);
    await utils.fetchDoc(toDoc);

    if (!dryRun) {
      await utils.deleteDoc(toDoc);
      console.log('deleted doc');
    }

    if (dryRun) {
      console.log('would reset doc to:');
      console.log(fromDoc.data.ops);
    } else {
      await utils.createDoc(toDoc, fromDoc.data.ops, RichText.type.name);
      console.log('recreated doc');
    }
  } finally {
    fromConn.close();
    toConn.close();
  }
}

run();
