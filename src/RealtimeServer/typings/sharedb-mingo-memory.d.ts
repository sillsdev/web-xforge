declare module 'sharedb-mingo-memory' {
  import ShareDB from 'sharedb';

  class ShareDBMingo extends ShareDB.DB {
    static extendMemoryDB(db: typeof ShareDB.DB): typeof ShareDBMingo;

    readonly docs: { [collection: string]: { [docId: string]: ShareDB.Snapshot } };
    readonly ops: { [collection: string]: { [docId: string]: ShareDB.RawOp[] } };

    constructor();
  }

  export = ShareDBMingo;
}
