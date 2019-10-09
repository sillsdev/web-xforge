import arrayDiff, { InsertDiff, MoveDiff, RemoveDiff } from 'arraydiff';
import { Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { performQuery } from '../query-parameters';
import { RealtimeQueryAdapter } from '../realtime-remote-store';
import { RealtimeService } from '../realtime.service';
import { RealtimeDoc } from './realtime-doc';
import { Snapshot } from './snapshot';

/**
 * This class represents a real-time query. If the query has been subscribed to, then the "remoteChanges$" observable
 * will emit on any remote changes to the query results.
 */
export class RealtimeQuery<T extends RealtimeDoc = RealtimeDoc> {
  private _docs: T[] = [];
  private unsubscribe$ = new Subject<void>();
  private _count: number = 0;
  private _unpagedCount: number = 0;
  private readonly _remoteChanges$ = new Subject<void>();
  private readonly _ready$ = new Subject<void>();

  constructor(private readonly realtimeService: RealtimeService, public readonly adapter: RealtimeQueryAdapter) {
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

  get count(): number {
    return this._count;
  }

  get unpagedCount(): number {
    return this._unpagedCount;
  }

  get remoteChanges$(): Observable<void> {
    return this._remoteChanges$;
  }

  get ready$(): Observable<void> {
    return this._ready$;
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
    this.adapter.destroy();
  }

  localUpdate(): void {
    if (!this.subscribed) {
      return;
    }
    this.localQuery();
  }

  private async localQuery(): Promise<string[]> {
    const snapshots: Snapshot[] = await this.realtimeService.offlineStore.getAll(this.collection);
    const [results, unpagedCount] = performQuery(this.adapter.parameters, snapshots);
    const docIds = results.map(s => s.id);
    await this.onChange(false, docIds, docIds.length, unpagedCount);
    return docIds;
  }

  private async onReady(): Promise<void> {
    if (this.subscribed) {
      await this.onChange(true, this.adapter.docIds, this.adapter.count, this.adapter.unpagedCount);
      this._ready$.next();
    } else {
      this._docs = this.adapter.docIds.map(id => this.realtimeService.get<T>(this.collection, id));
      this._count = this.adapter.count;
      this._unpagedCount = this.adapter.unpagedCount;
    }
  }

  private async onChange(
    emitRemoteChanges: boolean,
    docIds: string[],
    count: number,
    unpagedCount: number
  ): Promise<void> {
    let changed = false;
    if (this.count !== count) {
      this._count = count;
      changed = true;
    }
    if (this.adapter.parameters.$count == null) {
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

    if (emitRemoteChanges && changed && this.adapter.ready) {
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
    }
    await Promise.all(promises);
    this._docs.splice(index, 0, ...newDocs);
  }

  private onRemove(index: number, docIds: string[]): void {
    const removedDocs = this._docs.splice(index, docIds.length);
    for (const doc of removedDocs) {
      doc.onRemovedFromSubscribeQuery();
    }
  }

  private onMove(from: number, to: number, length: number): void {
    const removedDocs = this._docs.splice(from, length);
    this._docs.splice(to, 0, ...removedDocs);
  }
}
