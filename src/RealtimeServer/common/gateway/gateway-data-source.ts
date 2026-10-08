import ShareDB from 'sharedb';
import { hasOwnProp, isObj } from '../utils/type-utils';

/**
 * Reads docs and ops for the gateway's access decisions straight from ShareDB's database adapter. Nothing here passes
 * through ShareDB middleware, so the server's own access rules and the measuring middleware never see these reads,
 * and a projection is never applied: callers always get the stored doc of the collection they name.
 */

/** A doc as stored, or the record of a doc that does not exist (`type` null). */
export interface StoredSnapshot {
  /** The version the doc is at: the number of ops ever applied to it. 0 for a doc that never existed. */
  readonly version: number;
  /** The doc's OT type URI, or null when the doc does not exist (never created, or deleted). */
  readonly type: string | null;
  /** The doc's data, or undefined when the doc does not exist. */
  readonly data: unknown;
  /**
   * The version of the op that created the doc as it exists now, from the doc's metadata. null when the doc does not
   * exist, or when its metadata does not say (docs created before ShareDB started recording it).
   */
  readonly createdAtVersion: number | null;
}

/** What kind of change one stored op made. */
export type StoredOpKind = 'create' | 'edit' | 'delete';

/** A stored op: what kind of change it made, and for an edit, the change as stored (the `op` of a ShareDB op). */
export interface StoredOp {
  readonly kind: StoredOpKind;
  /** The edit's change, such as json0 components; undefined for a create or delete. */
  readonly edit: unknown;
}

/**
 * The most ops replayed to rebuild a doc at a past version. A rebuild starts from the latest milestone snapshot at or
 * before the version (ShareDB keeps milestones only for some collections), or from the doc's first op; a rebuild that
 * would replay more ops than this is refused, because each one is read and applied while the process waits.
 */
export const MAX_REPLAYED_OPS = 10_000;

/** Why a rebuild at a past version was refused: it would replay more than MAX_REPLAYED_OPS ops. */
export class TooManyOpsToReplayError extends Error {
  constructor(collection: string, docId: string, version: number, replayed: number) {
    super(`Rebuilding ${collection}/${docId} at version ${version} would replay ${replayed} ops.`);
    this.name = 'TooManyOpsToReplayError';
  }
}

/** Where the gateway reads stored docs and ops. */
export interface GatewayDataSource {
  /**
   * The current doc. With `fields`, only those top-level fields of the data are read (a database adapter may return
   * more).
   */
  getSnapshot(collection: string, docId: string, fields?: readonly string[]): Promise<StoredSnapshot>;
  /** The current docs with these ids, by id (see getSnapshot). Every id is in the result. */
  getSnapshots(
    collection: string,
    docIds: readonly string[],
    fields?: readonly string[]
  ): Promise<ReadonlyMap<string, StoredSnapshot>>;
  /**
   * The doc as it was at `version`, rebuilt from the latest milestone snapshot before it and the ops since, as ShareDB
   * rebuilds it for a client. Rejects when the doc never reached that version, and with TooManyOpsToReplayError when
   * the rebuild would replay too many ops.
   */
  getSnapshotAtVersion(collection: string, docId: string, version: number): Promise<StoredSnapshot>;
  /**
   * The stored ops from `from` (inclusive) up to `to` (exclusive), or to the current version when `to` is null.
   * Rejects with TooManyOpsToReplayError, without reading them, when `to` is a number and there are more than
   * MAX_REPLAYED_OPS.
   */
  getOps(collection: string, docId: string, from: number, to: number | null): Promise<readonly StoredOp[]>;
}

/** What ShareDbDataSource uses of a ShareDB backend, such as the RealtimeServer. */
export type DataSourceBackend = Pick<ShareDB, '_buildSnapshotFromOps' | 'milestoneDb'> & { readonly db: ShareDB.DB };

/** Reads from a ShareDB backend's database adapter, bypassing middleware. */
export class ShareDbDataSource implements GatewayDataSource {
  constructor(
    private readonly backend: DataSourceBackend,
    private readonly maxReplayedOps: number = MAX_REPLAYED_OPS
  ) {}

  getSnapshot(collection: string, docId: string, fields?: readonly string[]): Promise<StoredSnapshot> {
    const fieldMap: Record<string, true> | null = fields == null ? null : toFieldMap(fields);
    return new Promise<StoredSnapshot>((resolve, reject) => {
      // Metadata is read for `_create`, which says when the current doc was created.
      this.backend.db.getSnapshot(collection, docId, fieldMap, { metadata: true }, (error: unknown, raw: unknown) => {
        if (error != null) {
          reject(error);
          return;
        }
        const snapshot: StoredSnapshot | undefined = toStoredSnapshot(raw);
        if (snapshot == null) {
          reject(new Error(`The database returned an unreadable snapshot for ${collection}/${docId}.`));
          return;
        }
        resolve(snapshot);
      });
    });
  }

