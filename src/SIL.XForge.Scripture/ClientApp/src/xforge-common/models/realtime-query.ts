import arrayDiff, { InsertDiff, MoveDiff, RemoveDiff } from 'arraydiff';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { performQuery, QueryParameters } from '../query-parameters';
import { RealtimeQueryAdapter } from '../realtime-remote-store';
import { RealtimeService } from '../realtime.service';
import { RealtimeDoc } from './realtime-doc';

/**
 * This class represents a real-time query. If the query has been subscribed to, then the "remoteChanges$" observable
 * will emit on any remote changes to the query results.
 */
export class RealtimeQuery<T extends RealtimeDoc = RealtimeDoc> {
  private _docs: T[] = [];
  private unsubscribe$ = new Subject<void>();
  private changeLock?: Promise<void>;
  private latestChangeId: number = 0;
  private _count: number = 0;
  private _unpagedCount: number = 0;
  private isDisposed = false;
  private readonly _localChanges$ = new Subject<void>();
  private readonly _remoteChanges$ = new Subject<void>();
  private readonly _ready$ = new BehaviorSubject<boolean>(false);
  private readonly docSubscriptions = new Map<string, Subscription>();
  private readonly _remoteDocChanges$ = new Subject<any>();
  private readonly _docs$ = new BehaviorSubject<T[]>([]);

  constructor(
    private readonly realtimeService: RealtimeService,
    public readonly adapter: RealtimeQueryAdapter
  ) {
    this.adapter.ready$.pipe(takeUntil(this.unsubscribe$)).subscribe(() => this.onReady());
    this.adapter.remoteChanges$
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe(() => this.onChange(true, this.adapter.docIds, this.adapter.count, this.adapter.unpagedCount));
  }

  get collection(): string {
    return this.adapter.collection;
  }

  get subscribed(): boolean {
    return this.adapter.subscribed;
  }

  get docs(): Readonly<T[]> {
    return this._docs;
  }

  /**
   * Observable for the docs that match the query. Emits whenever a doc is added or removed from the results, or one of
   * the docs is modified.
   */
  get docs$(): Observable<Readonly<T[]>> {
    return this._docs$;
  }

  get count(): number {
    return this._count;
  }

  get unpagedCount(): number {
    return this._unpagedCount;
  }

  get localChanges$(): Observable<void> {
    return this._localChanges$;
  }

  get remoteChanges$(): Observable<void> {
    return this._remoteChanges$;
  }

  get ready$(): Observable<boolean> {
    return this._ready$;
  }

  /** Emitted when a document in the query results is changed remotely. Note that because remote document changes, and
   * remote query results changes, are not announced or applied in sync, `docs` might not be up-to-date when
   * `remoteDocChanges$` is emitted.
   */
  get remoteDocChanges$(): Observable<any> {
    return this._remoteDocChanges$.asObservable();
  }

  get ready(): boolean {
    return this.adapter.ready;
  }

  fetch(): Promise<void> {
    return this.adapter.fetch();
  }

  async subscribe(): Promise<void> {
    const docIds = await this.localQuery();
    this.adapter.subscribe(docIds);
    this.realtimeService.onQuerySubscribe(this);
  }

  dispose(): void {
    // Ensure dispose is idempotent
    if (this.isDisposed) {
      return;
    }

    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    if (this.subscribed) {
      if (this.adapter.ready) {
        for (const doc of this._docs) {
          doc.onRemovedFromSubscribeQuery();
        }
      }
      this.realtimeService.onQueryUnsubscribe(this);
    }
    for (const sub of this.docSubscriptions.values()) {
      sub.unsubscribe();
    }
    this.adapter.destroy();
    this.isDisposed = true;
  }

  async localUpdate(): Promise<void> {
    if (!this.subscribed) {
      return;
    }
    await this.localQuery();
    this._localChanges$.next();
  }

