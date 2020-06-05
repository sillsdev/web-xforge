import merge from 'lodash/merge';
import { OfflineData } from './models/offline-data';
import { Snapshot } from './models/snapshot';
import { performQuery, QueryParameters } from './query-parameters';
import { RealtimeOfflineData, RealtimeOfflineQueryResults, RealtimeOfflineStore } from './realtime-offline-store';

/**
 * This class is a memory-based implementation of the real-time offline store. It is useful for testing.
 */
export class MemoryRealtimeOfflineStore extends RealtimeOfflineStore {
  private readonly map = new Map<string, Map<string, RealtimeOfflineData>>();
  private readonly offlineDataMap = new Map<string, Map<string, OfflineData>>();

  addSnapshot<T>(collection: string, snapshot: Snapshot<T>): void {
    let collectionSnapshots = this.map.get(collection);
    if (collectionSnapshots == null) {
      collectionSnapshots = new Map<string, RealtimeOfflineData>();
      this.map.set(collection, collectionSnapshots);
    }
    collectionSnapshots.set(snapshot.id, merge(snapshot, { pendingOps: [] }));
  }

  getAllIds(collection: string): Promise<string[]> {
    const collectionData = this.map.get(collection);
    if (collectionData == null) {
      return Promise.resolve([]);
    }
    return Promise.resolve(Array.from(collectionData.keys()));
  }

  getAll(collection: string): Promise<RealtimeOfflineData[]> {
    const collectionData = this.map.get(collection);
    if (collectionData == null) {
      return Promise.resolve([]);
    }
    return Promise.resolve(Array.from(collectionData.values()));
  }

  get(collection: string, id: string): Promise<RealtimeOfflineData | undefined> {
    const collectionData = this.map.get(collection);
    if (collectionData == null) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(collectionData.get(id));
  }

  getAllData<T extends OfflineData>(collection: string): Promise<T[]> {
    const collectionData = this.offlineDataMap.get(collection);
    if (collectionData == null) {
      return Promise.resolve([]);
    }
    return Promise.resolve(Array.from(collectionData.values()).map(d => d as T));
  }

  getData<T extends OfflineData>(collection: string, dataId: string): Promise<T | undefined> {
    const collectionData = this.offlineDataMap.get(collection);
    if (collectionData == null) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve(collectionData.get(dataId) as T);
  }

  async query(collection: string, parameters: QueryParameters): Promise<RealtimeOfflineQueryResults> {
    const snapshots = await this.getAll(collection);
    return performQuery(parameters, snapshots);
  }

  put(collection: string, offlineData: RealtimeOfflineData): Promise<void> {
    let collectionData = this.map.get(collection);
    if (collectionData == null) {
      collectionData = new Map<string, RealtimeOfflineData>();
      this.map.set(collection, collectionData);
    }
    collectionData.set(offlineData.id, offlineData);
    return Promise.resolve();
  }

  putData(collection: string, data: OfflineData): Promise<OfflineData> {
    let collectionData = this.offlineDataMap.get(collection);
    if (collectionData == null) {
      collectionData = new Map<string, OfflineData>();
      this.offlineDataMap.set(collection, collectionData);
    }
    collectionData.set(data.id, data);
    return Promise.resolve(data);
  }

  delete(collection: string, id: string): Promise<void> {
    const collectionData = this.map.get(collection);
    if (collectionData != null) {
      collectionData.delete(id);
    }
    return Promise.resolve();
  }

  deleteData(collection: string, dataId: string): Promise<void> {
    const collectionData = this.offlineDataMap.get(collection);
    if (collectionData != null) {
      collectionData.delete(dataId);
    }
    return Promise.resolve();
  }

  deleteDB(): Promise<void> {
    this.map.clear();
    return Promise.resolve();
  }
}