  getSnapshots(
    collection: string,
    docIds: readonly string[],
    fields?: readonly string[]
  ): Promise<ReadonlyMap<string, StoredSnapshot>> {
    const fieldMap: Record<string, true> | null = fields == null ? null : toFieldMap(fields);
    return new Promise<ReadonlyMap<string, StoredSnapshot>>((resolve, reject) => {
      this.backend.db.getSnapshotBulk(
        collection,
        [...docIds],
        fieldMap,
        { metadata: true },
        (error: unknown, raw: unknown) => {
          if (error != null) {
            reject(error);
            return;
          }
          const snapshots = new Map<string, StoredSnapshot>();
          for (const docId of docIds) {
            const snapshot: StoredSnapshot | undefined = hasOwnProp(raw, docId)
              ? toStoredSnapshot(raw[docId])
              : undefined;
            if (snapshot == null) {
              reject(new Error(`The database returned no readable snapshot for ${collection}/${docId}.`));
              return;
            }
            snapshots.set(docId, snapshot);
          }
          resolve(snapshots);
        }
      );
    });
  }

  getSnapshotAtVersion(collection: string, docId: string, version: number): Promise<StoredSnapshot> {
    return new Promise<StoredSnapshot>((resolve, reject) => {
      // The same reads as ShareDB's own rebuild (Backend._fetchSnapshot), without its middleware, and refused before
      // any op is read when there would be too many to replay.
      this.backend.milestoneDb.getMilestoneSnapshot(
        collection,
        docId,
        version,
        (milestoneError: unknown, milestone?: ShareDB.Snapshot | null) => {
          if (milestoneError != null) {
            reject(milestoneError);
            return;
          }
          const from: number = milestone == null ? 0 : milestone.v;
          if (!Number.isSafeInteger(from) || from > version) {
            reject(new Error(`The milestone of ${collection}/${docId} at version ${version} is unreadable.`));
            return;
          }
          if (version - from > this.maxReplayedOps) {
            reject(new TooManyOpsToReplayError(collection, docId, version, version - from));
            return;
          }
          this.backend.db.getOps(collection, docId, from, version, null, (error: unknown, ops: unknown) => {
            if (error != null) {
              reject(error);
              return;
            }
            if (!Array.isArray(ops)) {
              reject(new Error(`The database returned unreadable ops for ${collection}/${docId}.`));
              return;
            }
            this.backend._buildSnapshotFromOps(
              docId,
              milestone ?? undefined,
              ops,
              (buildError: unknown, raw: unknown) => {
                if (buildError != null) {
                  reject(buildError);
                  return;
                }
                const snapshot: StoredSnapshot | undefined = toStoredSnapshot(raw);
                if (snapshot == null || snapshot.version !== version) {
                  reject(new Error(`${collection}/${docId} never reached version ${version}.`));
                  return;
                }
                resolve(snapshot);
              }
            );
          });
        }
      );
    });
  }

  getOps(collection: string, docId: string, from: number, to: number | null): Promise<readonly StoredOp[]> {
    if (to != null && to - from > this.maxReplayedOps) {
      return Promise.reject(new TooManyOpsToReplayError(collection, docId, to, to - from));
    }
    return new Promise<readonly StoredOp[]>((resolve, reject) => {
      this.backend.db.getOps(collection, docId, from, to, null, (error: unknown, ops: unknown) => {
        if (error != null) {
          reject(error);
          return;
        }
        if (!Array.isArray(ops)) {
          reject(new Error(`The database returned unreadable ops for ${collection}/${docId}.`));
          return;
        }
        resolve(ops.map(toStoredOp));
      });
    });
  }
}

function toFieldMap(fields: readonly string[]): Record<string, true> {
  const fieldMap: Record<string, true> = {};
  for (const field of fields) {
    fieldMap[field] = true;
  }
  return fieldMap;
}

function toStoredSnapshot(raw: unknown): StoredSnapshot | undefined {
  if (!isObj(raw) || !hasOwnProp(raw, 'v') || typeof raw.v !== 'number' || !Number.isSafeInteger(raw.v)) {
    return undefined;
  }
  const type: unknown = hasOwnProp(raw, 'type') ? raw.type : null;
  if (type != null && typeof type !== 'string') {
    return undefined;
  }
  if (type == null) {
    return { version: raw.v, type: null, data: undefined, createdAtVersion: null };
  }
  return {
    version: raw.v,
    type: type,
    data: hasOwnProp(raw, 'data') ? raw.data : undefined,
    createdAtVersion: createdAtVersionOf(raw)
  };
}

/** The version of the create op recorded in a snapshot's metadata (`m._create.v`), if it is recorded. */
function createdAtVersionOf(raw: object): number | null {
  const metadata: unknown = hasOwnProp(raw, 'm') ? raw.m : undefined;
  const create: unknown = hasOwnProp(metadata, '_create') ? metadata._create : undefined;
  const version: unknown = hasOwnProp(create, 'v') ? create.v : undefined;
  return typeof version === 'number' && Number.isSafeInteger(version) && version >= 0 ? version : null;
}

function toStoredOp(op: unknown): StoredOp {
  if (hasOwnProp(op, 'create') && op.create != null) {
    return { kind: 'create', edit: undefined };
  }
  if (hasOwnProp(op, 'del') && op.del != null && op.del !== false) {
    return { kind: 'delete', edit: undefined };
  }
  return { kind: 'edit', edit: hasOwnProp(op, 'op') ? op.op : undefined };
}
