import { OfflineData } from './models/offline-data';
import { Snapshot } from './models/snapshot';
import { QueryParameters, QueryResults } from './query-parameters';

/**
 * The model for a snapshot that is stored in the offline store.
 */
export interface RealtimeOfflineData extends Snapshot {
  pendingOps: any[];
}

export type RealtimeOfflineQueryResults = QueryResults<RealtimeOfflineData>;

/**
 * This is the abstract base class for real-time offline store implementations. An offline store is responsible for
 * saving and retrieving real-time doc snapshots in the browser.
 */
export abstract class RealtimeOfflineStore {
  abstract getAllIds(collection: string): Promise<string[]>;
  abstract getAll(collection: string): Promise<RealtimeOfflineData[]>;
  abstract getAllData<T extends OfflineData>(collection: string): Promise<T[]>;
  abstract query(collection: string, parameters: QueryParameters): Promise<RealtimeOfflineQueryResults>;
  abstract get(collection: string, id: string): Promise<RealtimeOfflineData | undefined>;
  abstract getData<T extends OfflineData>(collection: string, dataId: string): Promise<T | undefined>;
  abstract put(collection: string, offlineData: RealtimeOfflineData): Promise<void>;
  abstract putData(collection: string, data: OfflineData): Promise<OfflineData | undefined>;
  abstract delete(collection: string, id: string): Promise<void>;
  abstract deleteData(collection: string, id: string): Promise<void>;
  abstract deleteDB(): Promise<void>;
}
