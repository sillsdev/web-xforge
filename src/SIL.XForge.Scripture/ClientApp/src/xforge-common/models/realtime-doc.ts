import { RecordIdentity } from '@orbit/data';
import { merge, Observable, Subscription } from 'rxjs';
import { RealtimeDocAdapter } from '../realtime-doc-adapter';
import { RealtimeOfflineData, RealtimeOfflineStore } from '../realtime-offline-store';

export interface RealtimeDocConstructor {
  readonly TYPE: string;

  new (adapter: RealtimeDocAdapter, store: RealtimeOfflineStore): RealtimeDoc;
}

/**
 * This is the base class for all real-time data models. This class manages the interaction between offline storage of
 * the data and access to the real-time backend.
 *
 * @template T The actual data type.
 * @template Ops The operations data type.
 */
export abstract class RealtimeDoc<T = any, Ops = any> implements RecordIdentity {
  private updateOfflineDataSub: Subscription;
  private onDeleteSub: Subscription;
  private offlineSnapshotVersion: number;
  private subscribePromise: Promise<void>;

  constructor(
    public readonly type: string,
    private readonly adapter: RealtimeDocAdapter,
    private readonly store: RealtimeOfflineStore
  ) {}

  get id(): string {
    return this.adapter.id;
  }

  get data(): Readonly<T> {
    return this.adapter.data;
  }

  get subscribed(): boolean {
    return this.adapter.subscribed;
  }

  private get identity(): RecordIdentity {
    return { type: this.type, id: this.id };
  }

  /**
   * Subscribes to remote changes for the realtime data.
   * For this record, update the RealtimeDoc cache, if any, from IndexedDB.
   *
   * @returns {Promise<void>} Resolves when successfully subscribed to remote changes.
   */
  async subscribe(): Promise<void> {
    if (this.subscribePromise == null) {
      this.subscribePromise = this.subscribeToChanges();
    }
    return this.subscribePromise;
  }

  /** Fires when underlying data is recreated. */
  onCreate(): Observable<void> {
    return this.adapter.onCreate();
  }

  /**
   * Returns an observable that emits whenever any remote changes occur.
   *
   * @returns {Observable<Ops>} The remote changes observable.
   */
  remoteChanges(): Observable<Ops> {
    return this.adapter.remoteChanges();
  }

  /**
   * Submits the specified mutation operations. The operations are applied to the actual data and then submitted to the
   * realtime server. Data can only be updated using operations and should not be updated directly.
   *
   * @param {Ops} ops The operations to submit.
   * @param {*} [source] The source.
   * @returns {Promise<void>} Resolves when the operations have been successfully submitted.
   */
  async submit(ops: Ops, source?: any): Promise<void> {
    const submitPromise = this.adapter.submitOp(ops, source);
    // update offline data when the op is first submitted
    this.updateOfflineData();
    await submitPromise;
    // update again when the op has been acknowledged
    this.updateOfflineData();
  }

  /**
   * Updates offline storage with the current state of the realtime data.
   */
  updateOfflineData(): void {
    if (this.adapter.type == null || !this.adapter.subscribed) {
      return;
    }

    const pendingOps = this.adapter.pendingOps.map(op => this.prepareDataForStore(op));

    // if the snapshot hasn't changed, then don't bother to update
    if (pendingOps.length === 0 && this.adapter.version === this.offlineSnapshotVersion) {
      return;
    }

    this.offlineSnapshotVersion = this.adapter.version;
    const offlineData: RealtimeOfflineData = {
      snapshot: {
        v: this.adapter.version,
        data: this.prepareDataForStore(this.adapter.data),
        type: this.adapter.type.name
      },
      pendingOps
    };
    this.store.setItem(this.identity, offlineData);
  }

  /**
   * Unsubscribes and destroys this realtime data model.
   *
   * @returns {Promise<void>} Resolves when the data has been successfully disposed.
   */
  async dispose(): Promise<void> {
    if (this.subscribePromise != null) {
      await this.subscribePromise;
      if (this.updateOfflineData != null) {
        this.updateOfflineDataSub.unsubscribe();
      }
      if (this.onDeleteSub != null) {
        this.onDeleteSub.unsubscribe();
      }
    }
    await this.adapter.destroy();
  }

  protected prepareDataForStore(data: T): any {
    return data;
  }

  private async subscribeToChanges(): Promise<void> {
    this.updateOfflineDataSub = merge(
      this.adapter.remoteChanges(),
      this.adapter.idle(),
      this.adapter.onCreate()
    ).subscribe(() => this.updateOfflineData());
    this.onDeleteSub = this.adapter.onDelete().subscribe(() => this.store.delete(this.identity));
    await this.loadFromStore();
    const promise = this.adapter.subscribe();
    if (this.adapter.type == null) {
      await promise;
      if (this.adapter.type == null) {
        // the doc has been deleted, so remove it from the offline store
        this.store.delete(this.identity);
      }
    }
  }

  private async loadFromStore(): Promise<void> {
    if (this.adapter.type != null) {
      return;
    }
    const offlineData = await this.store.getItem(this.identity);
    if (offlineData != null) {
      if (offlineData.pendingOps.length > 0) {
        await this.adapter.fetch();
        await Promise.all(offlineData.pendingOps.map(op => this.adapter.submitOp(op)));
      } else {
        await this.adapter.ingestSnapshot(offlineData.snapshot);
        this.offlineSnapshotVersion = this.adapter.version;
      }
    }
  }
}
