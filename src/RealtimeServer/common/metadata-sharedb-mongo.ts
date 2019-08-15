import ShareDBMongo = require('sharedb-mongo');

/**
 * This class extends the ShareDB-Mongo adapter to return metadata when retrieving ops.
 */
export class MetadataShareDBMongo extends ShareDBMongo {
  getOpsToSnapshot(
    collection: string,
    id: string,
    from: number,
    snapshot: number,
    options: any,
    callback: (...args: any[]) => any
  ): void {
    if (options == null) {
      options = {};
    }
    options.metadata = true;
    super.getOpsToSnapshot(collection, id, from, snapshot, options, callback);
  }
}
