import { Injectable } from '@angular/core';
import { merge } from 'lodash-es';
import * as OTJson0 from 'ot-json0';
import { MemoryOfflineStore } from './memory-offline-store';
import {
  MemoryRealtimeDocAdapter,
  MemoryRealtimeQueryAdapter,
  MemoryRealtimeRemoteStore
} from './memory-realtime-remote-store';
import { FileOfflineData, FileType } from './models/file-offline-data';
import { Snapshot } from './models/snapshot';
import { RealtimeService } from './realtime.service';
import { objectId } from './utils';

function addSnapshotDefaults(snapshot: Partial<Snapshot>): Snapshot {
  snapshot.id ??= objectId();
  snapshot.data ??= {};
  snapshot.v ??= 0;
  snapshot.type ??= OTJson0.type.name;
  return snapshot as Snapshot;
}

/**
 * This is a memory-based implementation of the real-time service. It is useful for testing.
 */
@Injectable({
  providedIn: 'root'
})
export class TestRealtimeService extends RealtimeService {
  set offlineStorageQuotaStatus(isFull: boolean) {
    (this.offlineStore as MemoryOfflineStore).storageQuotaFull = isFull;
  }

  addSnapshots<T>(collection: string, snapshots: Partial<Snapshot<T>>[], addToOfflineStore: boolean = false): void {
    for (const snapshot of snapshots) {
      this.addSnapshot(collection, snapshot, addToOfflineStore);
    }
  }

  /** Write a realtime doc into the store, for a given collection. An existing realtime doc with the same id is
   * overwritten. */
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

  updateQueryAdaptersRemote(): void {
    for (const collectionQueries of this.subscribeQueries.values()) {
      for (const query of collectionQueries) {
        (query.adapter as MemoryRealtimeQueryAdapter).updateResults();
      }
    }
  }

  /** Intended to do the same thing as `updateQueryAdaptersRemote` but without remoteChanges$ emitting, which can be
   * done in follow up. */
  updateQueryAdaptersRemoteQuietly(): MemoryRealtimeQueryAdapter[] {
    const adaptersToEmit: MemoryRealtimeQueryAdapter[] = [];
    for (const collectionQueries of this.subscribeQueries.values()) {
      for (const query of collectionQueries) {
        const adapter = query.adapter as MemoryRealtimeQueryAdapter;
        if ((adapter as any).performQuery()) {
          adaptersToEmit.push(adapter);
        }
      }
    }
    return adaptersToEmit;
  }

  /** Simulate a change happening externally. The MemoryRealtimeDocAdapter data and MemoryRealtimeQueryAdapter results
   * are updated before changes are announced, so when changes begin to be announced, the docs and queries are all
   * up-to-date. The order of emits, and presence or absence of RealtimeQuery.remoteDocChanges$, may be different than
   * when running the app. */
  async simulateRemoteChange(docAdapter: MemoryRealtimeDocAdapter, ops: any): Promise<void> {
    // Submitting ops to the realtime doc adapter to simulate writing data on a remote server may seem backwards but
    // is getting the job done.
    docAdapter.submitOpWithoutEmitting(ops);
    const queryAdaptersToEmit: MemoryRealtimeQueryAdapter[] = this.updateQueryAdaptersRemoteQuietly();
    docAdapter.emitChange(ops);
    docAdapter.emitRemoteChange(ops);
    for (const adapter of queryAdaptersToEmit) {
      adapter.remoteChanges$.next();
    }
  }

  async updateQueriesLocal(): Promise<void> {
    for (const collectionQueries of this.subscribeQueries.values()) {
      for (const query of collectionQueries) {
        await query.fetch();
        await query.localUpdate();
      }
    }
  }
}
