import { Observable } from 'rxjs';
import { OTType } from 'sharedb/lib/client';
import { Presence } from 'sharedb/lib/sharedb';
import { Snapshot } from './models/snapshot';
import { QueryParameters } from './query-parameters';

/**
 * This is the abstract base class for real-time remote store implementations. A remote store is responsible for
 * communicating with the real-time backend.
 */
export abstract class RealtimeRemoteStore {
  abstract init(getAccessToken: () => string | undefined): Promise<void>;
  abstract createDocAdapter(collection: string, id: string): RealtimeDocAdapter;
  abstract createQueryAdapter(collection: string, parameters: QueryParameters): RealtimeQueryAdapter;
}

/**
 * This interface represents an adapter for a real-time document. An adapter is used to fetch and mutate a real-time
 * document on the backend. Real-time documents can be concurrently updated by multiple users. The document is
 * synchronized in real-time for all users.
 */
export interface RealtimeDocAdapter {
  readonly id: string;
  readonly data?: any;
  readonly version: number;
  readonly type?: OTType;
  readonly pendingOps: any[];
  readonly subscribed: boolean;
  readonly collection: string;
  readonly channelPresence: Presence;
  readonly docPresence: Presence;

  readonly idle$: Observable<void>;
  /** Fires when underlying data is recreated. */
  readonly create$: Observable<void>;
  readonly delete$: Observable<void>;
  /** Fires when there are changes to underlying data. */
  readonly changes$: Observable<any>;
  /** Fires when there are changes to underlying data that came from a different client. */
  readonly remoteChanges$: Observable<any>;

  create(data: any, type?: string): Promise<void>;
  fetch(): Promise<void>;
  ingestSnapshot(snapshot: Snapshot): Promise<void>;
  subscribe(): Promise<void>;
  submitOp(op: any, source?: any): Promise<void>;
  exists(): Promise<boolean>;
  delete(): Promise<void>;
  updatePendingOps(ops: any[]): void;
  previousSnapshot(): Promise<Snapshot>;

  destroy(): Promise<void>;
}

/**
 * This interface represents an adapter for a real-time doc query. An adapter is used to execute a query on docs in the
 * real-time backend.
 */
export interface RealtimeQueryAdapter {
  readonly collection: string;
  readonly subscribed: boolean;
  readonly count: number;
  readonly unpagedCount: number;
  readonly docIds: string[];
  readonly parameters: QueryParameters;
  readonly ready: boolean;

  readonly ready$: Observable<void>;
  readonly remoteChanges$: Observable<void>;

  fetch(): Promise<void>;
  subscribe(initialDocIds?: string[]): void;

  /*
   * Unsubscribes and destroys this query.
   */
  destroy(): void;
}
