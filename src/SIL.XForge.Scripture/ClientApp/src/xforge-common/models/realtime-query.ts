import arrayDiff, { InsertDiff, MoveDiff, RemoveDiff } from 'arraydiff';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { RealtimeQueryAdapter } from '../realtime-remote-store';
import { RealtimeService } from '../realtime.service';
import { RealtimeDoc } from './realtime-doc';

/**
 * This class represents a real-time query. If the query has been subscribed to, then the "remoteChanges$" observable
 * will emit on any remote changes to the query results.
 */
export class RealtimeQuery<T extends RealtimeDoc = RealtimeDoc> {
  private _docs: T[] = [];
  private beingDisposed = new Subject<void>();
  private _count: number = 0;
  private _unpagedCount: number = 0;
  private isDisposed = false;
  private readonly _localChanges$ = new Subject<void>();
  private readonly _remoteChanges$ = new Subject<void>();
  private readonly _ready$ = new BehaviorSubject<boolean>(false);
  private readonly docSubscriptions = new Map<string, Subscription>();
  private readonly _remoteDocChanges$ = new Subject<any>();
  private readonly _docs$ = new BehaviorSubject<T[]>([]);

  /**
   * @param {string} name Descriptive text of the context in which this query was created, for investigating disposal
   * issues.
   */
  constructor(
    private readonly realtimeService: RealtimeService,
    public readonly adapter: RealtimeQueryAdapter,
    public readonly name: string
  ) {
    this.adapter.ready$.pipe(takeUntil(this.beingDisposed)).subscribe(() => this.onReady());
    this.adapter.remoteChanges$
      .pipe(takeUntil(this.beingDisposed))
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

    this.beingDisposed.next();
    this.beingDisposed.complete();
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
      count = docIds.length;
    } else {
      count = results;
    }
    await this.onChange(false, docIds, count, unpagedCount);
    return docIds;
  }

  private async onReady(): Promise<void> {
    if (this.subscribed) {
      await this.onChange(true, this.adapter.docIds, this.adapter.count, this.adapter.unpagedCount);
      this._ready$.next(true);
    } else {
      this._docs = await Promise.all<T>(
        this.adapter.docIds.map(id =>
          this.realtimeService.get(
            this.collection,
            id,
            new DocSubscription(`RealtimeQuery/${this.name}`, this.beingDisposed)
          )
        )
      );
      this._count = this.adapter.count;
      this._unpagedCount = this.adapter.unpagedCount;
    }
  }

  private async onChange(
    emitRemoteChanges: boolean,
    docIds: string[] | undefined,
    count: number,
    unpagedCount: number
  ): Promise<void> {
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
            this.onRemove(removeDiff.index, before.slice(removeDiff.index, removeDiff.index + removeDiff.howMany));
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
      const newDoc = await this.realtimeService.get<T>(
        this.collection,
        docId,
        new DocSubscription(`RealtimeQuery/${this.name}`, this.beingDisposed)
      );
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

  private onRemove(index: number, docIds: string[]): void {
    const removedDocs = this._docs.splice(index, docIds.length);
    for (const doc of removedDocs) {
      doc.onRemovedFromSubscribeQuery();
      const subscription = this.docSubscriptions.get(doc.id);
      if (subscription != null) {
        subscription.unsubscribe();
      }
      this.docSubscriptions.delete(doc.id);
    }
  }

  private onMove(from: number, to: number, length: number): void {
    const removedDocs = this._docs.splice(from, length);
    this._docs.splice(to, 0, ...removedDocs);
  }
}
