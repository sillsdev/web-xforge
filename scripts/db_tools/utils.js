/**
 * @param {string} package The name of the package to import
 */
function requireFromRealTimeServer(package) {
  return require('../../src/RealtimeServer/node_modules/' + package);
}

/**
 * @param {ShareDB.Doc} doc The doc to fetch
 */
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

/**
 * @param {ShareDB.Doc} doc The document to submit the op to
 * @param {Object} op The op to submit
 */
function submitDocOp(doc, op) {
  return new Promise((resolve, reject) => {
    doc.submitOp(op, undefined, err => {
      if (err != null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * @param {ShareDB.Doc} doc The doc to delete
 */
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

/**
 * @param {ShareDB.Doc} doc The document to create (The document object needs to already exist; this function just
 * writes it to ShareDB)
 * @param {object} data The data of the document (actual contents as opposed to metadata)
 * @param {string} type Type of the document (e.g. 'richtext')
 */
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

/**
 * @param {ShareDB.Connection} conn The ShareDB connection
 * @param {string} collection The collection to fetch the doc from
 * @param {string} docId The id of the doc
 * @param {number} version Version number of the snapshot to fetch
 */
function fetchSnapshotByVersion(conn, collection, docId, version) {
  return new Promise((resolve, reject) => {
    conn.fetchSnapshot(collection, docId, version, (err, snapshot) => (err != null ? reject(err) : resolve(snapshot)));
  });
}

/**
 * @param {ShareDB.Connection} conn The ShareDB connection
 * @param {string} collection The collection to fetch the doc from
 * @param {string} docId The id of the doc
 * @param {number} time The timestamp of the desired snapshot, in milliseconds since Unix Epoch
 */
function fetchSnapshotByTimestamp(conn, collection, docId, time) {
  return new Promise((resolve, reject) => {
    conn.fetchSnapshotByTimestamp(collection, docId, time, (err, snapshot) =>
      err != null ? reject(err) : resolve(snapshot)
    );
  });
}

/**
 * @param {Object[]} ops List of operations, where an operation can be any object for the purposes of this function
 * (though in practice the definition of an operation should be much more limited; this function is just flexible).
 */
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
