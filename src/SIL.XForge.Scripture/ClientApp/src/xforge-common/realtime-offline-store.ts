import { Snapshot } from './models/snapshot';

/**
 * The model for a snapshot that is stored in the offline store.
 */
export interface RealtimeOfflineData extends Snapshot {
  pendingOps: any[];
}

/**
 * This is the abstract base class for real-time offline store implementations. An offline store is responsible for
 * saving and retrieving real-time doc snapshots in the browser.
 */
export abstract class RealtimeOfflineStore {
  abstract getAllIds(collection: string): Promise<string[]>;
  abstract getAll(collection: string): Promise<RealtimeOfflineData[]>;
  abstract get(collection: string, id: string): Promise<RealtimeOfflineData>;
  abstract put(collection: string, offlineData: RealtimeOfflineData): Promise<void>;
  abstract delete(collection: string, id: string): Promise<void>;
  abstract deleteDB(): Promise<void>;
}
