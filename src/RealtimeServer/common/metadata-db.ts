import ShareDB from 'sharedb';

export type DBConstructor<T extends ShareDB.DB = ShareDB.DB> = new (...args: any[]) => T;

/**
 * This mixin extends ShareDB database adapters to return metadata when retrieving ops.
 */
export function MetadataDB<T extends DBConstructor>(Base: T): T {
  return class extends Base {
    getOpsToSnapshot(
      collection: string,
      id: string,
      from: number,
      snapshot: number,
      options: any,
      callback: (...args: any[]) => any
    ): void {
      options ??= {};
      options.metadata = true;
      super.getOpsToSnapshot(collection, id, from, snapshot, options, callback);
    }
  };
}
