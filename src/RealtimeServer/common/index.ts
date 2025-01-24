import json0OtDiff from 'json0-ot-diff';
import { MongoClient } from 'mongodb';
import * as OTJson0 from 'ot-json0';
import * as RichText from 'rich-text';
import ShareDB from 'sharedb';
import MongoMilestoneDB from 'sharedb-milestone-mongo';
import ShareDBMongo from 'sharedb-mongo';
import { Connection, Doc, OTType } from 'sharedb/lib/client';
import './diagnostics';
import { ExceptionReporter } from './exception-reporter';
import { MetadataDB } from './metadata-db';
import { RealtimeServer, RealtimeServerConstructor } from './realtime-server';
import { SchemaVersionRepository } from './schema-version-repository';
import { WebSocketStreamListener } from './web-socket-stream-listener';

ShareDB.types.register(RichText.type);
ShareDB.types.register(OTJson0.type);

type InteropCallback = (err?: any, ret?: any) => void;

interface Snapshot {
  version: number;
  data: any;
  id: string;
}

interface RealtimeServerOptions {
  appModuleName: string;
  connectionString: string;
  port: number;
  securePort: number;
  certificatePath: string;
  privateKeyPath: string;
  audience: string;
  scope: string;
  authority: string;
  origin: string;
  bugsnagApiKey: string;
  releaseStage: string;
  migrationsDisabled: boolean;
  dataValidationDisabled: boolean;
  siteId: string;
  version: string;
}

let server: RealtimeServer | undefined;
let streamListener: WebSocketStreamListener | undefined;
let secureStreamListener: WebSocketStreamListener | undefined;
const connections = new Map<number, Connection>();
let connectionIndex = 0;
let running = false;

async function startServer(options: RealtimeServerOptions): Promise<void> {
  if (running) {
    return;
  }

  const exceptionReporter = new ExceptionReporter(options.bugsnagApiKey, options.releaseStage, options.version);
  function reportError(...args: unknown[]): void {
    console.error('Error from ShareDB server: ', ...args);
    exceptionReporter.report(args.toString());
  }
  // ShareDB sometimes reports errors as warnings
  ShareDB.logger.setMethods({ warn: reportError, error: reportError });

  try {
    const RealtimeServerType: RealtimeServerConstructor =
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require(`../${options.appModuleName}/realtime-server`).default;

    const DBType = MetadataDB(ShareDBMongo);
    const client = await MongoClient.connect(options.connectionString);
    const db = client.db();
    server = new RealtimeServerType(
      options.siteId,
      options.migrationsDisabled,
      options.dataValidationDisabled,
      new DBType(callback => callback(null, client)),
      new SchemaVersionRepository(db),
      new MongoMilestoneDB(options.connectionString)
    );
    await server.createIndexes(db);
    await server.addValidationSchema(db);

    streamListener = new WebSocketStreamListener(
      options.audience,
      options.scope,
      options.authority,
      options.port,
      undefined,
      undefined,
      options.origin.split(';').filter(s => s !== ''),
      exceptionReporter,
      options.connectionString
    );
    streamListener.listen(server);
    await streamListener.start();

    // Open a secure port, if one was specified
    if (
      options.securePort !== 0 &&
      options.certificatePath != '' &&
      options.certificatePath != null &&
      options.privateKeyPath != '' &&
      options.privateKeyPath != null
    ) {
      secureStreamListener = new WebSocketStreamListener(
        options.audience,
        options.scope,
        options.authority,
        options.securePort,
        options.certificatePath,
        options.privateKeyPath,
        options.origin.split(';').filter(s => s !== ''),
        exceptionReporter,
        options.connectionString
      );
      secureStreamListener.listen(server);
      await secureStreamListener.start();
    }
    running = true;
    console.log('Realtime Server started.');
  } catch (err) {
    stopServer();
    throw err;
  }
}

function stopServer(): void {
  if (server != null) {
    server.close();
    server = undefined;
  }
  if (streamListener != null) {
    streamListener.stop();
    streamListener = undefined;
  }
  if (secureStreamListener != null) {
    secureStreamListener.stop();
    secureStreamListener = undefined;
  }
  if (running) {
    running = false;
    console.log('Realtime Server stopped.');
  }
}

function createSnapshot(doc: Doc): Snapshot {
  return { version: doc.version, data: doc.data, id: doc.id };
}

function createSnapshots(docs: Doc[] | undefined): Snapshot[] | undefined {
  return docs?.map(doc => {
    return { version: doc.version, data: doc.data, id: doc.id };
  });
}

