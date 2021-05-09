declare module 'sharedb-access' {
  import ShareDB from 'sharedb';

  function ShareDBAccess(backend: ShareDB, options?: any): void;

  namespace ShareDBAccess {
    interface AccessControlBackend {
      allowCreate(
        collection: string,
        handler: (docId: string, doc: any, session: any) => Promise<boolean> | boolean
      ): void;
      allowDelete(
        collection: string,
        handler: (docId: string, doc: any, session: any) => Promise<boolean> | boolean
      ): void;
      allowRead(
        collection: string,
        handler: (docId: string, doc: any, session: any) => Promise<boolean> | boolean
      ): void;
      allowUpdate(
        collection: string,
        handler: (
          docId: string,
          oldDoc: any,
          newDoc: any,
          ops: ShareDB.Op[],
          session: any
        ) => Promise<boolean> | boolean
      ): void;
    }
  }
  export = ShareDBAccess;
}
