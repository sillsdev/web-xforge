declare module 'sharedb-mongo' {
  import ShareDB = require('sharedb');

  class ShareDbMongo extends ShareDB.DB {
    constructor(mongo: string, options?: any);
  }

  export = ShareDbMongo;
}
