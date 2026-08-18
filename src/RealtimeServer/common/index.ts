import json0OtDiff from 'json0-ot-diff';
import { MongoClient } from 'mongodb';
import * as OTJson0 from 'ot-json0';
import * as RichText from 'rich-text';
import ShareDB from 'sharedb';
import MongoMilestoneDB from 'sharedb-milestone-mongo';
import ShareDBMongo from 'sharedb-mongo';
import { Connection, Doc, OTType } from 'sharedb/lib/client';
import { ActivityLogger } from './activity-logger';
import './diagnostics';
import { ExceptionReporter } from './exception-reporter';
import { InteropCallback, InteropCallContext, withActivityLogging } from './interop-activity-logging';
import { MetadataDB } from './metadata-db';
import { RealtimeServer, RealtimeServerConstructor } from './realtime-server';
import { ResourceMonitor } from './resource-monitor';
import { SchemaVersionRepository } from './schema-version-repository';
import { WebSocketStreamListener } from './web-socket-stream-listener';

ShareDB.types.register(RichText.type);
ShareDB.types.register(OTJson0.type);

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
/** Identifier for a connection from dotnet. */
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
      // eslint-disable-next-line @typescript-eslint/no-require-imports
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
      exceptionReporter
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
        exceptionReporter
      );
      secureStreamListener.listen(server);
      await secureStreamListener.start();
    }
    running = true;
    console.log('Realtime Server started.');
    ActivityLogger.instance.log('serverStarted', {
      siteId: options.siteId,
      migrationsDisabled: options.migrationsDisabled,
      dataValidationDisabled: options.dataValidationDisabled,
      port: options.port,
      securePort: options.securePort
    });
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
    ActivityLogger.instance.log('serverStopped', {});
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

