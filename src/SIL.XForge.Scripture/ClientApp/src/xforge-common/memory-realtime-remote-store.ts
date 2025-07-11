import { cloneDeep, isEqual } from 'lodash-es';
import * as OTJson0 from 'ot-json0';
import { EMPTY, Subject } from 'rxjs';
import { OTType, types } from 'sharedb/lib/client';
import { Callback, LocalPresence, Presence } from 'sharedb/lib/sharedb';
import { Snapshot } from './models/snapshot';
import { performQuery, QueryParameters } from './query-parameters';
import { RealtimeDocAdapter, RealtimeQueryAdapter, RealtimeRemoteStore } from './realtime-remote-store';

/**
 * This is the memory-based implementation of the real-time remote store. It is useful for testing.
 */
export class MemoryRealtimeRemoteStore extends RealtimeRemoteStore {
  private readonly snapshots = new Map<string, Map<string, Snapshot>>();

  async init(_getAccessToken: () => Promise<string | undefined>): Promise<void> {
    // getAccessToken is not used in this memory implementation
  }

  addSnapshot<T>(collection: string, snapshot: Snapshot<T>): void {
    let collectionSnapshots = this.snapshots.get(collection);
    if (collectionSnapshots == null) {
      collectionSnapshots = new Map<string, Snapshot>();
      this.snapshots.set(collection, collectionSnapshots);
    }
    collectionSnapshots.set(snapshot.id, snapshot);
  }

  getSnapshots(collection: string): IterableIterator<Snapshot> {
    const collectionSnapshots = this.snapshots.get(collection);
    if (collectionSnapshots == null) {
      return [].values();
    }
    return collectionSnapshots.values();
  }

  clear(): void {
    this.snapshots.clear();
  }

  createDocAdapter(collection: string, id: string): RealtimeDocAdapter {
    const collectionSnapshots = this.snapshots.get(collection);
    let snapshot: Snapshot | undefined;
    if (collectionSnapshots != null) {
      snapshot = collectionSnapshots.get(id);
    }
    if (snapshot == null) {
      return new MemoryRealtimeDocAdapter(collection, id);
    }
    return new MemoryRealtimeDocAdapter(collection, id, snapshot.data, types.map[snapshot.type], snapshot.v);
  }

  createQueryAdapter(collection: string, parameters: QueryParameters): RealtimeQueryAdapter {
    return new MemoryRealtimeQueryAdapter(this, collection, parameters);
  }

  subscribeToBeforeSendOp(_listener: (collection: string, docId: string) => Promise<void>): void {}
}

/**
 * This is a memory-based implementation of the real-time document adapter interface. It is useful for unit tests.
 */
export class MemoryRealtimeDocAdapter implements RealtimeDocAdapter {
  readonly pendingOps: any[] = [];
  readonly changes$ = new Subject<any>();
  readonly remoteChanges$ = new Subject<any>();
  readonly create$ = new Subject<void>();
  readonly delete$ = new Subject<void>();
  readonly idle$ = EMPTY;
  readonly channelPresence: Presence = {
    remotePresences: {},
    subscribe: (_callback?: Callback) => {},
    unsubscribe: (_callback?: Callback) => {},
    create: (_id?: string) =>
      ({
        submit: (_value: any, _callback?: Callback) => {}
      }) as LocalPresence,
    destroy: (_callback?: Callback) => {},
    on: (_event: string, _handler: Function) => {},
    off: (_event: string, _handler: Function) => {}
  } as Presence;
  readonly docPresence: Presence = {
    remotePresences: {},
    subscribe: (_callback?: Callback) => {},
    unsubscribe: (_callback?: Callback) => {},
    create: (_id?: string) =>
      ({
        submit: (_value: any, _callback?: Callback) => {}
      }) as LocalPresence,
    destroy: (_callback?: Callback) => {},
    on: (_event: string, _handler: Function) => {},
    off: (_event: string, _handler: Function) => {}
  } as Presence;
  submitSource: boolean = false;
  subscribed: boolean = false;
  version: number = -1;
  private _previousSnapshot: Snapshot;

