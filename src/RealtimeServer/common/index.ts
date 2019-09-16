import * as OTJson0 from 'ot-json0';
import * as RichText from 'rich-text';
import ShareDB = require('sharedb');
import { Doc, OTType } from 'sharedb/lib/client';
import { RealtimeServer, RealtimeServerConstructor, RealtimeServerOptions } from './realtime-server';

ShareDB.types.register(RichText.type);
ShareDB.types.register(OTJson0.type);

type InteropCallback = (err?: any, ret?: any) => void;

let server: RealtimeServer | undefined;

function createSnapshot(doc: Doc): { version: number; data: any } {
  return { version: doc.version, data: doc.data };
}

export = {
  start: (callback: InteropCallback, options: RealtimeServerOptions) => {
    const RealtimeServerType: RealtimeServerConstructor = require(`../${options.appModuleName}/realtime-server`);
    server = new RealtimeServerType(options);
    server
      .init()
      .then(rs => rs.start())
      .then(() => callback())
      .catch(err => callback(err));
  },

  stop: (callback: InteropCallback) => {
    if (server != null) {
      server.stop();
      server = undefined;
    }
    callback();
  },

  connect: (callback: InteropCallback, userId?: string) => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    const handle = server.connect(userId);
    callback(undefined, handle);
  },

  disconnect: (callback: InteropCallback, handle: number) => {
    if (server == null) {
      callback(new Error('Server not started.'));
      return;
    }
    server.disconnect(handle);
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
    const doc = server.getDoc(handle, collection, id);
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
    const doc = server.getDoc(handle, collection, id);
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
    const doc = server.getDoc(handle, collection, id);
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
    const doc = server.getDoc(handle, collection, id);
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
