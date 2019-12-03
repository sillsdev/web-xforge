import { MongoClient } from 'mongodb';
import * as OTJson0 from 'ot-json0';
import * as RichText from 'rich-text';
import ShareDB = require('sharedb');
import ShareDBMongo = require('sharedb-mongo');
import { Connection, Doc, OTType } from 'sharedb/lib/client';
import { MetadataDB } from './metadata-db';
import { RealtimeServer, RealtimeServerConstructor } from './realtime-server';
import { SchemaVersionRepository } from './schema-version-repository';
import { WebSocketStreamListener } from './web-socket-stream-listener';

ShareDB.types.register(RichText.type);
ShareDB.types.register(OTJson0.type);

type InteropCallback = (err?: any, ret?: any) => void;

interface RealtimeServerOptions {
  appModuleName: string;
  connectionString: string;
  port: number;
  audience: string;
  scope: string;
  authority: string;
}

let server: RealtimeServer | undefined;
let streamListener: WebSocketStreamListener | undefined;
const connections = new Map<number, Connection>();
let connectionIndex = 0;
let running = false;

async function startServer(options: RealtimeServerOptions): Promise<void> {
  if (running) {
    return;
  }

  try {
    const RealtimeServerType: RealtimeServerConstructor = require(`../${options.appModuleName}/realtime-server`);
    const DBType = MetadataDB(ShareDBMongo);
    const client = await MongoClient.connect(options.connectionString, { useUnifiedTopology: true });
    const db = client.db();
    server = new RealtimeServerType(new DBType(callback => callback(null, client)), new SchemaVersionRepository(db));
    await server.createIndexes(db);
    await server.migrateIfNecessary();

    streamListener = new WebSocketStreamListener(options.audience, options.scope, options.authority, options.port);
    streamListener.listen(server);
    await streamListener.start();
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
  if (running) {
    running = false;
    console.log('Realtime Server stopped.');
  }
}

function createSnapshot(doc: Doc): { version: number; data: any } {
  return { version: doc.version, data: doc.data };
}

function getDoc(handle: number, collection: string, id: string): Doc | undefined {
  const conn = connections.get(handle);
  if (conn != null) {
    return conn.get(collection, id);
  }
  return undefined;
}

export = {
  start: (callback: InteropCallback, options: RealtimeServerOptions) => {
    startServer(options)
      .then(() => callback())
      .catch(err => callback(err));
  },

  stop: (callback: InteropCallback) => {
    stopServer();
    callback();
  },

  connect: (callback: InteropCallback, userId?: string) => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const connection = server.connect(userId);
    const index = connectionIndex++;
    connections.set(index, connection);
    callback(undefined, index);
  },

  disconnect: (callback: InteropCallback, handle: number) => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    connections.delete(handle);
    callback();
  },

  createDoc: (
    callback: InteropCallback,
    handle: number,
    collection: string,
    id: string,
    data: any,
    typeName: OTType
  ) => {
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

  fetchDoc: (callback: InteropCallback, handle: number, collection: string, id: string) => {
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

  submitOp: (callback: InteropCallback, handle: number, collection: string, id: string, ops: ShareDB.Op[]) => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const doc = getDoc(handle, collection, id);
    if (doc == null) {
      callback(new Error('Connection not found.'));
      return;
    }
    doc.submitOp(ops, undefined, err => callback(err, createSnapshot(doc)));
  },

  deleteDoc: (callback: InteropCallback, handle: number, collection: string, id: string) => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const doc = getDoc(handle, collection, id);
    if (doc == null) {
      callback(new Error('Connection not found.'));
      return;
    }
    doc.del({}, err => callback(err));
  },

  applyOp: (callback: InteropCallback, typeName: string, data: any, ops: ShareDB.Op[]) => {
    const type = ShareDB.types.map[typeName];
    if (ops != null && type.normalize != null) {
      ops = type.normalize(ops);
    }
    data = type.apply(data, ops);
    callback(undefined, data);
  }
};
