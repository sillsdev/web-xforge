import { merge, Observable, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { performQuery } from '../query-parameters';
import { RealtimeQueryAdapter } from '../realtime-remote-store';
import { RealtimeService } from '../realtime.service';
import { RealtimeDoc } from './realtime-doc';
import { Snapshot } from './snapshot';

/**
 * This class represents a real-time query. If the query has been subscribed to, then the "remoteChanges$" observable
 * will emit on any changes to the "docs" array. The "docs" array is only updated once the op that affects the results
 * is executed on the server and the client is notified.
 */
export class RealtimeQuery<T extends RealtimeDoc = RealtimeDoc> {
  readonly remoteChanges$: Observable<void>;

  private _docs: T[] = [];
  private unsubscribe$ = new Subject<void>();
  private initialCount: number = 0;
  private initialUnpagedCount: number = 0;

  constructor(private readonly realtimeService: RealtimeService, public readonly adapter: RealtimeQueryAdapter) {
    this.adapter.ready$.pipe(takeUntil(this.unsubscribe$)).subscribe(() => this.onReady());
    this.adapter.insert$.pipe(takeUntil(this.unsubscribe$)).subscribe(evt => this.onInsert(evt.index, evt.docIds));
    this.adapter.remove$.pipe(takeUntil(this.unsubscribe$)).subscribe(evt => this.onRemove(evt.index, evt.docIds));
    this.adapter.move$.pipe(takeUntil(this.unsubscribe$)).subscribe(evt => this.onMove(evt.from, evt.to, evt.length));
    this.remoteChanges$ = merge(this.adapter.ready$, this.adapter.remoteChanges$);
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
    return this.adapter.ready ? this.adapter.count : this.initialCount;
  }

  get unpagedCount(): number {
    return this.adapter.ready ? this.adapter.unpagedCount : this.initialUnpagedCount;
  }

  fetch(): Promise<void> {
    return this.adapter.fetch();
  }

  async subscribe(): Promise<void> {
    const [results, unpagedCount] = await this.localQuery();
    if (this.adapter.parameters.$count == null) {
      const promises: Promise<void>[] = [];
      for (const docId of results) {
        const doc = this.realtimeService.get<T>(this.adapter.collection, docId);
        this._docs.push(doc);
        promises.push(doc.loadFromStore());
      }
      await Promise.all(promises);
    }
    this.initialCount = results.length;
    this.initialUnpagedCount = unpagedCount;
    this.adapter.subscribe(this.adapter.parameters.$count == null ? results : undefined);
  }

  dispose(): void {
    this.unsubscribe$.next();
    this.unsubscribe$.complete();
    if (this.subscribed && this.adapter.ready) {
      for (const doc of this._docs) {
        doc.removedFromSubscribeQuery();
      }
    }
    this.adapter.destroy();
  }

  private async localQuery(): Promise<[string[], number]> {
    const snapshots: Snapshot[] = await this.realtimeService.offlineStore.getAll(this.collection);
    const [results, unpagedCount] = performQuery(this.adapter.parameters, snapshots);
    return [results.map(s => s.id), unpagedCount];
  }

  private onReady(): void {
    if (this.subscribed) {
      for (const doc of this._docs) {
        doc.addedToSubscribeQuery();
      }
    } else {
      this._docs = this.adapter.docIds.map(id => this.realtimeService.get<T>(this.collection, id));
    }
  }

  private onInsert(index: number, docIds: string[]): void {
    const newDocs: T[] = [];
    for (const docId of docIds) {
      const newDoc = this.realtimeService.get<T>(this.collection, docId);
      if (this.adapter.ready && this.subscribed) {
        newDoc.addedToSubscribeQuery();
      }
      newDocs.push(newDoc);
    }
    this._docs.splice(index, 0, ...newDocs);
    this._docs = this._docs.slice();
  }

  private onRemove(index: number, docIds: string[]): void {
    const removedDocs = this._docs.splice(index, docIds.length);
    this._docs = this._docs.slice();
    if (this.subscribed) {
      for (const doc of removedDocs) {
        if (this.adapter.ready) {
          doc.removedFromSubscribeQuery();
        } else if (doc.isLoaded) {
          doc.checkExists();
        }
      }
    }
  }

  private onMove(from: number, to: number, length: number): void {
    const removedDocs = this._docs.splice(from, length);
    this._docs.splice(to, 0, ...removedDocs);
    this._docs = this._docs.slice();
  }
}
