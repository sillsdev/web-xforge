import ShareDB = require('sharedb');

export interface ShareDBAccessControl<TSession> {
  allowCreate(
    collection: string,
    handler: (docId: string, doc: any, session: TSession) => Promise<boolean> | boolean
  ): void;
  allowDelete(
    collection: string,
    handler: (docId: string, doc: any, session: TSession) => Promise<boolean> | boolean
  ): void;
  allowRead(
    collection: string,
    handler: (docId: string, doc: any, session: TSession) => Promise<boolean> | boolean
  ): void;
  allowUpdate(
    collection: string,
    handler: (
      docId: string,
      oldDoc: any,
      newDoc: any,
      ops: ShareDB.Op[],
      session: TSession
    ) => Promise<boolean> | boolean
  ): void;
}
