import { merge, Observable, Subject, Subscription } from 'rxjs';
import { Presence } from 'sharedb/lib/sharedb';
import { RealtimeService } from 'xforge-common/realtime.service';
import { PresenceData } from '../../app/shared/text/text.component';
import { RealtimeDocAdapter } from '../realtime-remote-store';
import { IDestroyRef } from '../utils';
import { RealtimeOfflineData } from './realtime-offline-data';
import { Snapshot } from './snapshot';

export interface RealtimeDocConstructor {
  readonly COLLECTION: string;

  // string is the legacy one column index format, the associative array corresponds to MongoDB's IndexSpecification
  readonly INDEX_PATHS: (string | { [x: string]: number | string })[];

  new (realtimeService: RealtimeService, adapter: RealtimeDocAdapter): RealtimeDoc;
}

/**
 * Represents information about the subscriber to a realtime document.
 *
 * This includes:
 * - The context in which the subscription was created (e.g. component name). This is used for debugging purposes.
 * - A flag indicating whether the subscriber has unsubscribed.
 *
 * In the future this class may be changed to contain a DestroyRef, callback, or some other way of signaling that the
 * subscriber has unsubscribed.
 *
 * In principle a realtime doc can be disposed once every subscriber has unsubscribed. However, some methods only need
 * a copy of a document at a point in time (e.g. checking permissions) and don't need to be notified of changes. Those
 * methods can provide a {@link FETCH_WITHOUT_SUBSCRIBE} symbol as the subscriber to indicate that they don't need to be
 * notified of changes, and the document is fetched and returned without subscribing to changes. Disposing such
 * documents when they have no subscribers would result in them being repeatedly fetched and disposed, which would be a
 * serious performance issue.
 */
export class DocSubscription {
  isUnsubscribed: boolean = false;

  /**
   * Creates a new DocSubscription.
   * @param callerContext A description of the context in which the subscription was created (e.g. component name).
   */
  constructor(
    readonly callerContext: string,
    destroyRef?: IDestroyRef
  ) {
    if (destroyRef != null) {
      destroyRef.onDestroy(() => (this.isUnsubscribed = true));
    }
  }

  /**
   * Creates a new DocSubscription that represents an unknown subscriber (a temporary solution to track subscribers
   * that don't yet provide a DestroyRef).
   */
  static UnknownSubscriber = new DocSubscription('UnknownSubscriber');
}

/**
 * An alternative to a {@link DocSubscription} indicating that the document should be fetched and returned without being
 * subscribed to. */
export const FETCH_WITHOUT_SUBSCRIBE = Symbol('FETCH_WITHOUT_SUBSCRIBE');

export type DocSubscriberInfo = DocSubscription | typeof FETCH_WITHOUT_SUBSCRIBE;

/**
 * This is the base class for all real-time data models. This class manages the interaction between offline storage of
 * the data and access to the real-time backend.
 *
 * @template T The actual data type.
 * @template Ops The operations data type.
 * @template P The presence data type.
 */
export abstract class RealtimeDoc<T = any, Ops = any, P = any> {
  private updateOfflineDataSub: Subscription;
  private onDeleteSub: Subscription;
  private offlineSnapshotVersion?: number;
  private subscribePromise?: Promise<void>;
  private localDelete$ = new Subject<void>();
  private _delete$: Observable<void>;
  private subscribedState: boolean = false;
  private subscribeQueryCount: number = 0;
  private loadOfflineDataPromise?: Promise<void>;
  docSubscriptions: DocSubscription[] = [];

  constructor(
    protected readonly realtimeService: RealtimeService,
    public readonly adapter: RealtimeDocAdapter
  ) {
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

  get subscriberCount(): number {
    return this.subscribeQueryCount;
  }

  get collection(): string {
    return this.adapter.collection;
  }

  get channelPresence(): Presence<PresenceData> {
    return this.adapter.channelPresence;
  }

  get docPresence(): Presence<P> {
    return this.adapter.docPresence;
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

  get changes$(): Observable<Ops> {
    return this.adapter.changes$;
  }

  /**
   * Subscribes to remote changes for the realtime data.
   * For this record, update the RealtimeDoc cache, if any, from IndexedDB.
   *
   * @returns {Promise<void>} Resolves when successfully subscribed to remote changes.
   */
  async subscribe(): Promise<void> {
    this.subscribePromise ??= this.subscribeToChanges();
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
   * @param {*} [source] The source. In practice, `true` (the default) specifies that the op should be
   * to considered to have originated locally, rather than `false` to specify remotely.
   * This can also be set to a value that is passed to the server if `adapter.submitSource` is `true`.
   * @returns {Promise<void>} Resolves when the operations have been successfully submitted.
   */
  async submit(ops: Ops, source?: any): Promise<void> {
    // update offline data when the op has been acknowledged
    this.adapter.submitOp(ops, source).then(() => this.updateOfflineData());
    // update offline data when the op is first submitted
    await this.updateOfflineData();
    await this.realtimeService.onLocalDocUpdate(this);
  }

  async create(data: T, type?: string): Promise<void> {
    this.adapter.create(data, type).then(() => this.updateOfflineData(true));
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

  previousSnapshot(): Promise<Snapshot<T>> {
    return this.adapter.previousSnapshot();
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
    this.subscribedState = false;
    await this.realtimeService.onLocalDocDispose(this);
  }

  addSubscriber(docSubscription: DocSubscription): void {
    this.docSubscriptions.push(docSubscription);
  }

  get docSubscriptionsCount(): number {
    return this.docSubscriptions.length;
  }

  get activeDocSubscriptionsCount(): number {
    let count = 0;
    for (const docSubscription of this.docSubscriptions) {
      if (!docSubscription.isUnsubscribed) count++;
    }
    return count;
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
  async updateOfflineData(force: boolean = false): Promise<void> {
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
      .map(opInfo => {
        const data = { op: this.prepareDataForStore(opInfo.op) };
        if (opInfo.hasOwnProperty('src')) data['src'] = opInfo.src;
        if (opInfo.hasOwnProperty('seq')) data['seq'] = opInfo.seq;
        if (opInfo.hasOwnProperty('source')) data['source'] = opInfo.source;
        return data;
      });

    this.offlineSnapshotVersion = this.adapter.version;
    const offlineData: RealtimeOfflineData = {
      id: this.id,
      v: this.adapter.version,
      data: this.prepareDataForStore(this.adapter.data),
      type: this.adapter.type.name,
      pendingOps
    };
    await this.realtimeService.offlineStore.put(this.collection, offlineData);
  }

  private async loadOfflineData(): Promise<void> {
    this.loadOfflineDataPromise ??= this.loadFromOfflineStore();
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