  constructor(
    public readonly collection: string,
    public readonly id: string,
    public data?: any,
    public type: OTType | undefined = OTJson0.type,
    version?: number
  ) {
    if (version != null) {
      this.version = version;
    } else if (this.data != null) {
      this.version = 0;
    }
    this._previousSnapshot = cloneDeep(this) as any as Snapshot;
  }

  create(data: any, type: string = OTJson0.type.name): Promise<void> {
    this.data = data;
    this.type = types.map[type];
    this.version = 0;
    this.emitCreate();
    return Promise.resolve();
  }

  fetch(): Promise<void> {
    return Promise.resolve();
  }

  ingestSnapshot(_snapshot: Snapshot): Promise<void> {
    return Promise.resolve();
  }

  subscribe(): Promise<void> {
    this.subscribed = true;
    return Promise.resolve();
  }

  submitOp(op: any, source?: any): Promise<void> {
    if (this.type == null) {
      throw new Error('The doc has not been loaded.');
    }
    this._previousSnapshot = cloneDeep(this) as any as Snapshot;

    if (op != null && this.type.normalize != null) {
      op = this.type.normalize(op);
    }
    this.data = this.type.apply(this.data, op);
    this.version++;
    this.emitChange(op);
    if (!source) {
      this.emitRemoteChange(op);
    }
    return Promise.resolve();
  }

  previousSnapshot(): Promise<Snapshot> {
    return Promise.resolve(this._previousSnapshot);
  }

  exists(): Promise<boolean> {
    return Promise.resolve(true);
  }

  delete(): Promise<void> {
    this.data = undefined;
    this.version = -1;
    this.type = undefined;
    this.emitDelete();
    return Promise.resolve();
  }

  updatePendingOps(ops: any[]): void {
    this.pendingOps.push(...ops);
  }

  destroy(): Promise<void> {
    return Promise.resolve();
  }

  emitChange(op?: any): void {
    this.changes$.next(op);
  }

  emitRemoteChange(op?: any): void {
    this.remoteChanges$.next(op);
  }

  emitCreate(): void {
    this.create$.next();
  }

  emitDelete(): void {
    this.delete$.next();
  }
}

export class MemoryRealtimeQueryAdapter implements RealtimeQueryAdapter {
  subscribed: boolean = false;
  ready: boolean = true;
  unpagedCount: number = 0;
  docIds: string[] = [];
  count: number = 0;

  readonly ready$ = new Subject<void>();
  readonly remoteChanges$ = new Subject<void>();

  constructor(
    private readonly remoteStore: MemoryRealtimeRemoteStore,
    public readonly collection: string,
    public readonly parameters: QueryParameters
  ) {}

  fetch(): Promise<void> {
    this.performQuery();
    this.ready = true;
    this.ready$.next();
    return Promise.resolve();
  }

  subscribe(_initialDocIds?: string[]): void {
    this.performQuery();
    this.subscribed = true;
    this.ready = true;
    this.ready$.next();
  }

  updateResults(): void {
    if (this.performQuery()) {
      this.remoteChanges$.next();
    }
  }

  destroy(): void {}

  private performQuery(): boolean {
    let changed = false;
    const snapshots = Array.from(this.remoteStore.getSnapshots(this.collection));
    const { results, unpagedCount } = performQuery(this.parameters, snapshots);
    let count: number;
    if (results instanceof Array) {
      const before = this.docIds;
      const after = results.map(s => s.id);
      this.docIds = after;
      if (!isEqual(before, after)) {
        changed = true;
      }
      count = results.length;
    } else {
      count = results;
    }
    if (this.count !== count) {
      this.count = count;
      changed = true;
    }
    this.unpagedCount = unpagedCount;
    return changed;
  }
}
