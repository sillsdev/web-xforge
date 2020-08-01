import merge from 'lodash/merge';
import * as OTJson0 from 'ot-json0';
import { MemoryOfflineStore } from './memory-offline-store';
import { MemoryRealtimeQueryAdapter, MemoryRealtimeRemoteStore } from './memory-realtime-remote-store';
import { FileOfflineData, FileType } from './models/file-offline-data';
import { Snapshot } from './models/snapshot';
import { RealtimeService } from './realtime.service';
import { objectId } from './utils';

function addSnapshotDefaults(snapshot: Partial<Snapshot>): Snapshot {
  if (snapshot.id == null) {
    snapshot.id = objectId();
  }
  if (snapshot.data == null) {
    snapshot.data = {};
  }
  if (snapshot.v == null) {
    snapshot.v = 0;
  }
  if (snapshot.type == null) {
    snapshot.type = OTJson0.type.name;
  }
  return snapshot as Snapshot;
}

/**
 * This is a memory-based implementation of the real-time service. It is useful for testing.
 */
export class TestRealtimeService extends RealtimeService {
  addSnapshots<T>(collection: string, snapshots: Partial<Snapshot<T>>[], addToOfflineStore: boolean = false): void {
    for (const snapshot of snapshots) {
      this.addSnapshot(collection, snapshot, addToOfflineStore);
    }
  }

  addSnapshot<T>(collection: string, snapshot: Partial<Snapshot<T>>, addToOfflineStore: boolean = false): void {
    const completeSnapshot = addSnapshotDefaults(snapshot);
    (this.remoteStore as MemoryRealtimeRemoteStore).addSnapshot(collection, completeSnapshot);
    if (addToOfflineStore) {
      (this.offlineStore as MemoryOfflineStore).addData(collection, merge(completeSnapshot, { pendingOps: [] }));
    }
  }

  addFileData(fileType: FileType, data: FileOfflineData): void {
    (this.offlineStore as MemoryOfflineStore).addData(fileType, data);
  }

  getFileData(fileType: FileType, id: string): FileOfflineData | undefined {
    return (this.offlineStore as MemoryOfflineStore).getData(fileType, id);
  }

  updateAllSubscribeQueries(): void {
    for (const collectionQueries of this.subscribeQueries.values()) {
      for (const query of collectionQueries) {
        (query.adapter as MemoryRealtimeQueryAdapter).updateResults();
      }
    }
  }
}
