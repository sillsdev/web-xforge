import { Injectable } from '@angular/core';
import cloneDeep from 'lodash/cloneDeep';
import ReconnectingWebSocket from 'reconnecting-websocket';
import * as RichText from 'rich-text';
import { fromEvent, Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { Connection, Doc, OTType, Query, Snapshot, types } from 'sharedb/lib/client';
import { environment } from '../environments/environment';
import { LocationService } from './location.service';
import { QueryParameters } from './query-parameters';
import { RealtimeDocAdapter, RealtimeQueryAdapter, RealtimeRemoteStore } from './realtime-remote-store';

types.register(RichText.type);

/**
 * This is the ShareDB-based implementation of the real-time remote store.
 */
@Injectable({
  providedIn: 'root'
})
export class SharedbRealtimeRemoteStore extends RealtimeRemoteStore {
  private ws: ReconnectingWebSocket;
  private connection: Connection;
  private getAccessToken: () => string;

  constructor(private readonly locationService: LocationService) {
    super();
  }

  init(getAccessToken: () => string): void {
    this.getAccessToken = getAccessToken;
    this.ws = new ReconnectingWebSocket(() => this.getUrl(), undefined, { maxEnqueuedMessages: 0 });
    this.connection = new Connection(this.ws);
  }

  createDocAdapter(collection: string, id: string): RealtimeDocAdapter {
    const doc = this.connection.get(collection, id);
    return new SharedbRealtimeDocAdapter(doc);
  }

  createQueryAdapter(collection: string, parameters: QueryParameters): RealtimeQueryAdapter {
    return new SharedbRealtimeQueryAdapter(this.connection, collection, parameters);
  }

  private getUrl(): string {
    const protocol = this.locationService.protocol === 'https:' ? 'wss:' : 'ws:';
    let url = `${protocol}//${this.locationService.hostname}`;
    if ('realtimePort' in environment && environment.realtimePort != null && environment.realtimePort !== 0) {
      url += `:${environment.realtimePort}`;
    }
    url += environment.realtimeUrl + '?access_token=' + this.getAccessToken();
    return url;
  }
}

/**
 * This is a ShareDB implementation of the real-time document adapter interface.
 */
export class SharedbRealtimeDocAdapter implements RealtimeDocAdapter {
  readonly idle$: Observable<void>;
  readonly create$: Observable<void>;
  readonly delete$: Observable<void>;
  readonly remoteChanges$: Observable<any>;

  constructor(private readonly doc: Doc) {
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

  get collection(): string {
    return this.doc.collection;
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

  create(data: any, type?: OTType): Promise<void> {
    return new Promise((resolve, reject) => {
      this.doc.create(data, type, undefined, err => {
        if (err != null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
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
      const query = this.doc.connection.createFetchQuery(
        this.doc.collection,
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

export class SharedbRealtimeQueryAdapter implements RealtimeQueryAdapter {
  private _ready$ = new Subject<void>();
  private _insert$ = new Subject<{ index: number; docIds: string[] }>();
  private _remove$ = new Subject<{ index: number; docIds: string[] }>();
  private _move$ = new Subject<{ from: number; to: number; length: number }>();
  private _remoteChanges$ = new Subject<void>();
  private resultsQuery: Query;
  private countQuery: Query;
  private initialTotalUnpagedCount: number;

  constructor(
    private readonly conn: Connection,
    public readonly collection: string,
    public readonly parameters: QueryParameters
  ) {}

  get subscribed(): boolean {
    return this.resultsQuery != null && this.resultsQuery.action === 'qs';
  }

  get ready(): boolean {
    return this.resultsQuery != null ? this.resultsQuery.ready : false;
  }

  get ready$(): Observable<void> {
    return this._ready$;
  }

  get insert$(): Observable<{ index: number; docIds: string[] }> {
    return this._insert$;
  }

  get remove$(): Observable<{ index: number; docIds: string[] }> {
    return this._remove$;
  }

  get move$(): Observable<{ from: number; to: number; length: number }> {
    return this._move$;
  }

  get remoteChanges$(): Observable<void> {
    return this._remoteChanges$;
  }

  get docIds(): string[] {
    return this.resultsQuery != null ? this.resultsQuery.results.map(d => d.id) : [];
  }

  get totalUnpagedCount(): number {
    if (this.resultsQuery == null) {
      return 0;
    }
    if (this.countQuery != null && this.countQuery.extra != null) {
      return this.countQuery.extra;
    }
    if (this.initialTotalUnpagedCount == null || this.resultsQuery.ready) {
      return this.resultsQuery.results.length;
    }
    return this.initialTotalUnpagedCount;
  }

  async fetch(): Promise<void> {
    const resultsQueryPromise = new Promise<void>((resolve, reject) => {
      this.resultsQuery = this.conn.createFetchQuery(this.collection, this.parameters, {}, err => {
        if (err != null) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    this.setupListeners();
    if (this.parameters.$skip != null || this.parameters.$limit != null) {
      const countParameters = cloneDeep(this.parameters);
      countParameters.$count = { applySkipLimit: false };
      const countQueryPromise = new Promise<void>((resolve, reject) => {
        this.countQuery = this.conn.createFetchQuery(this.collection, countParameters, {}, err => {
          if (err != null) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      await Promise.all([resultsQueryPromise, countQueryPromise]);
    } else {
      await resultsQueryPromise;
    }
  }

  subscribe(initialDocIds: string[] = [], initialTotalUnpagedCount?: number): void {
    const results = initialDocIds.map(docId => this.conn.get(this.collection, docId));
    this.resultsQuery = this.conn.createSubscribeQuery(this.collection, this.parameters, { results });
    this.initialTotalUnpagedCount = initialTotalUnpagedCount;
    this.setupListeners();
    if (this.parameters.$skip != null || this.parameters.$limit != null) {
      const countParameters = cloneDeep(this.parameters);
      countParameters.$count = { applySkipLimit: false };
      this.countQuery = this.conn.createSubscribeQuery(this.collection, countParameters);
    }
  }

  destroy(): void {
    if (this.resultsQuery != null) {
      this.resultsQuery.destroy();
    }
    if (this.countQuery != null) {
      this.countQuery.destroy();
    }
  }

  private setupListeners(): void {
    this.resultsQuery.on('ready', () => this._ready$.next());
    this.resultsQuery.on('insert', (docs, index) => this._insert$.next({ index, docIds: docs.map(d => d.id) }));
    this.resultsQuery.on('remove', (docs, index) => this._remove$.next({ index, docIds: docs.map(d => d.id) }));
    this.resultsQuery.on('move', (docs, from, to) => this._move$.next({ from, to, length: docs.length }));
    this.resultsQuery.on('changed', () => this._remoteChanges$.next());
  }
}