  private async localQuery(): Promise<string[] | undefined> {
    const { results, unpagedCount } = await this.realtimeService.offlineStore.query(
      this.collection,
      this.adapter.parameters
    );
    let docIds: string[] | undefined;
    let count: number;
    if (results instanceof Array) {
      docIds = results.map(s => s.id);
      if (this.adapter.ready && this.adapter.subscribed) {
        docIds = this.reconcileWithRemote(docIds);
      }
      count = docIds.length;
    } else {
      count = results;
    }
    await this.onChange(false, docIds, count, unpagedCount);
    return docIds;
  }

  /**
   * Merges the results of a query of the offline store with the server's current results. The
   * offline store can hold stale snapshots of docs that changed on the server while this client
   * was not subscribed to them, so while the remote query is live, its membership is authoritative
   * and the local results may only diverge from it for docs with pending local ops (i.e. changes
   * the server has not acknowledged yet). Docs whose offline snapshots are thereby proven stale
   * are refreshed in the background. See doc/offline-query-membership.md.
   */
  private reconcileWithRemote(localDocIds: string[]): string[] {
    // Two differently-paged result sets cannot be meaningfully merged, so for paged queries use
    // the server's results as-is.
    if (this.adapter.parameters.$skip != null || this.adapter.parameters.$limit != null) {
      return Array.from(this.adapter.docIds);
    }

    const serverDocIds: string[] = this.adapter.docIds;
    const serverDocIdSet = new Set<string>(serverDocIds);
    const localDocIdSet = new Set<string>(localDocIds);
    const docIds: string[] = [];
    for (const docId of localDocIds) {
      const doc: T = this.realtimeService.get<T>(this.collection, docId);
      if (serverDocIdSet.has(docId) || doc.hasPendingOps) {
        docIds.push(docId);
      } else {
        // The offline snapshot matches the query, but the server excludes the doc and this client
        // has no unacknowledged changes to it, so the offline snapshot must be stale (e.g. the doc
        // was archived while this client was not subscribed to it).
        void doc.reconcileOfflineData();
      }
    }
    for (const docId of serverDocIds) {
      if (!localDocIdSet.has(docId)) {
        const doc: T = this.realtimeService.get<T>(this.collection, docId);
        if (!doc.hasPendingOps) {
          // The server includes the doc, but the offline snapshot is missing or does not match
          // the query, so the offline snapshot must be stale. The doc is appended out of sort
          // order until reconciliation refreshes the offline snapshot.
          docIds.push(docId);
          void doc.reconcileOfflineData();
        }
      }
    }
    return docIds;
  }

  private async onReady(): Promise<void> {
    if (this.subscribed) {
      await this.onChange(true, this.adapter.docIds, this.adapter.count, this.adapter.unpagedCount);
      this._ready$.next(true);
    } else {
      this._docs = this.adapter.docIds.map(id => this.realtimeService.get<T>(this.collection, id));
      this._count = this.adapter.count;
      this._unpagedCount = this.adapter.unpagedCount;
    }
  }

  /**
   * Applies a change to the query results. Changes are applied strictly one at a time: a change
   * computes its diff against the current results and applies it with index-based splices, so two
   * changes being applied concurrently (e.g. a server-driven change interleaving with a local
   * re-query at an await point) would corrupt the results. When no change is in flight, the
   * change starts synchronously so that timing is unaffected in the common non-overlapping case.
   *
   * NOTE: this must be written with async/await rather than promise method calls: ts-mockito
   * finds method names by scanning the class source, so a call to a promise's "then" method
   * anywhere in this class (even in a comment) would give mocked RealtimeQuery instances a
   * stubbed "then" method, making them thenables that never settle when awaited or passed to
   * Promise.resolve() in tests.
   */
  private onChange(
    emitRemoteChanges: boolean,
    docIds: string[] | undefined,
    count: number,
    unpagedCount: number
  ): Promise<void> {
    const change: Promise<void> =
      this.changeLock == null
        ? this.applyChange(emitRemoteChanges, docIds, count, unpagedCount)
        : this.applyChangeAfter(this.changeLock, emitRemoteChanges, docIds, count, unpagedCount);
    const changeId: number = ++this.latestChangeId;
    this.changeLock = this.releaseLockWhenDone(change, changeId);
    return change;
  }

