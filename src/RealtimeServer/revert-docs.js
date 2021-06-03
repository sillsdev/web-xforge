const fs = require('fs');
const OTJson0 = require('ot-json0');
const RichText = require('rich-text');
const ShareDB = require('sharedb/lib/client');
const WebSocket = require('ws');

ShareDB.types.register(RichText.type);
ShareDB.types.register(OTJson0.type);

function docFetch(doc) {
  return new Promise((resolve, reject) => {
    doc.fetch(err => {
      if (err != null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function docSubmitOp(doc, components) {
  return new Promise((resolve, reject) => {
    doc.submitOp(components, undefined, err => {
      if (err != null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function fetchSnapshot(conn, collection, docId, version) {
  return new Promise((resolve, reject) => {
    conn.fetchSnapshot(collection, docId, version, (err, snapshot) => {
      if (err != null) {
        reject(err);
      } else {
        resolve(snapshot);
      }
    });
  });
}

async function main(args) {
  const port = args[0];
  const collectionName = args[1];
  const docsJsonPath = args[2];

  const ws = new WebSocket(`ws://127.0.0.1:${port}/?server=true`);
  const conn = new ShareDB.Connection(ws);

  const data = fs.readFileSync(docsJsonPath, 'utf8');
  const docsToRevert = JSON.parse(data);

  for (const docId of Object.keys(docsToRevert)) {
    const version = docsToRevert[docId];
    const doc = conn.get(collectionName, docId);
    await docFetch(doc);
    const snapshot = await fetchSnapshot(conn, collectionName, docId, version);
    const op = doc.type.diff(doc.data, snapshot.data);
    await docSubmitOp(doc, op);
  }
  conn.close();
}

(async () => {
  await main(process.argv.slice(2));
})().catch(e => {
  console.log(e);
});
