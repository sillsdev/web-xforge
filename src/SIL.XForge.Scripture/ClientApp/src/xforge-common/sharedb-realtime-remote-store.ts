import { Injectable } from '@angular/core';
import { cloneDeep } from 'lodash-es';
import ReconnectingWebSocket, { Message } from 'reconnecting-websocket';
import Events from 'reconnecting-websocket/dist/events';
import * as RichText from 'rich-text';
import { fromEvent, Observable, Subject } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { Connection, Doc, OTType, Query, Snapshot, types } from 'sharedb/lib/client';
import { Presence } from 'sharedb/lib/sharedb';
import { Snapshot as DataSnapshot } from 'xforge-common/models/snapshot';
import { environment } from '../environments/environment';
import { hasPropWithValue, hasStringProp } from '../type-utils';
import { FeatureFlagService } from './feature-flags/feature-flag.service';
import { LocationService } from './location.service';
import { OnlineStatusService } from './online-status.service';
import { QueryParameters } from './query-parameters';
import { RealtimeDocAdapter, RealtimeQueryAdapter, RealtimeRemoteStore } from './realtime-remote-store';
import { tryParseJSON } from './utils';

types.register(RichText.type);

/** Checks whether the given string is a message sending an op to the server */
function isMessageSendingOp(data: unknown): boolean {
  return hasPropWithValue(data, 'a', 'op');
}

/**
 * This class was created to work around a problem with ShareDB and offline support. ShareDB is designed to work with a
 * network that drops and then reconnects, but is not designed to persist data anywhere other than in memory.
 *
 * In order to make submitting an op idempotent, two properties are set on the op:
 * - `src` is set to the value of the `id` property of the connection. (In practice this is usually omitted because it
 * would be the same as the connection id; see below)
 * - `seq` is set to a monotonically increasing number that is unique to the connection.
 * If an op has been submitted but not acknowledged, then the op is submitted again, and the server will ignore the op
 * if it already applied it.
 *
 * If the user closes the browser when an op has been sent and not acknowledged, the op needs to be stored in IndexedDB
 * with the same `src` and `seq` properties so that when the user opens the browser again, the op can be submitted again
 * idempotently. The problem is that ShareDB sets the `seq` property immediately before sending the op, so it is not
 * possible to fully store the op in IndexedDB before the `seq` property is set. There is no event that can be
 * subscribed to that will be triggered after the `seq` property is set and before the op is sent, and we cannot set the
 * `seq` property ourselves when submitting the op to ShareDB (or at least no way was found when this route was
 * investigated).
 *
 * ShareDB is even more lackadaisical about setting the `src` property on the op. When the op is first submitted, the
 * `src` value would be set to the `id` property of the connection, which is known by the server, so ShareDB omits the
 * `src` property and lets the server get the value from the connection. Immediately after submitting the op, ShareDB
 * sets the `src` property to the value of the `id` property of the connection, so that if the op is later sent again
 * after a new connection is established, the op can be correctly ignored.
 *
 * The workaround to these problems is to use a custom websocket adapter that will intercept the connection and store
 * the op in IndexedDB before it is sent. When the op is intercepted it already has the `seq` property set, but lacks
 * the `src` property. To work around this, the `src` property is added to a copy of the op just before it is stored in
 * IndexedDB.
 *
 * - NP, 2023-03-07
 *
 * Notes:
 * - This class is implementing a websocket, but only the methods that are used by ShareDB are implemented.
 */
class ShareDBWebsocketAdapter {
  constructor(
    readonly socket: ReconnectingWebSocket,
    readonly remoteStore: SharedbRealtimeRemoteStore,
    readonly featureFlags: FeatureFlagService
  ) {}

  close(): void {
    this.socket.close();
  }

  get readyState(): number {
    return this.socket.readyState;
  }

  get onmessage(): ((event: MessageEvent<any>) => void) | null {
    return this.socket.onmessage;
  }

  /**
   * Handles messages from the server and passes them on to ShareDB on the client. If the message is an op, and the
   * feature flag to disable op acknowledgement is turned on, the message is ignored (not passed on to ShareDB).
   * (Actually all ops are blocked, not just acknowledgements. We might want to consider changing that).
   */
  set onmessage(handler: ((event: MessageEvent) => void) | null) {
    this.socket.onmessage = (event: MessageEvent) => {
      const sendingOp = isMessageSendingOp(tryParseJSON(event.data));
      if (handler == null || (sendingOp && this.featureFlags.preventOpAcknowledgement.enabled)) {
        return;
      }
      handler(event);
    };
  }

