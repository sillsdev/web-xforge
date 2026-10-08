import * as OTJson0 from 'ot-json0';
import ShareDB from 'sharedb';
import { Connection, Doc } from 'sharedb/lib/client';
import { StoredOp, StoredSnapshot, ShareDbDataSource, TooManyOpsToReplayError } from './gateway-data-source';
import { JSON0_TYPE_URI } from './protocol-config';

ShareDB.types.register(OTJson0.type);

describe('ShareDbDataSource', () => {
  it('reads a doc with the version of its create op, and a doc that does not exist', async () => {
    const env = new TestEnvironment();
    await env.create('doc1', { a: 1 });
    await env.submit('doc1', [{ p: ['a'], od: 1, oi: 2 }]);

    const snapshot: StoredSnapshot = await env.source.getSnapshot('things', 'doc1');
    const missing: StoredSnapshot = await env.source.getSnapshot('things', 'doc2');

    expect(snapshot).toEqual({ version: 2, type: JSON0_TYPE_URI, data: { a: 2 }, createdAtVersion: 0 });
    expect(missing).toEqual({ version: 0, type: null, data: undefined, createdAtVersion: null });
  });

  it('reads many docs at once', async () => {
    const env = new TestEnvironment();
    await env.create('doc1', { a: 1 });

    const snapshots: ReadonlyMap<string, StoredSnapshot> = await env.source.getSnapshots('things', ['doc1', 'doc2']);

    expect(snapshots.get('doc1')?.data).toEqual({ a: 1 });
    expect(snapshots.get('doc2')?.type).toBeNull();
  });

  it('reads ops, and a doc at a past version', async () => {
    const env = new TestEnvironment();
    await env.create('doc1', { a: 1 });
    await env.submit('doc1', [{ p: ['a'], od: 1, oi: 2 }]);
    await env.delete('doc1');
    await env.create('doc1', { b: 1 });

    const ops: readonly StoredOp[] = await env.source.getOps('things', 'doc1', 0, null);
    const past: StoredSnapshot = await env.source.getSnapshotAtVersion('things', 'doc1', 2);
    const recreated: StoredSnapshot = await env.source.getSnapshot('things', 'doc1');

    expect(ops).toEqual([
      { kind: 'create', edit: undefined },
      { kind: 'edit', edit: [{ p: ['a'], od: 1, oi: 2 }] },
      { kind: 'delete', edit: undefined },
      { kind: 'create', edit: undefined }
    ]);
    expect(past.data).toEqual({ a: 2 });
    expect(recreated.createdAtVersion).toEqual(3);
    await expect(env.source.getSnapshotAtVersion('things', 'doc1', 9)).rejects.toThrow();
  });

  it('rebuilds a past version from the latest milestone before it, and refuses to replay too many ops', async () => {
    // Milestones every 4 versions, and at most 3 ops replayed.
    const env = new TestEnvironment({ milestoneInterval: 4, maxReplayedOps: 3 });
    await env.create('doc1', { n: 0 });
    for (let n = 1; n <= 6; n++) {
      await env.submit('doc1', [{ p: ['n'], od: n - 1, oi: n }]);
    }
    const getOps = jest.spyOn(env.db, 'getOps');

    // Version 6 is 2 ops past the milestone at version 4.
    const past: StoredSnapshot = await env.source.getSnapshotAtVersion('things', 'doc1', 6);

    expect(past.data).toEqual({ n: 5 });
    expect(getOps).toHaveBeenCalledTimes(1);
    expect(getOps.mock.calls[0].slice(0, 4)).toEqual(['things', 'doc1', 4, 6]);

    // Version 3 has no milestone at or before it, so the rebuild would replay all 3 ops from the first: allowed. With
    // a limit of 2, it is refused before any op is read.
    getOps.mockClear();
    await expect(env.source.getSnapshotAtVersion('things', 'doc1', 3)).resolves.toBeDefined();
    const strict = new TestEnvironment({ maxReplayedOps: 2, backend: env.backend });
    await expect(strict.source.getSnapshotAtVersion('things', 'doc1', 3)).rejects.toBeInstanceOf(
      TooManyOpsToReplayError
    );
    await expect(strict.source.getOps('things', 'doc1', 0, 3)).rejects.toBeInstanceOf(TooManyOpsToReplayError);
    expect(getOps).toHaveBeenCalledTimes(1);
  });
});

/** A ShareDB backend on an in-memory database, with milestones if an interval is given. */
class TestEnvironment {
  readonly backend: ShareDB;
  readonly db: any;
  readonly source: ShareDbDataSource;
  private readonly connection: Connection;

  constructor({
    milestoneInterval,
    maxReplayedOps,
    backend
  }: { milestoneInterval?: number; maxReplayedOps?: number; backend?: ShareDB } = {}) {
    this.backend =
      backend ??
      new ShareDB(
        milestoneInterval == null
          ? {}
          : { milestoneDb: new (ShareDB as any).MemoryMilestoneDB({ interval: milestoneInterval }) }
      );
    this.db = (this.backend as any).db;
    this.source = new ShareDbDataSource(
      {
        db: this.db,
        milestoneDb: this.backend.milestoneDb,
        _buildSnapshotFromOps: this.backend._buildSnapshotFromOps.bind(this.backend)
      },
      maxReplayedOps
    );
    this.connection = this.backend.connect();
  }

  create(id: string, data: unknown): Promise<void> {
    const doc: Doc = this.connection.get('things', id);
    return new Promise<void>((resolve, reject) =>
      doc.fetch(() => doc.create(data, (err: unknown) => (err == null ? resolve() : reject(err))))
    );
  }

  submit(id: string, op: unknown): Promise<void> {
    const doc: Doc = this.connection.get('things', id);
    return new Promise<void>((resolve, reject) =>
      doc.fetch(() => doc.submitOp(op as any, {}, (err: unknown) => (err == null ? resolve() : reject(err))))
    );
  }

  delete(id: string): Promise<void> {
    const doc: Doc = this.connection.get('things', id);
    return new Promise<void>((resolve, reject) =>
      doc.fetch(() => doc.del({}, (err: unknown) => (err == null ? resolve() : reject(err))))
    );
  }
}
