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
  private _remoteChanges$ = new Subject<void>();
  private resultsQuery: Query;
  private unpagedCountQuery: Query;
  private _ready: boolean = false;

  constructor(
    private readonly conn: Connection,
    public readonly collection: string,
    public readonly parameters: QueryParameters
  ) {}

  get subscribed(): boolean {
    return this.resultsQuery != null && this.resultsQuery.action === 'qs';
  }

  get ready(): boolean {
    return this._ready;
  }

  get ready$(): Observable<void> {
    return this._ready$;
  }

  get remoteChanges$(): Observable<void> {
    return this._remoteChanges$;
  }

  get docIds(): string[] {
    return this.resultsQuery != null ? this.resultsQuery.results.map(d => d.id) : [];
  }

  get count(): number {
    if (this.resultsQuery == null) {
      return 0;
    }
    if (this.resultsQuery.extra != null) {
      return this.resultsQuery.extra;
    }
    return this.resultsQuery.results.length;
  }

  get unpagedCount(): number {
    if (this.resultsQuery == null) {
      return 0;
    }
    if (this.unpagedCountQuery != null && this.unpagedCountQuery.extra != null) {
      return this.unpagedCountQuery.extra;
    }
    return this.resultsQuery.results.length;
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
    if (this.parameters.$skip != null || this.parameters.$limit != null) {
      const unpagedCountParameters = cloneDeep(this.parameters) as any;
      unpagedCountParameters.$count = { applySkipLimit: false };
      const unpagedCountQueryPromise = new Promise<void>((resolve, reject) => {
        this.unpagedCountQuery = this.conn.createFetchQuery(this.collection, unpagedCountParameters, {}, err => {
          if (err != null) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
      this.setupListeners();
      await Promise.all([resultsQueryPromise, unpagedCountQueryPromise]);
    } else {
      this.setupListeners();
      await resultsQueryPromise;
    }
  }

  subscribe(initialDocIds: string[] = []): void {
    const results = initialDocIds.map(docId => this.conn.get(this.collection, docId));
    this.resultsQuery = this.conn.createSubscribeQuery(this.collection, this.parameters, { results });
    if (this.parameters.$skip != null || this.parameters.$limit != null) {
      const unpagedCountParameters = cloneDeep(this.parameters) as any;
      unpagedCountParameters.$count = { applySkipLimit: false };
      this.unpagedCountQuery = this.conn.createSubscribeQuery(this.collection, unpagedCountParameters);
    }
    this.setupListeners();
  }

  destroy(): void {
    if (this.resultsQuery != null) {
      this.resultsQuery.destroy();
    }
    if (this.unpagedCountQuery != null) {
      this.unpagedCountQuery.destroy();
    }
  }

  private setupListeners(): void {
    this.resultsQuery.on('ready', () => {
      if (this.unpagedCountQuery == null || this.unpagedCountQuery.ready) {
        this._ready = true;
        this._ready$.next();
      }
    });
    this.resultsQuery.on('changed', () => {
      if (this.ready) {
        this._remoteChanges$.next();
      }
    });
    this.resultsQuery.on('extra', () => {
      if (this.ready) {
        this._remoteChanges$.next();
      }
    });
    if (this.unpagedCountQuery != null) {
      this.unpagedCountQuery.on('ready', () => {
        if (this.resultsQuery.ready) {
          this._ready = true;
          this._ready$.next();
        }
      });
    }
  }
}
