#!/usr/bin/env node

// The purpose of this script is to visualize the history of a text document by showing who made what edits when.
// Sequential edits by the same user are grouped together so the size of the history is manageable.

const utils = require('./utils');
const RichText = require('rich-text');
const ShareDB = require('sharedb/lib/client');
const { MongoClient } = require('mongodb');
const OTJson0 = require('ot-json0');

// Edit these settings to specify which doc to visualize, and how.
const projectShortName = 'AAA';
const book = 'GEN';
const chapter = 1;
const connectionConfig = utils.devConfig;
const collapseAdjacentSameUserEdits = true;
const showOpAttributes = true;
utils.useColor(true);

ShareDB.types.register(RichText.type);
ShareDB.types.register(OTJson0.type);

async function run() {
  console.log(`Connecting...`);
  const ws = utils.createWS(connectionConfig);
  const conn = new ShareDB.Connection(ws);
  const client = await MongoClient.connect(connectionConfig.dbLocation);
  console.log(`Connected.`);
  try {
    const db = client.db();
    const projectCollection = db.collection('sf_projects');
    const usersCollection = db.collection('users');
    const textOperationCollection = db.collection('o_texts');

    const projectId = (await projectCollection.findOne({ shortName: projectShortName }))._id;
    const docId = `${projectId}:${book}:${chapter}:target`;

    const docs = await textOperationCollection
      .find({ d: docId }, { projection: { v: 1, m: 1 }, sort: { v: 1 } })
      .toArray();
    let lastLoggedDocIndex = -1;
    console.log(`Considering ${docs.length} docs.`);
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      if (!doc.m.uId) {
        const snapshot = await utils.fetchSnapshotByVersion(conn, 'texts', docId, doc.v + 1);
        const project = await utils.fetchSnapshotByTimestamp(conn, 'sf_projects', projectId, doc.m.ts);
        const user = 'unspecified user (sync was ' + (!project.data.sync.queuedCount ? 'not ' : '') + 'in progress)';
        logEdit(snapshot, user, 1, doc.m.ts);
      } else if (collapseAdjacentSameUserEdits && docs[i + 1] && docs[i + 1].m.uId === doc.m.uId) {
        continue;
      } else {
        const snapshot = await utils.fetchSnapshotByVersion(conn, 'texts', docId, doc.v + 1);
        const user = await usersCollection.findOne({ _id: doc.m.uId }, { projection: { displayName: 1 } });
        // A user might not be found if we are working with a partial copy of a DB.
        const userDescription = `${user != null ? user.displayName : 'Notfound User'} (${doc.m.uId})`;
        logEdit(snapshot, userDescription, i - lastLoggedDocIndex, docs[lastLoggedDocIndex + 1].m.ts, doc.m.ts);
      }
      lastLoggedDocIndex = i;
    }
  } finally {
    client.close();
    conn.close();
  }
}

function logEdit(snapshot, user, editCount, startTime, endTime) {
  const time =
    editCount === 1
      ? `at ${new Date(startTime).toISOString()} (${startTime})`
      : `from ${new Date(startTime).toISOString()} (${startTime}) to ${new Date(endTime).toISOString()} (${endTime})`;

  console.log(`Modified by ${user} in ${editCount} edits ${time}`);
  if (snapshot.data == null) {
    console.log(utils.colored(utils.colors.red, `Not rendering snapshot with null data.`));
    return;
  }
  utils.visualizeOps(snapshot.data.ops, showOpAttributes);
  console.log();
}

run();
