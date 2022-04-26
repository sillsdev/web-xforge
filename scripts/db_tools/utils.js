const WebSocket = requireFromRealTimeServer('ws');

/**
 * @param {string} packageName The name of the package to import
 */
function requireFromRealTimeServer(packageName) {
  return require('../../src/RealtimeServer/node_modules/' + packageName);
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

let shouldUseColor = true;

/** Specify if `colored()` should use colouring. Nice for output to a dark terminal. Not nice in log files. */
function useColor(ifUseColor) {
  shouldUseColor = ifUseColor;
}

function setColor(colorCode) {
  return `\x1b[38;5;${colorCode}m`;
}

function endColor() {
  return '\x1b[0m';
}

function colored(colorCode, textToColor) {
  if (shouldUseColor) {
    return setColor(colorCode) + textToColor + endColor();
  } else {
    return textToColor;
  }
}

/** Enum of colors and their bash 256-colour values. */
const colors = Object.freeze({
  darkGrey: 241,
  red: 196,
  lightBlue: 39,
  lightGreen: 48,
  yellow: 190,
  orange: 208
});

/**
 * @param {Object[]} ops List of operations, where an operation can be any object for the purposes of this function
 * (though in practice the definition of an operation should be much more limited; this function is just flexible).
 * @param {showAttributes} Describe some op attributes inline.
 */
function visualizeOps(ops, showAttributes = false) {
  const result = ops
    .map(op => {
      if (typeof op.insert === 'undefined') {
        return colored(colors.red, '[ invalid op ' + JSON.stringify(op) + ' ]');
      } else if (typeof op.insert === 'string') {
        let output = op.insert;
        if (showAttributes) {
          output = colored(colors.darkGrey, JSON.stringify(op.attributes)) + output;
        }
        return output;
      } else if (op.insert.blank === true) {
        if (showAttributes) {
          return colored(colors.darkGrey, '(blank)');
        }
      } else if (op.insert.verse) {
        return colored(colors.lightBlue, op.insert.verse.number + ' ');
      } else if (op.insert.chapter) {
        return colored(colors.lightGreen, 'Chapter ' + op.insert.chapter.number) + '\n';
      } else return '';
    })
    .join('');
  console.log(result);
}

function createWS(connectionConfig) {
  return new WebSocket(connectionConfig.wsConnectionString, [], { origin: connectionConfig.origin });
}

const devConfig = {
  dbLocation: 'mongodb://localhost:27017/xforge',
  wsConnectionString: 'ws://127.0.0.1:5003/?server=true',
  origin: 'http://localhost:5000'
};

const qaConfig = {
  dbLocation: 'mongodb://localhost:4017/xforge',
  wsConnectionString: 'ws://127.0.0.1:4003/?server=true',
  origin: 'https://qa.scriptureforge.org'
};

const liveConfig = {
  dbLocation: 'mongodb://localhost:3017/xforge',
  wsConnectionString: 'ws://127.0.0.1:3003/?server=true',
  origin: 'https://scriptureforge.org'
};

const databaseConfigs = new Map();
databaseConfigs.set('dev', devConfig);
databaseConfigs.set('qa', qaConfig);
databaseConfigs.set('live', liveConfig);

module.exports = {
  requireFromRealTimeServer,
  fetchDoc,
  submitDocOp,
  deleteDoc,
  createDoc,
  fetchSnapshotByVersion,
  fetchSnapshotByTimestamp,
  visualizeOps,
  useColor,
  colored,
  createWS,
  colors,
  devConfig,
  qaConfig,
  liveConfig,
  databaseConfigs
};
