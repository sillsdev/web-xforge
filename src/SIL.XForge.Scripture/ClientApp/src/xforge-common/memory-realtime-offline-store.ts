import merge from 'lodash/merge';
import { Snapshot } from './models/snapshot';
import { RealtimeOfflineData, RealtimeOfflineStore } from './realtime-offline-store';

/**
 * This class is a memory-based implementation of the real-time offline store. It is useful for testing.
 */
export class MemoryRealtimeOfflineStore extends RealtimeOfflineStore {
  private readonly map = new Map<string, Map<string, RealtimeOfflineData>>();

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

  put(collection: string, offlineData: RealtimeOfflineData): Promise<void> {
    let collectionData = this.map.get(collection);
    if (collectionData == null) {
      collectionData = new Map<string, RealtimeOfflineData>();
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
