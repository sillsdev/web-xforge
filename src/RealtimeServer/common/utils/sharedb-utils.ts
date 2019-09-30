import { Connection, Doc, OTType, Query } from 'sharedb/lib/client';
import { Json0OpBuilder } from './json0-op-builder';

export function docFetch(doc: Doc): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    doc.fetch(err => {
      if (err != null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function docCreate(doc: Doc, data: any, type?: OTType): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    doc.create(data, type, err => {
      if (err != null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function docSubmitOp(doc: Doc, components: any): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    doc.submitOp(components, undefined, err => {
      if (err != null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export async function docSubmitJson0Op<T>(doc: Doc, build: (op: Json0OpBuilder<T>) => void): Promise<boolean> {
  const builder = new Json0OpBuilder<T>(doc.data);
  build(builder);
  if (builder.op.length > 0) {
    await docSubmitOp(doc, builder.op);
    return true;
  }
  return false;
}

export function docDelete(doc: Doc): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    doc.del({}, err => {
      if (err != null) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export function createFetchQuery(conn: Connection, collection: string, query: any): Promise<Query> {
  return new Promise<Query>((resolve, reject) => {
    const queryObj = conn.createFetchQuery(collection, query, {}, err => {
      if (err != null) {
        reject(err);
      } else {
        resolve(queryObj);
      }
    });
  });
}
