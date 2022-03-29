import { Connection, Doc, OTType } from 'sharedb/lib/client';
import { SystemRole } from '../models/system-role';
import { RealtimeServer, XF_ROLE_CLAIM, XF_USER_ID_CLAIM } from '../realtime-server';
import { Json0OpBuilder } from './json0-op-builder';
import { docCreate, docDelete, docFetch, docSubmitJson0Op, docSubmitOp } from './sharedb-utils';

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

export function createDoc<T>(conn: Connection, collection: string, id: string, data: T, type?: OTType): Promise<void> {
  return docCreate(conn.get(collection, id), data, type);
}

export async function submitOp(conn: Connection, collection: string, id: string, components: any): Promise<void> {
  const doc = conn.get(collection, id);
  await docFetch(doc);
  await docSubmitOp(doc, components);
}

export async function submitJson0Op<T>(
  conn: Connection,
  collection: string,
  id: string,
  build: (op: Json0OpBuilder<T>) => void
): Promise<boolean> {
  const doc = conn.get(collection, id);
  await docFetch(doc);
  return await docSubmitJson0Op(doc, build);
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
}

export function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}
