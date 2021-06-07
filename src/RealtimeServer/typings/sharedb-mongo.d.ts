declare module 'sharedb-mongo' {
  import { MongoClient } from 'mongodb';
  import ShareDB from 'sharedb';

  type Callback = (err: any, client: MongoClient) => void;

  class ShareDbMongo extends ShareDB.DB {
    constructor(mongo: string | ((callback: Callback) => void), options?: any);
  }

  export = ShareDbMongo;
}
