declare module 'sharedb-milestone-mongo' {
  import ShareDB from 'sharedb';

  class MongoMilestoneDB extends ShareDB.MilestoneDB {
    constructor(mongo: string | any, options?: any);
  }

  export = MongoMilestoneDB;
}
