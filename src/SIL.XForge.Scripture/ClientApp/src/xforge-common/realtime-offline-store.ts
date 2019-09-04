import { Snapshot } from 'sharedb/lib/client';
import { RealtimeDocTypes } from './realtime-doc-types';

const DATABASE_NAME = 'xforge';

/** Structure of a record in the xforge-realtime IndexedDB database. */
export interface RealtimeOfflineData {
  id: string;
  snapshot: Snapshot;
  pendingOps: any[];
}

/**
 * This class is an abstraction for the offline storage of realtime documents. The implementation uses the Orbit
 * IndexedDB source. This abstraction can be mocked for easier unit testing.
 */
export class RealtimeOfflineStore {
  private openDBPromise: Promise<void>;
  private db: IDBDatabase;

  constructor(private readonly domainModel: RealtimeDocTypes) {}

  async getAllIds(collection: string): Promise<string[]> {
    await this.openDB();
    return await new Promise<string[]>((resolve, reject) => {
      const transaction = this.db.transaction(collection);
      const objectStore = transaction.objectStore(collection);

      const request = objectStore.getAllKeys();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result.map(k => k.toString()));
    });
  }

  async get(collection: string, id: string): Promise<RealtimeOfflineData> {
    await this.openDB();
    return await new Promise<RealtimeOfflineData>((resolve, reject) => {
      const transaction = this.db.transaction(collection);
      const objectStore = transaction.objectStore(collection);

      const request = objectStore.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async put(collection: string, offlineData: RealtimeOfflineData): Promise<void> {
    await this.openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = this.db.transaction(collection, 'readwrite');
      const objectStore = transaction.objectStore(collection);

      const request = objectStore.put(offlineData);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.openDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = this.db.transaction(collection, 'readwrite');
      const objectStore = transaction.objectStore(collection);

      const request = objectStore.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async deleteDB(): Promise<void> {
    await this.closeDB();
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase(DATABASE_NAME);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private openDB(): Promise<void> {
    if (this.openDBPromise != null) {
      return this.openDBPromise;
    }
    this.openDBPromise = new Promise<void>((resolve, reject) => {
      if (!window.indexedDB) {
        return reject(new Error('IndexedDB is not avilable in this browser. Please use a different browser.'));
      }
      const request = window.indexedDB.open(DATABASE_NAME);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        // close on version change so we don't block the deletion of the database from a different tab/window
        this.db.onversionchange = () => this.closeDB();
        resolve();
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        for (const collection of this.domainModel.collections) {
          db.createObjectStore(collection, { keyPath: 'id' });
        }
      };
    });
    return this.openDBPromise;
  }

  private async closeDB(): Promise<void> {
    if (this.openDBPromise != null) {
      await this.openDBPromise;
      this.db.close();
      this.db = undefined;
      this.openDBPromise = undefined;
    }
  }
}