  get onerror(): ((event: Events.ErrorEvent) => void) | null {
    return this.socket.onerror;
  }

  set onerror(handler: ((event: Events.ErrorEvent) => void) | null) {
    this.socket.onerror = handler;
  }

  get onopen(): ((event: Events.Event) => void) | null {
    return this.socket.onopen;
  }

  set onopen(handler: ((event: Events.Event) => void) | null) {
    this.socket.onopen = handler;
  }

  get onclose(): ((event: Events.CloseEvent) => void) | null {
    return this.socket.onclose;
  }

  set onclose(handler: ((event: Events.CloseEvent) => void) | null) {
    this.socket.onclose = handler;
  }

  /**
   * Sends messages on through from the ShareDB client to the websocket, but ignores them if the message is an op and
   * the feature flag to disable sending ops is turned on.
   *
   * If the message is an op and sending ops is not disabled, then the remote store is notified that an op is about to
   * be sent, along with the collection and document id of the op, so that it can be stored in IndexedDB before being
   * sent.
   */
  async send(data: Message): Promise<void> {
    const message: unknown = tryParseJSON(data);
    const sendingOp: boolean = isMessageSendingOp(message);
    if (sendingOp && this.featureFlags.preventOpSubmission.enabled) {
      return;
    }
    if (sendingOp && hasStringProp(message, 'c') && hasStringProp(message, 'd')) {
      await this.remoteStore.beforeSendOp(message['c'], message['d']);
    }
    this.socket.send(data);
  }
}

/**
 * This is the ShareDB-based implementation of the real-time remote store.
 */
@Injectable({
  providedIn: 'root'
})
export class SharedbRealtimeRemoteStore extends RealtimeRemoteStore {
  beforeSendOpListeners: ((collection: string, docId: string) => Promise<void>)[] = [];

  private ws?: ReconnectingWebSocket;
  private connection?: Connection;
  private getAccessToken?: () => Promise<string | undefined>;
  private shareDBWebsocketAdapter?: ShareDBWebsocketAdapter;

  constructor(
    private readonly locationService: LocationService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly featureFlags: FeatureFlagService
  ) {
    super();
  }

  async init(getAccessToken: () => Promise<string | undefined>): Promise<void> {
    if (this.connection != null) {
      return;
    }
    this.getAccessToken = getAccessToken;
    // Wait until we have a valid connection or error before proceeding so we know we're online/offline
    await new Promise<void>(resolve => {
      this.ws = new ReconnectingWebSocket(async () => await this.getUrl(), undefined, { maxEnqueuedMessages: 0 });
      // When the web socket is open we have a valid connection
      this.ws.addEventListener('open', () => {
        this.onlineStatusService.webSocketResponse = true;
        resolve();
      });
      // When the web socket errors a connection is not valid so the app needs to operate offline
      this.ws.addEventListener('error', () => {
        this.onlineStatusService.webSocketResponse = false;
        resolve();
      });
    });
    this.shareDBWebsocketAdapter = new ShareDBWebsocketAdapter(this.ws!, this, this.featureFlags);
    this.connection = new Connection(this.shareDBWebsocketAdapter);
  }

  createDocAdapter(collection: string, id: string): RealtimeDocAdapter {
    if (this.connection == null) {
      throw new Error('The store has not been initialized.');
    }
    const doc = this.connection.get(collection, id);
    return new SharedbRealtimeDocAdapter(doc);
  }

  createQueryAdapter(collection: string, parameters: QueryParameters): RealtimeQueryAdapter {
    if (this.connection == null) {
      throw new Error('The store has not been initialized.');
    }
    return new SharedbRealtimeQueryAdapter(this.connection, collection, parameters);
  }

  private async getUrl(): Promise<string> {
    const isSecure: boolean = this.locationService.protocol === 'https:';
    const protocol = isSecure ? 'wss:' : 'ws:';
    let url = `${protocol}//${this.locationService.hostname}`;
    if (isSecure && environment.realtimeSecurePort !== 0) {
      url += `:${environment.realtimeSecurePort}`;
    } else if (environment.realtimePort !== 0) {
      url += `:${environment.realtimePort}`;
    }
    url += environment.realtimeUrl;
    if (this.getAccessToken != null) {
      const accessToken = await this.getAccessToken();
      if (accessToken != null) {
        url += '?access_token=' + accessToken;
      }
    }
    return url;
  }

