import { MemoryRealtimeOfflineStore } from './memory-realtime-offline-store';
import { MemoryRealtimeRemoteStore } from './memory-realtime-remote-store';
import { RealtimeDocConstructor } from './models/realtime-doc';
import { Snapshot } from './models/snapshot';
import { RealtimeDocTypes } from './realtime-doc-types';
import { RealtimeService } from './realtime.service';

/**
 * This is a memory-based implementation of the real-time service. It is useful for testing.
 */
export class TestRealtimeService extends RealtimeService {
  constructor(docTypes: RealtimeDocConstructor[] | RealtimeDocTypes) {
    super(
      docTypes instanceof RealtimeDocTypes ? docTypes : new RealtimeDocTypes(docTypes),
      new MemoryRealtimeRemoteStore(),
      new MemoryRealtimeOfflineStore()
    );
  }

  addSnapshots<T>(collection: string, snapshots: Partial<Snapshot<T>>[]): void {
    (this.remoteStore as MemoryRealtimeRemoteStore).addSnapshots(collection, snapshots);
  }

  addSnapshot<T>(collection: string, snapshot: Partial<Snapshot<T>>): void {
    (this.remoteStore as MemoryRealtimeRemoteStore).addSnapshot(collection, snapshot);
  }
}