// Here we define the API for the dotnet process to use from RealtimeServer.cs. See also realtime-server.ts
// RealtimeServer.
export = withActivityLogging({
  start: (callback: InteropCallback, _context: InteropCallContext, options: RealtimeServerOptions): void => {
    startServer(options)
      .then(() => callback(undefined, {}))
      .catch(err => callback(err));
  },

  stop: (callback: InteropCallback, _context: InteropCallContext): void => {
    stopServer();
    callback(undefined, {});
  },

  isServerRunning: (callback: InteropCallback, _context: InteropCallContext): void => {
    callback(undefined, !(server == null));
  },

  connect: (callback: InteropCallback, context: InteropCallContext, userId?: string): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const index = connectionIndex++;
    const connection = server.connectAsServer(userId, index);
    connection.on('error', err => console.log(err));
    connections.set(index, connection);
    ResourceMonitor.instance.startMonitoringConnection(connection, {
      kind: 'interop',
      owner: userId
    });
    ActivityLogger.instance.log('interopConnect', {
      callId: context.callId,
      handle: index,
      userId: userId
    });
    callback(undefined, index);
  },

  disconnect: (callback: InteropCallback, context: InteropCallContext, handle: number): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const conn = connections.get(handle);
    if (conn != null) {
      ResourceMonitor.instance.stopMonitoringConnection(conn);
    }
    connections.delete(handle);
    ActivityLogger.instance.log('interopDisconnect', { callId: context.callId, handle: handle });
    callback(undefined, {});
  },

  createDoc: (
    callback: InteropCallback,
    context: InteropCallContext,
    handle: number,
    collection: string,
    id: string,
    data: any,
    typeName: OTType,
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
    doc.create(data, typeName, options, err => {
      if (source != null) {
        doc.submitSource = false;
      }
      ActivityLogger.instance.log('interopCreateDoc', {
        callId: context.callId,
        handle: handle,
        collection: collection,
        docId: id,
        typeName: typeName,
        source: source
      });
      callback(err, createSnapshot(doc));
    });
  },

  fetchDoc: (
    callback: InteropCallback,
    context: InteropCallContext,
    handle: number,
    collection: string,
    id: string
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
    doc.fetch(err => {
      ActivityLogger.instance.log('interopFetchDoc', {
        callId: context.callId,
        handle: handle,
        collection: collection,
        docId: id
      });
      callback(err, createSnapshot(doc));
    });
  },

  fetchDocs: (
    callback: InteropCallback,
    context: InteropCallContext,
    handle: number,
    collection: string,
    ids: string[]
  ): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const conn = connections.get(handle);
    const operationId = ResourceMonitor.instance.beginFetchOperation(conn, collection, ids.length);
    if (conn == null) {
      const err = new Error('Connection not found.');
      void ResourceMonitor.instance.endFetchOperation(operationId, undefined, err);
      callback(err);
      return;
    }
    const query = { _id: { $in: ids } };
    conn.createFetchQuery(collection, query, {}, (err, results) => {
      void ResourceMonitor.instance.endFetchOperation(operationId, results, err);
      ActivityLogger.instance.log('interopFetchDocs', {
        callId: context.callId,
        // The id ResourceMonitor recorded this fetch under, so that this entry can be tied to the row in
        // fetch-info.csv reporting what the fetch cost, without having to match on time.
        operationId: operationId,
        handle: handle,
        collection: collection,
        requestedIdsCount: ids.length,
        returnedDocsCount: results?.length ?? 0
      });
      callback(err, createSnapshots(results));
    });
  },

  fetchSnapshotByTimestamp: (
    callback: InteropCallback,
    context: InteropCallContext,
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
    if (conn == null) {
      callback(new Error('Connection not found.'));
      return;
    }
    conn.fetchSnapshotByTimestamp(collection, id, timestamp, (err, snapshot) => {
      ActivityLogger.instance.log('interopFetchSnapshotByTimestamp', {
        callId: context.callId,
        handle: handle,
        collection: collection,
        docId: id,
        requestedTimestamp: timestamp
      });
      callback(err, snapshot);
    });
  },

  fetchSnapshotsByTimestamp: (
    callback: InteropCallback,
    _context: InteropCallContext,
    handle: number,
    collection: string,
    ids: string[],
    timestamp: number
  ): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const conn = connections.get(handle);
    if (conn == null) {
      callback(new Error('Connection not found.'));
      return;
    }
    Promise.all(
      ids.map(
        id =>
          new Promise((resolve, reject) =>
            conn.fetchSnapshotByTimestamp(collection, id, timestamp, (err, snapshot) =>
              err == null ? resolve(snapshot) : reject(err)
            )
          )
      )
    ).then(
      snapshots => callback(undefined, snapshots),
      err => callback(err)
    );
  },

  getOps: (callback: InteropCallback, context: InteropCallContext, collection: string, id: string): void => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    server.db.getOps(collection, id, 0, null, { metadata: true }, (err, ops) => {
      ActivityLogger.instance.log('interopGetOps', {
        callId: context.callId,
        collection: collection,
        docId: id,
        opsCount: ops?.length ?? 0
      });
      callback(err, ops);
    });
  },

  submitOp: (
    callback: InteropCallback,
    context: InteropCallContext,
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
      ActivityLogger.instance.log('interopSubmitOp', {
        callId: context.callId,
        handle: handle,
        collection: collection,
        docId: id,
        opsCount: ops.length,
        source: source
      });
      callback(err, createSnapshot(doc));
    });
  },

  deleteDoc: (
    callback: InteropCallback,
    context: InteropCallContext,
    handle: number,
    collection: string,
    id: string
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
    doc.del({}, err => {
      ActivityLogger.instance.log('interopDeleteDoc', {
        callId: context.callId,
        handle: handle,
        collection: collection,
        docId: id
      });
      callback(err, {});
    });
  },

  applyOp: (
    callback: InteropCallback,
    _context: InteropCallContext,
    typeName: string,
    data: any,
    ops: ShareDB.Op[]
  ): void => {
    const type = ShareDB.types.map[typeName];
    if (ops != null && type.normalize != null) {
      ops = type.normalize(ops);
    }
    data = type.apply(data, ops);
    callback(undefined, data);
  },

  replaceDoc: (
    callback: InteropCallback,
    context: InteropCallContext,
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
    let ops: any;
    let hasOps: boolean;
    if (doc.type?.name == OTJson0.type.name) {
      // NOTE: We do not use diff-patch-match, as that may result in
      // op conflicts when ops are submitted from multiple sources.
      // diff-patch-match mutates the string, but we want to replace it.
      ops = json0OtDiff(doc.data, data);
      hasOps = ops.length > 0;
    } else if (doc.type?.name == RichText.type.name) {
      ops = new RichText.Delta(doc.data.ops).diff(new RichText.Delta(data.ops));
      hasOps = ops.ops.length > 0;
    } else {
      callback(new Error('Unsupported document type.'));
      return;
    }

    // Submit the ops
    if (hasOps) {
      const options: any = {};
      doc.submitSource = source != null;
      if (source != null) {
        options.source = source;
      }
      doc.submitOp(ops, options, err => {
        if (source != null) {
          doc.submitSource = false;
        }
        ActivityLogger.instance.log('interopReplaceDoc', {
          callId: context.callId,
          handle: handle,
          collection: collection,
          docId: id,
          hasOps: true,
          source: source
        });
        callback(err, createSnapshot(doc));
      });
    } else {
      ActivityLogger.instance.log('interopReplaceDoc', {
        callId: context.callId,
        handle: handle,
        collection: collection,
        docId: id,
        hasOps: false,
        source: source
      });
      callback(null, createSnapshot(doc));
    }
  }
});