  private async applyChangeAfter(
    lock: Promise<void>,
    emitRemoteChanges: boolean,
    docIds: string[] | undefined,
    count: number,
    unpagedCount: number
  ): Promise<void> {
    await lock;
    await this.applyChange(emitRemoteChanges, docIds, count, unpagedCount);
  }

  private async releaseLockWhenDone(change: Promise<void>, changeId: number): Promise<void> {
    try {
      await change;
    } catch {
      // A failed change is reported to the onChange() caller; the lock just needs to be released.
    }
    if (this.latestChangeId === changeId) {
      this.changeLock = undefined;
    }
  }

  private async applyChange(
    emitRemoteChanges: boolean,
    docIds: string[] | undefined,
    count: number,
    unpagedCount: number
  ): Promise<void> {
    if (this.isDisposed) {
      return;
    }
    let changed = false;
    if (this.count !== count) {
      this._count = count;
      changed = true;
    }
    if (docIds != null) {
      const before = this._docs.map(d => d.id);
      const after = docIds;
      const diffs = arrayDiff(before, after);
      for (const diff of diffs) {
        switch (diff.type) {
          case 'insert':
            const insertDiff = diff as InsertDiff;
            await this.onInsert(insertDiff.index, insertDiff.values);
            break;

          case 'remove':
            const removeDiff = diff as RemoveDiff;
            this.onRemove(
              removeDiff.index,
              before.slice(removeDiff.index, removeDiff.index + removeDiff.howMany),
              emitRemoteChanges
            );
            break;

          case 'move':
            const moveDiff = diff as MoveDiff;
            this.onMove(moveDiff.from, moveDiff.to, moveDiff.howMany);
            break;
        }
      }

      if (diffs.length > 0) {
        changed = true;
        this._docs = this._docs.slice();
      }
    }
    this._unpagedCount = unpagedCount;

    this._docs$.next(this._docs);
    if (changed && this.adapter.ready && emitRemoteChanges) {
      this._remoteChanges$.next();
    }
  }

  private async onInsert(index: number, docIds: string[]): Promise<void> {
    const newDocs: T[] = [];
    const promises: Promise<void>[] = [];
    for (const docId of docIds) {
      const newDoc = this.realtimeService.get<T>(this.collection, docId);
      promises.push(newDoc.onAddedToSubscribeQuery());
      newDocs.push(newDoc);
      const docSubscription = newDoc.remoteChanges$.subscribe(() => {
        this._remoteDocChanges$.next(newDoc);
        this._docs$.next(this._docs);
      });
      this.docSubscriptions.set(newDoc.id, docSubscription);
    }
    await Promise.all(promises);
    this._docs.splice(index, 0, ...newDocs);
  }

  private onRemove(index: number, docIds: string[], removedByServer: boolean = false): void {
    const removedDocs = this._docs.splice(index, docIds.length);
    for (const doc of removedDocs) {
      if (removedByServer && !doc.hasPendingOps && this.matchesQueryFilter(doc)) {
        // The server removed the doc from the results, yet the local copy of the doc still
        // matches the query, so the local copy (and the offline snapshot it was loaded from) must
        // be stale. Refresh it so that a later query of the offline store cannot re-add the doc.
        // See doc/offline-query-membership.md.
        void doc.reconcileOfflineData();
      }
      doc.onRemovedFromSubscribeQuery();
      const subscription = this.docSubscriptions.get(doc.id);
      if (subscription != null) {
        subscription.unsubscribe();
      }
      this.docSubscriptions.delete(doc.id);
    }
  }

  /** Checks whether the doc's current data matches this query's filter (ignoring paging/sorting). */
  private matchesQueryFilter(doc: T): boolean {
    if (doc.data == null) {
      return false;
    }
    const filter: QueryParameters = { ...this.adapter.parameters };
    delete filter.$sort;
    delete filter.$skip;
    delete filter.$limit;
    delete filter.$count;
    const { results } = performQuery(filter, [{ id: doc.id, data: doc.data }]);
    return results instanceof Array && results.length > 0;
  }

  private onMove(from: number, to: number, length: number): void {
    const removedDocs = this._docs.splice(from, length);
    this._docs.splice(to, 0, ...removedDocs);
  }
}
