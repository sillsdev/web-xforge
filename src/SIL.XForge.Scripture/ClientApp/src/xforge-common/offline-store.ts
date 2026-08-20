import { QueryParameters, QueryResults } from './query-parameters';

export interface OfflineData {
  id: string;
}

/**
 * This is the abstract base class for offline store implementations. An offline store is responsible for saving and
 * retrieving offline data in the browser.
 */
export abstract class OfflineStore {
  private _disabled = false;

  /** Whether the store has been permanently disabled by {@link disable}. */
  get disabled(): boolean {
    return this._disabled;
  }

  /**
   * Permanently prevents this store from reading or writing data; calls made after this may never
   * settle. Called on logout (which is followed by a redirect away from the app) before the data is
   * deleted, because reads and writes that are still in flight would otherwise re-create the
   * deleted database with the logged-out user's data (SF-3855).
   */
  disable(): void {
    this._disabled = true;
  }

  abstract getAllIds(collection: string): Promise<string[]>;
  abstract getAll<T extends OfflineData>(collection: string): Promise<T[]>;
  abstract query<T extends OfflineData>(collection: string, parameters: QueryParameters): Promise<QueryResults<T>>;
  abstract get<T extends OfflineData>(collection: string, id: string): Promise<T | undefined>;
  abstract put(collection: string, offlineData: OfflineData): Promise<void>;
  abstract delete(collection: string, id: string): Promise<void>;
  abstract deleteDB(): Promise<void>;
}
