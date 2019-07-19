import * as RichText from 'rich-text';
import { EMPTY, fromEvent, Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { Connection, Doc, OTType, Snapshot, types } from 'sharedb/lib/client';

types.register(RichText.type);

/**
 * This interface represents an adapter for a real-time document. An adapter is used to fetch and mutate a real-time
 * document on the backend. Real-time documents can be concurrently updated by multiple users. The document is
 * synchronized in real-time for all users.
 */
export interface RealtimeDocAdapter {
  readonly id: string;
  readonly data: any;
  readonly version: number;
  readonly type: OTType;
  readonly pendingOps: any[];
  readonly subscribed: boolean;

  readonly idle$: Observable<void>;
  /** Fires when underlying data is recreated. */
  readonly create$: Observable<void>;
  readonly delete$: Observable<void>;
  /** Fires when there are changes to underlying data. */
  readonly remoteChanges$: Observable<any>;

  fetch(): Promise<void>;
  ingestSnapshot(snapshot: Snapshot): Promise<void>;
  subscribe(): Promise<void>;
  submitOp(op: any, source?: any): Promise<void>;
  exists(): Promise<boolean>;
  delete(): Promise<void>;

  destroy(): Promise<void>;
}

/**
 * This is a ShareDB implementation of the real-time document adapter interface.
 */
export class SharedbRealtimeDocAdapter implements RealtimeDocAdapter {
  readonly idle$: Observable<void>;
  readonly create$: Observable<void>;
  readonly delete$: Observable<void>;
  readonly remoteChanges$: Observable<any>;

  constructor(private readonly conn: Connection, private readonly collection: string, private readonly doc: Doc) {
    this.idle$ = fromEvent(this.doc, 'no write pending');
    this.create$ = fromEvent(this.doc, 'create');
    this.delete$ = fromEvent(this.doc, 'del');
    this.remoteChanges$ = fromEvent<[any, any]>(this.doc, 'op').pipe(
      filter(([, source]) => !source),
      map(([ops]) => ops)
    );
  }

  get id(): string {
    return this.doc.id;
  }

  get data(): any {
    return this.doc.data;
  }

  get version(): number {
    return this.doc.version;
  }

  get type(): OTType {
    return this.doc.type;
  }

  get subscribed(): boolean {
    return this.doc.subscribed;
  }

  get pendingOps(): any[] {
    const pendingOps = [];
    if (this.doc.hasWritePending()) {
      if (this.doc.inflightOp != null && this.doc.inflightOp.op != null) {
        pendingOps.push(this.doc.inflightOp.op);
      }

      for (const opInfo of this.doc.pendingOps) {
        if (opInfo.op != null) {
          pendingOps.push(opInfo.op);
        }
      }
    }
    return pendingOps;
  }

  fetch(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.doc.fetch(err => {
        if (err != null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  ingestSnapshot(snapshot: Snapshot): Promise<void> {
    return new Promise((resolve, reject) => {
      this.doc.ingestSnapshot(snapshot, err => {
        if (err != null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  subscribe(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.doc.subscribe(err => {
        if (err != null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  submitOp(op: any, source?: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const options: any = {};
      if (source != null) {
        options.source = source;
      }
      this.doc.submitOp(op, options, err => {
        if (err != null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  exists(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const query = this.conn.createFetchQuery(
        this.collection,
        { _id: this.id, $limit: 1, $count: { applySkipLimit: true } },
        {},
        err => {
          if (err != null) {
            reject(err);
          } else {
            resolve(query.extra === 1);
          }
        }
      );
    });
  }

  delete(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.doc.del({}, err => {
        if (err != null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  destroy(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.doc.destroy(err => {
        if (err != null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * This is a memory-based implementation of the real-time document adapter interface. It is useful for unit tests.
 */
export class MemoryRealtimeDocAdapter implements RealtimeDocAdapter {
  readonly pendingOps: any[] = [];
  version: number = 1;
  subscribed: boolean = false;
  readonly remoteChanges$ = new Subject<any>();
  readonly create$ = new Subject<void>();
  readonly delete$ = new Subject<void>();
  readonly idle$ = EMPTY;

  constructor(public readonly type: OTType, public readonly id: string, public data: any) {}

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

  submitOp(op: any, _source?: any): Promise<void> {
    if (op != null && this.type.normalize != null) {
      op = this.type.normalize(op);
    }
    this.data = this.type.apply(this.data, op);
    this.version++;
    return Promise.resolve();
  }

  exists(): Promise<boolean> {
    return Promise.resolve(true);
  }

  delete(): Promise<void> {
    return Promise.resolve();
  }

  destroy(): Promise<void> {
    return Promise.resolve();
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
