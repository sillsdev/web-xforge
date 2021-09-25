function requireFromRealTimeServer(package) {
  return require('../../src/RealtimeServer/node_modules/' + package);
}

function fetchDoc(doc) {
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

function submitDocOp(doc, components) {
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

function deleteDoc(doc) {
  return new Promise((resolve, reject) => {
    doc.del(undefined, err => {
      if (err != null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function createDoc(doc, data, type) {
  return new Promise((resolve, reject) => {
    doc.create(data, type, undefined, err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function fetchSnapshotByVersion(conn, collection, docId, version) {
  return new Promise((resolve, reject) => {
    conn.fetchSnapshot(collection, docId, version, (err, snapshot) => (err != null ? reject(err) : resolve(snapshot)));
  });
}

function fetchSnapshotByTimestamp(conn, collection, docId, time) {
  return new Promise((resolve, reject) => {
    conn.fetchSnapshotByTimestamp(collection, docId, time, (err, snapshot) =>
      err != null ? reject(err) : resolve(snapshot)
    );
  });
}

function visualizeOps(ops) {
  const result = ops
    .map(op => {
      if (typeof op.insert === 'undefined') {
        return '[ invalid op ' + JSON.stringify(op) + ' ]';
      } else if (typeof op.insert === 'string') {
        return op.insert;
      } else if (op.insert.verse) {
        return op.insert.verse.number + ' ';
      } else if (op.insert.chapter) {
        return 'Chapter ' + op.insert.chapter.number + '\n';
      } else return '';
    })
    .join('');
  console.log(result);
}

const devConfig = {
  dbLocation: 'mongodb://localhost:27017/xforge',
  wsConnectionString: 'ws://127.0.0.1:5003/?server=true'
};

const qaConfig = {
  dbLocation: 'mongodb://localhost:4017/xforge',
  wsConnectionString: 'ws://127.0.0.1:4003/?server=true'
};

const liveConfig = {
  dbLocation: 'mongodb://localhost:3017/xforge',
  wsConnectionString: 'ws://127.0.0.1:3003/?server=true'
};

module.exports = {
  requireFromRealTimeServer,
  fetchDoc,
  submitDocOp,
  deleteDoc,
  createDoc,
  fetchSnapshotByVersion,
  fetchSnapshotByTimestamp,
  visualizeOps,
  devConfig,
  qaConfig,
  liveConfig
};
