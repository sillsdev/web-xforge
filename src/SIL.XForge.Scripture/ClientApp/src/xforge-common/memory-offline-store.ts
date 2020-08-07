import { OfflineData, OfflineStore } from './offline-store';
import { performQuery, QueryParameters, QueryResults } from './query-parameters';

/**
 * This class is a memory-based implementation of the real-time offline store. It is useful for testing.
 */
export class MemoryOfflineStore extends OfflineStore {
  public storageQuotaFull: boolean = false;

  private readonly map = new Map<string, Map<string, OfflineData>>();

  addData(collection: string, data: OfflineData): void {
    let collectionData = this.map.get(collection);
    if (collectionData == null) {
      collectionData = new Map<string, OfflineData>();
      this.map.set(collection, collectionData);
    }
    collectionData.set(data.id, data);
  }

  getData<T extends OfflineData>(collection: string, id: string): T | undefined {
    const collectionData = this.map.get(collection);
    if (collectionData != null) {
      return collectionData.get(id) as T;
    }
    return undefined;
  }

  getAllIds(collection: string): Promise<string[]> {
    const collectionData = this.map.get(collection);
    if (collectionData == null) {
      return Promise.resolve([]);
    }
    return Promise.resolve(Array.from(collectionData.keys()));
  }

  getAll<T extends OfflineData>(collection: string): Promise<T[]> {
    const collectionData = this.map.get(collection);
    if (collectionData == null) {
      return Promise.resolve([]);
    }
    return Promise.resolve(Array.from(collectionData.values()) as T[]);
  }

  get<T extends OfflineData>(collection: string, id: string): Promise<T | undefined> {
    const collectionData = this.map.get(collection);
    if (collectionData == null) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(collectionData.get(id) as T | undefined);
  }

  async query<T extends OfflineData>(collection: string, parameters: QueryParameters): Promise<QueryResults<T>> {
    const snapshots = await this.getAll<T>(collection);
    return performQuery<T>(parameters, snapshots);
  }

  put(collection: string, offlineData: OfflineData): Promise<void> {
    if (this.storageQuotaFull) {
      return Promise.reject(new DOMException('error', 'QuotaExceededError'));
    }
    let collectionData = this.map.get(collection);
    if (collectionData == null) {
      collectionData = new Map<string, OfflineData>();
      this.map.set(collection, collectionData);
    }
    collectionData.set(offlineData.id, offlineData);
    return Promise.resolve();
  }

  delete(collection: string, id: string): Promise<void> {
    const collectionData = this.map.get(collection);
    if (collectionData != null) {
      collectionData.delete(id);
    }
    return Promise.resolve();
  }

  deleteDB(): Promise<void> {
    this.map.clear();
    return Promise.resolve();
  }
}
