#!/usr/bin/env node

// This file can be used to duplicate documents in a collection with new IDs. This can be
// useful for migrating documents to have a new ID format.
const utils = require('./utils.js');
const ShareDB = require('sharedb/lib/client');
const Scr = require('@sillsdev/scripture');
const OTJson0 = require('ot-json0');

// Edit these settings to specify which docs to duplicate
const connectionConfig = utils.devConfig;
const collection = 'text_audio';
const docIds = ['doc-ids-to-duplicate'];

ShareDB.types.register(OTJson0.type);

async function run() {
  const ws = utils.createWS(connectionConfig);
  const conn = new ShareDB.Connection(ws);
  for (const docId of docIds) {
    const document = conn.get(collection, docId);
    await utils.fetchDoc(document);
    const docParts = docId.split(':');
    // Convert the book number part to book ID
    const bookId = Scr.Canon.bookNumberToId(parseInt(docParts[1]));
    const newDocId = `${docParts[0]}:${bookId}:${docParts[2]}:target`;
    const newDoc = conn.get(collection, newDocId);
    const newData = document.data;
    newData.dataId = newDocId;
    await utils.createDoc(newDoc, newData, OTJson0.type.name);
  }
  conn.close();
}

run();