function getDoc(handle: number, collection: string, id: string): Doc | undefined {
  const conn = connections.get(handle);
  if (conn != null) {
    return conn.get(collection, id);
  }
  return undefined;
}

export = {
  start: (callback: InteropCallback, options: RealtimeServerOptions): void => {
    startServer(options)
      .then(() => callback(undefined, {}))
      .catch(err => callback(err));
  },

  stop: (callback: InteropCallback): void => {
    stopServer();
    callback(undefined, {});
  },

  isServerRunning: (callback: InteropCallback): void => {
    callback(undefined, !(server == null));
  },

  connect: (callback: InteropCallback, userId?: string): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const connection = server.connect(userId);
    connection.on('error', err => console.log(err));
    const index = connectionIndex++;
    connections.set(index, connection);
    callback(undefined, index);
  },

  disconnect: (callback: InteropCallback, handle: number): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    connections.delete(handle);
    callback(undefined, {});
  },

  createDoc: (
    callback: InteropCallback,
    handle: number,
    collection: string,
    id: string,
    data: any,
    typeName: OTType
  ): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const doc = getDoc(handle, collection, id);
    if (doc == null) {
      callback(new Error('Connection not found.'));
      return;
    }
    doc.create(data, typeName, err => callback(err, createSnapshot(doc)));
  },

  fetchDoc: (callback: InteropCallback, handle: number, collection: string, id: string): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const doc = getDoc(handle, collection, id);
    if (doc == null) {
      callback(new Error('Connection not found.'));
      return;
    }
    doc.fetch(err => callback(err, createSnapshot(doc)));
  },

  fetchDocs: (callback: InteropCallback, handle: number, collection: string, ids: string[]): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const conn = connections.get(handle);
    const query = { _id: { $in: ids } };
    conn?.createFetchQuery(collection, query, {}, (err, results) => callback(err, createSnapshots(results)));
  },

  fetchSnapshotByTimestamp: (
    callback: InteropCallback,
    handle: number,
    collection: string,
    id: string,
    timestamp: number
  ): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const conn = connections.get(handle);
    conn?.fetchSnapshotByTimestamp(collection, id, timestamp, (err, snapshot) => callback(err, snapshot));
  },

  getOps: (callback: InteropCallback, collection: string, id: string): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    server.db.getOps(collection, id, 0, null, { metadata: true }, (err, ops) => callback(err, ops));
  },

  submitOp: (
    callback: InteropCallback,
    handle: number,
    collection: string,
    id: string,
    ops: ShareDB.Op[],
    source: string | undefined
  ): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const doc = getDoc(handle, collection, id);
    if (doc == null) {
      callback(new Error('Connection not found.'));
      return;
    }
    const options: any = {};
    doc.submitSource = source != null;
    if (source != null) {
      options.source = source;
    }
    doc.submitOp(ops, options, err => {
      if (source != null) {
        doc.submitSource = false;
      }
      callback(err, createSnapshot(doc));
    });
  },

  deleteDoc: (callback: InteropCallback, handle: number, collection: string, id: string): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const doc = getDoc(handle, collection, id);
    if (doc == null) {
      callback(new Error('Connection not found.'));
      return;
    }
    doc.del({}, err => callback(err, {}));
  },

  applyOp: (callback: InteropCallback, typeName: string, data: any, ops: ShareDB.Op[]): void => {
    const type = ShareDB.types.map[typeName];
    if (ops != null && type.normalize != null) {
      ops = type.normalize(ops);
    }
    data = type.apply(data, ops);
    callback(undefined, data);
  },

  replaceDoc: (
    callback: InteropCallback,
    handle: number,
    collection: string,
    id: string,
    data: any,
    source: string | undefined
  ): void => {
    // Ensure we can get the existing document
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const doc = getDoc(handle, collection, id);
    if (doc == null) {
      callback(new Error('Connection not found.'));
      return;
    }

    // Build the ops from a diff
    // NOTE: We do not use diff-patch-match, as that may result in
    // op conflicts when ops are submitted from multiple sources.
    // diff-patch-match mutates the string, but we want to replace it.
    const ops = json0OtDiff(doc.data, data);

    // Submit the ops
    if (ops.length > 0) {
      const options: any = {};
      doc.submitSource = source != null;
      if (source != null) {
        options.source = source;
      }
      doc.submitOp(ops, options, err => {
        if (source != null) {
          doc.submitSource = false;
        }
        callback(err, createSnapshot(doc));
      });
    } else {
      callback(null, createSnapshot(doc));
    }
  }
};
