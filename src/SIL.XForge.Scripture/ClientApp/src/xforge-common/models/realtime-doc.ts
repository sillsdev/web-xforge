import { merge, Observable, Subject, Subscription } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RealtimeService } from 'xforge-common/realtime.service';
import { RealtimeDocAdapter } from '../realtime-remote-store';
import { RealtimeOfflineData } from './realtime-offline-data';

export interface RealtimeDocConstructor {
  readonly COLLECTION: string;
  readonly INDEX_PATHS: string[];

  new (realtimeService: RealtimeService, adapter: RealtimeDocAdapter): RealtimeDoc;
}

/**
 * This is the base class for all real-time data models. This class manages the interaction between offline storage of
 * the data and access to the real-time backend.
 *
 * @template T The actual data type.
 * @template Ops The operations data type.
 */
export abstract class RealtimeDoc<T = any, Ops = any> {
  private readonly updateOfflineDataSub: Subscription;
  private readonly onDeleteSub: Subscription;
  private readonly saveNotificationSub: Subscription;
  private offlineSnapshotVersion?: number;
  private subscribePromise?: Promise<void>;
  private localDelete$ = new Subject<void>();
  private _delete$: Observable<void>;
  private subscribedState: boolean = false;
  private subscribeQueryCount: number = 0;
  private loadOfflineDataPromise?: Promise<void>;

  constructor(protected readonly realtimeService: RealtimeService, public readonly adapter: RealtimeDocAdapter) {
    this._delete$ = merge(this.localDelete$, this.adapter.delete$);
    this.updateOfflineDataSub = merge(this.adapter.remoteChanges$, this.adapter.idle$, this.adapter.create$).subscribe(
      async () => {
        if (this.subscribePromise != null) {
          await this.subscribePromise;
        }
        this.updateOfflineData();
      }
    );
    this.onDeleteSub = this.adapter.delete$.subscribe(() => this.onDelete());
    this.saveNotificationSub = merge(
      this.adapter.beforeOp$.pipe(tap(() => this.realtimeService.saveStatusService.startedSavingDocOnline(this.id))),
      this.adapter.idle$.pipe(tap(() => this.realtimeService.saveStatusService.finishedSavingDocOnline(this.id)))
    ).subscribe();
  }

  get id(): string {
    return this.adapter.id;
  }

  get data(): Readonly<T | undefined> {
    return this.adapter.data;
  }

  get isLoaded(): boolean {
    return this.adapter.type != null;
  }

  get subscribed(): boolean {
    return this.subscribedState || this.subscribeQueryCount > 0;
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
    // update offline data when the op has been acknowledged
    this.adapter.submitOp(ops, source).then(() => this.updateOfflineData());
    // update offline data when the op is first submitted
    await this.updateOfflineData();
    await this.realtimeService.onLocalDocUpdate(this);
  }

  async create(data: T): Promise<void> {
    this.adapter.create(data).then(() => this.updateOfflineData(true));
    this.loadOfflineDataPromise = Promise.resolve();
    await this.updateOfflineData(true);
    await this.realtimeService.onLocalDocUpdate(this);
  }

  async delete(): Promise<void> {
    this.adapter.delete();
    await this.updateOfflineData();
    await this.realtimeService.onLocalDocUpdate(this);
  }

  async onAddedToSubscribeQuery(): Promise<void> {
    this.subscribeQueryCount++;
    await this.loadOfflineData();
    this.updateOfflineData();
    await this.onSubscribe();
  }

  onRemovedFromSubscribeQuery(): void {
    this.updateOfflineData();
    this.subscribeQueryCount--;
    if (this.isLoaded) {
      this.checkExists();
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
    this.saveNotificationSub.unsubscribe();
    await this.adapter.destroy();
    this.subscribedState = false;
    await this.realtimeService.onLocalDocDispose(this);
  }

  protected prepareDataForStore(data: T): any {
    return data;
  }

  protected async onDelete(): Promise<void> {
    await this.realtimeService.offlineStore.delete(this.collection, this.id);
    this.loadOfflineDataPromise = undefined;
  }

  /**
   * This method is called when the doc is subscribed. It can be overridden to provide custom behavior on subscription.
   */
  protected onSubscribe(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Updates offline storage with the current state of the realtime data.
   *
   * @param {boolean} [force=false] Indicates whether force the update to occur even if not subscribed.
   */
  protected async updateOfflineData(force: boolean = false): Promise<void> {
    if (this.adapter.type == null) {
      return;
    }

    if (!force && !this.subscribed) {
      return;
    }

    // if the snapshot hasn't changed, then don't bother to update
    if (this.adapter.pendingOps.length === 0 && this.adapter.version === this.offlineSnapshotVersion) {
      return;
    }

    const pendingOps = this.adapter.pendingOps
      .filter(opInfo => opInfo.op != null)
      .map(opInfo => this.prepareDataForStore(opInfo.op));

    this.offlineSnapshotVersion = this.adapter.version;
    const offlineData: RealtimeOfflineData = {
      id: this.id,
      v: this.adapter.version,
      data: this.prepareDataForStore(this.adapter.data),
      type: this.adapter.type.name,
      pendingOps
    };
    this.realtimeService.saveStatusService.startedSavingDocOffline(this.id);
    await this.realtimeService.offlineStore.put(this.collection, offlineData).finally(() => {
      if (this.adapter.version === this.offlineSnapshotVersion) {
        this.realtimeService.saveStatusService.finishedSavingDocOffline(this.id);
      }
    });
  }

  private async loadOfflineData(): Promise<void> {
    if (this.loadOfflineDataPromise == null) {
      this.loadOfflineDataPromise = this.loadFromOfflineStore();
    }
    return this.loadOfflineDataPromise;
  }

  private async loadFromOfflineStore(): Promise<void> {
    const offlineData = await this.realtimeService.offlineStore.get<RealtimeOfflineData>(this.collection, this.id);
    if (offlineData != null) {
      if (offlineData.v == null) {
        this.adapter.create(offlineData.data, offlineData.type).then(() => this.updateOfflineData(true));
      } else {
        await this.adapter.ingestSnapshot(offlineData);
        this.offlineSnapshotVersion = this.adapter.version;
        this.adapter.updatePendingOps(offlineData.pendingOps);
      }
    }
  }

  private async subscribeToChanges(): Promise<void> {
    await this.loadOfflineData();
    const promise = this.adapter.subscribe().then(() => (this.subscribedState = this.adapter.subscribed));
    if (this.isLoaded) {
      this.checkExists();
    } else {
      await promise;
    }
    await this.onSubscribe();
  }

  private async checkExists(): Promise<void> {
    if (!(await this.adapter.exists())) {
      this.onDelete();
      this.localDelete$.next();
    }
  }
}
