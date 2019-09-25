import * as OTJson0 from 'ot-json0';
import { MemoryRealtimeOfflineStore } from './memory-realtime-offline-store';
import { MemoryRealtimeQueryAdapter, MemoryRealtimeRemoteStore } from './memory-realtime-remote-store';
import { Snapshot } from './models/snapshot';
import { RealtimeDocTypes } from './realtime-doc-types';
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
  constructor(docTypes: RealtimeDocTypes) {
    super(docTypes, new MemoryRealtimeRemoteStore(), new MemoryRealtimeOfflineStore());
  }

  addSnapshots<T>(collection: string, snapshots: Partial<Snapshot<T>>[], addToOfflineStore: boolean = false): void {
    for (const snapshot of snapshots) {
      this.addSnapshot(collection, snapshot, addToOfflineStore);
    }
  }

  addSnapshot<T>(collection: string, snapshot: Partial<Snapshot<T>>, addToOfflineStore: boolean = false): void {
    const completeSnapshot = addSnapshotDefaults(snapshot);
    (this.remoteStore as MemoryRealtimeRemoteStore).addSnapshot(collection, completeSnapshot);
    if (addToOfflineStore) {
      (this.offlineStore as MemoryRealtimeOfflineStore).addSnapshot(collection, completeSnapshot);
    }
  }

  updateAllSubscribeQueries(): void {
    for (const collectionQueries of this.subscribeQueries.values()) {
      for (const query of collectionQueries) {
        (query.adapter as MemoryRealtimeQueryAdapter).updateResults();
      }
    }
  }
}
