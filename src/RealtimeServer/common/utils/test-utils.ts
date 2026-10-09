import ShareDB from 'sharedb';
import { Connection, Doc, OTType, Query } from 'sharedb/lib/client';
import { Snapshot } from 'sharedb/lib/common';
import { SystemRole } from '../models/system-role';
import { RealtimeServer, XF_ROLE_CLAIM, XF_USER_ID_CLAIM } from '../realtime-server';
import { Json0OpBuilder } from './json0-op-builder';
import { createFetchQuery, docCreate, docDelete, docFetch, docSubmitJson0Op, docSubmitOp } from './sharedb-utils';

/** Runs a fetch query as the connection's user and resolves to the matching docs. */
export async function fetchQuery(conn: Connection, collection: string, query: any): Promise<Doc[]> {
  const queryObj: Query = await createFetchQuery(conn, collection, query);
  return queryObj.results;
}

/** Requests the snapshot of a document at a version, or at its latest version when `version` is null. */
export function fetchSnapshot(
  conn: Connection,
  collection: string,
  id: string,
  version: number | null
): Promise<Snapshot> {
  return new Promise<Snapshot>((resolve, reject) => {
    conn.fetchSnapshot(collection, id, version, (err, snapshot) => {
      if (err != null) {
        reject(err);
      } else {
        resolve(snapshot);
      }
    });
  });
}

/** Requests the snapshot a document had at a point in time. */
export function fetchSnapshotByTimestamp(
  conn: Connection,
  collection: string,
  id: string,
  timestamp: number
): Promise<Snapshot> {
  return new Promise<Snapshot>((resolve, reject) => {
    conn.fetchSnapshotByTimestamp(collection, id, timestamp, (err, snapshot) => {
      if (err != null) {
        reject(err);
      } else {
        resolve(snapshot);
      }
    });
  });
}

/**
 * Connects with a user's own session, somewhat like a frontend client. For unit tests.
 */
export function clientConnect(server: RealtimeServer, userId: string, role: SystemRole = SystemRole.User): Connection {
  return server.connect(undefined, { user: { [XF_USER_ID_CLAIM]: userId, [XF_ROLE_CLAIM]: role } });
}

export async function fetchDoc(conn: Connection, collection: string, id: string): Promise<Doc> {
  const doc = conn.get(collection, id);
  await docFetch(doc);
  return doc;
}

export async function hasDoc(conn: Connection, collection: string, id: string): Promise<boolean> {
  const doc = conn.get(collection, id);
  await docFetch(doc);
  return doc.data != null;
}

export function createDoc<T>(
  conn: Connection,
  collection: string,
  id: string,
  data: T,
  type?: OTType,
  source: boolean | any | undefined = undefined
): Promise<void> {
  const doc = conn.get(collection, id);
  if (source != null) {
    doc.submitSource = true;
  }
  return docCreate(doc, data, type, source);
}

export async function submitOp(
  conn: Connection,
  collection: string,
  id: string,
  components: any,
  source: boolean | any | undefined = undefined
): Promise<void> {
  const doc = conn.get(collection, id);
  await docFetch(doc);
  if (source != null) {
    doc.submitSource = true;
  }
  await docSubmitOp(doc, components, source);
}

export async function submitJson0Op<T>(
  conn: Connection,
  collection: string,
  id: string,
  build: (op: Json0OpBuilder<T>) => void,
  source: boolean | any | undefined = undefined
): Promise<boolean> {
  const doc = conn.get(collection, id);
  await docFetch(doc);
  if (source != null) {
    doc.submitSource = true;
  }
  return await docSubmitJson0Op(doc, build, source);
}

/**
 * Submits the op data exactly as given, as a client that sends its own messages could. Doc.submitOp always submits a list
 * of components.
 */
export async function submitOpData(
  server: RealtimeServer,
  conn: Connection,
  collection: string,
  id: string,
  opData: unknown
): Promise<void> {
  // Fetching the doc makes sure that the connection has its session
  await fetchDoc(conn, collection, id);
  // ShareDB.connect stores the agent on the connection, which the typings do not declare
  const agent: ShareDB.Agent = (conn as Connection & { agent: ShareDB.Agent }).agent;
  return new Promise((resolve, reject) =>
    server.submit(agent, collection, id, { op: opData } as ShareDB.RawOp, {}, err => {
      if (err == null) {
        resolve();
      } else {
        // An access denial is a string, which the ShareDB client turns into an error, so this does too
        reject(typeof err === 'string' ? new Error(err) : err);
      }
    })
  );
}

export async function deleteDoc(conn: Connection, collection: string, id: string): Promise<void> {
  const doc = conn.get(collection, id);
  await docFetch(doc);
  await docDelete(doc);
}

export function allowAll(server: RealtimeServer, collection: string): void {
  server.allowCreate(collection, () => true);
  server.allowDelete(collection, () => true);
  server.allowRead(collection, () => true);
  server.allowUpdate(collection, () => true);
  server.allowQuery(collection, () => true);
}

export function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}
