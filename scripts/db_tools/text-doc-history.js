#!/usr/bin/env node

// The purpose of this script is to visualize the history of a text document by showing who made what edits when.
// Sequential edits by the same user are grouped together so the size of the history is manageable.

const utils = require('./utils');
const RichText = utils.requireFromRealTimeServer('rich-text');
const ShareDB = utils.requireFromRealTimeServer('sharedb/lib/client');
const WebSocket = utils.requireFromRealTimeServer('ws');
const MongoClient = utils.requireFromRealTimeServer('mongodb');
const OTJson0 = utils.requireFromRealTimeServer('ot-json0');

// Edit these settings to specify which doc to visualize
const projectShortName = 'AAA';
const book = 'GEN';
const chapter = 1;
const connectionConfig = utils.devConfig;
utils.useColor(true);

ShareDB.types.register(RichText.type);
ShareDB.types.register(OTJson0.type);

async function run() {
  console.log(`Connecting...`);
  const ws = new WebSocket(connectionConfig.wsConnectionString);
  const conn = new ShareDB.Connection(ws);
  const client = await MongoClient.connect(connectionConfig.dbLocation, { useUnifiedTopology: true });
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
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      if (!doc.m.uId) {
        const snapshot = await utils.fetchSnapshotByVersion(conn, 'texts', docId, doc.v + 1);
        const project = await utils.fetchSnapshotByTimestamp(conn, 'sf_projects', projectId, doc.m.ts);
        const user = 'unspecified user (sync was ' + (!project.data.sync.queuedCount ? 'not ' : '') + 'in progress)';
        logEdit(snapshot, user, 1, doc.m.ts);
      } else if (docs[i + 1] && docs[i + 1].m.uId === doc.m.uId) {
        continue;
      } else {
        const snapshot = await utils.fetchSnapshotByVersion(conn, 'texts', docId, doc.v + 1);
        const user = await usersCollection.findOne({ _id: doc.m.uId }, { projection: { displayName: 1 } });
        const userDescription = `${user.displayName} (${doc.m.uId})`;
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
      ? `at ${new Date(startTime).toUTCString()}`
      : `from ${new Date(startTime).toUTCString()} to ${new Date(endTime).toUTCString()}`;

  console.log(`Modified by ${user} in ${editCount} edits ${time}`);
  const showAttributes = true;
  if (snapshot.data == null) {
    console.log(utils.colored(utils.colors.red, `Not rendering snapshot with null data.`));
    return;
  }
  utils.visualizeOps(snapshot.data.ops, showAttributes);
  console.log();
}

run();