  /**
   * Adds a listener that will be called before an op is sent to the server. This allows the op to be stored in
   * IndexedDB before being sent.
   */
  subscribeToBeforeSendOp(listener: (collection: string, docId: string) => Promise<void>): void {
    this.beforeSendOpListeners.push(listener);
  }

  /** Calls all listeners that have been added to be notified before an op is sent to the server. */
  async beforeSendOp(collection: string, docId: string): Promise<void> {
    for (const listener of this.beforeSendOpListeners) {
      await listener(collection, docId);
    }
  }
}

/**
 * This is a ShareDB implementation of the real-time document adapter interface.
 */
export class SharedbRealtimeDocAdapter implements RealtimeDocAdapter {
  readonly idle$: Observable<void>;
  readonly create$: Observable<void>;
  readonly delete$: Observable<void>;
  readonly changes$: Observable<any>;
  readonly remoteChanges$: Observable<any>;

  constructor(private readonly doc: Doc) {
    this.idle$ = fromEvent(this.doc, 'no write pending').pipe(map(() => undefined));
    this.create$ = fromEvent(this.doc, 'create').pipe(map(() => undefined));
    this.delete$ = fromEvent(this.doc, 'del').pipe(map(() => undefined));
    this.changes$ = fromEvent<[any, any]>(this.doc, 'op').pipe(map(([ops]) => ops));
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

  get channelPresence(): Presence {
    return this.doc.connection.getPresence(`${this.collection}:${this.id}`);
  }

  get docPresence(): Presence {
    return this.doc.connection.getDocPresence(this.collection, this.id);
  }

  /**
   * Returns the pending ops for the document. This includes the inflight op if it exists. This is used to save the
   * pending ops to IndexedDB so they can be sent to the server when the connection is restored.
   */
  get pendingOps(): any[] {
    let pendingOps: any[] = [];
    if (this.doc.hasWritePending()) {
      pendingOps = this.doc.pendingOps.slice();

      if (this.doc.inflightOp != null && this.doc.inflightOp.op != null) {
        // If the inflight op does not already have the src set, provide the connection id as the src.
        // This doesn't modify ShareDB's copy of the op, but it ensures that when the pending ops are saved to IndexedDB
        // the src is set, even though ShareDB hasn't set it yet at this point. See documentation for
        // ShareDBWebsocketAdapter for more details.
        pendingOps.unshift({ src: this.doc.connection.id, ...this.doc.inflightOp });
      }
    }
    return pendingOps;
  }

  get submitSource(): boolean {
    return this.doc.submitSource;
  }

  set submitSource(value: boolean) {
    this.doc.submitSource = value;
  }

  create(data: any, type?: string): Promise<void> {
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

  updatePendingOps(ops: any[]): void {
    this.doc.pendingOps.push(
      ...ops.map(component => {
        const data = { op: component.op, type: this.doc.type, callbacks: [] };
        if (component.hasOwnProperty('src')) data['src'] = component.src;
        if (component.hasOwnProperty('seq')) data['seq'] = component.seq;
        if (component.hasOwnProperty('source')) data['source'] = component.source;
        return data;
      })
    );
    this.doc.flush();
  }

  previousSnapshot(): Promise<DataSnapshot> {
    return new Promise((resolve, reject) => {
      this.doc.connection.fetchSnapshot(
        this.doc.collection,
        this.doc.id,
        Math.max(0, this.doc.version - 1),
        (err, snapshot) => {
          if (err) {
            reject();
          } else {
            resolve(snapshot as DataSnapshot);
          }
        }
      );
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
  private resultsQuery?: Query;
  private unpagedCountQuery?: Query;
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
      unpagedCountParameters.$limit = undefined;
      unpagedCountParameters.$skip = undefined;
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
    if (this.resultsQuery == null) {
      return;
    }

    this.resultsQuery.on('ready', () => {
      if (this.unpagedCountQuery == null || this.unpagedCountQuery.ready) {
        this._ready = true;
        this._ready$.next();
      }
    });
    this.resultsQuery.on('changed', () => {
      if (this._ready) {
        this._remoteChanges$.next();
      }
    });
    this.resultsQuery.on('extra', () => {
      if (this._ready) {
        this._remoteChanges$.next();
      }
    });
    if (this.unpagedCountQuery != null) {
      this.unpagedCountQuery.on('ready', () => {
        if (this.resultsQuery != null && this.resultsQuery.ready) {
          this._ready = true;
          this._ready$.next();
        }
      });
    }
  }
}
