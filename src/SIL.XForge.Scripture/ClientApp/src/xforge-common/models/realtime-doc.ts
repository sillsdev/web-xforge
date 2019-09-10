import { merge, Observable, Subject, Subscription } from 'rxjs';
import { RealtimeOfflineData, RealtimeOfflineStore } from '../realtime-offline-store';
import { RealtimeDocAdapter } from '../realtime-remote-store';

export interface RealtimeDocConstructor {
  readonly COLLECTION: string;

  new (store: RealtimeOfflineStore, adapter: RealtimeDocAdapter): RealtimeDoc;
}

/**
 * This is the base class for all real-time data models. This class manages the interaction between offline storage of
 * the data and access to the real-time backend.
 *
 * @template T The actual data type.
 * @template Ops The operations data type.
 */
export abstract class RealtimeDoc<T = any, Ops = any> {
  private updateOfflineDataSub: Subscription;
  private onDeleteSub: Subscription;
  private offlineSnapshotVersion: number;
  private subscribePromise: Promise<void>;
  private localDelete$ = new Subject<void>();
  private _delete$: Observable<void>;
  private subscribeQueryCount: number = 0;

  constructor(protected readonly store: RealtimeOfflineStore, public readonly adapter: RealtimeDocAdapter) {
    this._delete$ = merge(this.localDelete$, this.adapter.delete$);
    this.updateOfflineDataSub = merge(this.adapter.remoteChanges$, this.adapter.idle$, this.adapter.create$).subscribe(
      () => this.updateOfflineData()
    );
    this.onDeleteSub = this.adapter.delete$.subscribe(() => this.onDelete());
  }

  get id(): string {
    return this.adapter.id;
  }

  get data(): Readonly<T> {
    return this.adapter.data;
  }

  get isLoaded(): boolean {
    return this.adapter.type != null;
  }

  get subscribed(): boolean {
    return this.adapter.subscribed || this.subscribeQueryCount > 0;
  }

  get collection(): string {
    return this.adapter.collection;
  }

  /** Fires when underlying data is recreated. */
  get create$(): Observable<void> {
    return this.adapter.create$;
  }

  get delete$(): Observable<void> {
    return this._delete$;
  }

  /**
   * Returns an observable that emits whenever any remote changes occur.
   *
   * @returns {Observable<Ops>} The remote changes observable.
   */
  get remoteChanges$(): Observable<Ops> {
    return this.adapter.remoteChanges$;
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

  onlineFetch(): Promise<void> {
    return this.adapter.fetch();
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

  create(data: T): Promise<void> {
    return this.adapter.create(data);
  }

  delete(): Promise<void> {
    return this.adapter.delete();
  }

  /**
   * Updates offline storage with the current state of the realtime data.
   */
  updateOfflineData(): void {
    if (!this.isLoaded || !this.subscribed) {
      return;
    }

    const pendingOps = this.adapter.pendingOps.map(op => this.prepareDataForStore(op));

    // if the snapshot hasn't changed, then don't bother to update
    if (pendingOps.length === 0 && this.adapter.version === this.offlineSnapshotVersion) {
      return;
    }

    this.offlineSnapshotVersion = this.adapter.version;
    const offlineData: RealtimeOfflineData = {
      id: this.id,
      v: this.adapter.version,
      data: this.prepareDataForStore(this.adapter.data),
      type: this.adapter.type.name,
      pendingOps
    };
    this.store.put(this.collection, offlineData);
  }

  async loadFromStore(): Promise<void> {
    if (this.isLoaded) {
      return;
    }
    const offlineData = await this.store.get(this.collection, this.id);
    if (offlineData != null) {
      if (offlineData.pendingOps.length > 0) {
        await this.adapter.fetch();
        await Promise.all(offlineData.pendingOps.map(op => this.adapter.submitOp(op)));
      } else {
        await this.adapter.ingestSnapshot(offlineData);
        this.offlineSnapshotVersion = this.adapter.version;
      }
    }
  }

  addedToSubscribeQuery(): void {
    this.subscribeQueryCount++;
    this.updateOfflineData();
  }

  removedFromSubscribeQuery(): void {
    this.updateOfflineData();
    this.subscribeQueryCount--;
  }

  async checkExists(): Promise<void> {
    if (!(await this.adapter.exists())) {
      this.onDelete();
      this.localDelete$.next();
    }
  }

  /**
   * Unsubscribes and destroys this realtime data model.
   *
   * @returns {Promise<void>} Resolves when the data has been successfully disposed.
   */
  async dispose(): Promise<void> {
    if (this.subscribePromise != null) {
      await this.subscribePromise;
    }
    this.updateOfflineDataSub.unsubscribe();
    this.onDeleteSub.unsubscribe();
    await this.adapter.destroy();
  }

  protected prepareDataForStore(data: T): any {
    return data;
  }

  protected onDelete(): void {
    this.store.delete(this.collection, this.id);
  }

  private async subscribeToChanges(): Promise<void> {
    await this.loadFromStore();
    const promise = this.adapter.subscribe();
    if (this.isLoaded) {
      this.checkExists();
    } else {
      await promise;
    }
  }
}
