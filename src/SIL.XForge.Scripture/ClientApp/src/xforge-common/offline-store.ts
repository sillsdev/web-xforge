import { QueryParameters, QueryResults } from './query-parameters';

export interface OfflineData {
  id: string;
}

/**
 * This is the abstract base class for offline store implementations. An offline store is responsible for saving and
 * retrieving offline data in the browser.
 */
export abstract class OfflineStore {
  abstract getAllIds(collection: string): Promise<string[]>;
  abstract getAll<T extends OfflineData>(collection: string): Promise<T[]>;
  abstract query<T extends OfflineData>(collection: string, parameters: QueryParameters): Promise<QueryResults<T>>;
  abstract get<T extends OfflineData>(collection: string, id: string): Promise<T | undefined>;
  abstract put<T extends OfflineData>(collection: string, offlineData: T): Promise<T>;
  abstract delete(collection: string, id: string): Promise<void>;
  abstract deleteDB(): Promise<void>;
}
