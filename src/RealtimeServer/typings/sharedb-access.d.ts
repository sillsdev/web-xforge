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
          /**
           * The op as ShareDB is about to commit it, which is the client's op transformed against any ops that the
           * client did not have. ShareDB does not check that it is a list of components, and a rich-text op is a Delta
           * rather than a list.
           */
          ops: unknown,
          session: any
        ) => Promise<boolean> | boolean
      ): void;
      /** An update that any of these handlers returns true for is denied, even if an allowUpdate handler allows it. */
      denyUpdate(
        collection: string,
        handler: (
          docId: string,
          oldDoc: unknown,
          newDoc: unknown,
          ops: unknown,
          session: unknown
        ) => Promise<boolean> | boolean
      ): void;
    }
  }
  export = ShareDBAccess;
}
