import { Injectable } from '@angular/core';
import isObjectLike from 'lodash/isObjectLike';
import { environment } from '../environments/environment';
import { OfflineData } from './models/offline-data';
import { OfflineDataTypes } from './offline-data-types';
import { Filter, performQuery, QueryParameters } from './query-parameters';
import { RealtimeDocTypes } from './realtime-doc-types';
import { RealtimeOfflineData, RealtimeOfflineQueryResults, RealtimeOfflineStore } from './realtime-offline-store';
import { nameof } from './utils';

const DATABASE_NAME = 'xforge';

function getAllFromCursor(
  store: IDBObjectStore | IDBIndex,
  query?: IDBValidKey | IDBKeyRange
): Promise<RealtimeOfflineData[]> {
  return new Promise<RealtimeOfflineData[]>((resolve, reject) => {
    const results: RealtimeOfflineData[] = [];
    const request = store.openCursor(query);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor != null) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
  });
}

function getOfflineData<T extends OfflineData>(store: IDBObjectStore | IDBIndex): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function getKeyRange(filter: Filter): IDBKeyRange | undefined {
  if (filter === undefined) {
    return undefined;
  }

  if (isObjectLike(filter)) {
    if (filter['$eq'] !== undefined) {
      return IDBKeyRange.only(filter['$eq']);
    }
    return undefined;
  }
  return IDBKeyRange.only(filter);
}

/**
 * This class is an IndexedDB-based implementation of the real-time offline store.
 */
@Injectable({
  providedIn: 'root'
})
export class IndexeddbRealtimeOfflineStore extends RealtimeOfflineStore {
  private openDBPromise?: Promise<IDBDatabase>;

  constructor(private readonly domainModel: RealtimeDocTypes, private readonly offlineDataModel: OfflineDataTypes) {
    super();
  }

  async getAllIds(collection: string): Promise<string[]> {
    const db = await this.openDB();

    const transaction = db.transaction(collection);
    const objectStore = transaction.objectStore(collection);

    return await new Promise<string[]>((resolve, reject) => {
      const results: string[] = [];
      const request = objectStore.openKeyCursor();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor != null) {
          results.push(cursor.key.toString());
          cursor.continue();
        } else {
          resolve(results);
        }
      };
    });
  }

  async getAll(collection: string): Promise<RealtimeOfflineData[]> {
    const db = await this.openDB();

    const transaction = db.transaction(collection);
    const objectStore = transaction.objectStore(collection);

    return await getAllFromCursor(objectStore);
  }

  async getAllData<T extends OfflineData>(collection: string): Promise<T[]> {
    const db = await this.openDB();

    const transaction = db.transaction(collection);
    const objectStore = transaction.objectStore(collection);

    return await getOfflineData<T>(objectStore);
  }

  async get(collection: string, id: string): Promise<RealtimeOfflineData> {
    const db = await this.openDB();

    const transaction = db.transaction(collection);
    const objectStore = transaction.objectStore(collection);

    return await new Promise<RealtimeOfflineData>((resolve, reject) => {
      const request = objectStore.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getData<T extends OfflineData>(collection: string, dataId: string): Promise<T | undefined> {
    const db = await this.openDB();

    const transaction = db.transaction(collection);
    const objectStore = transaction.objectStore(collection);

    return await new Promise<T>((resolve, reject) => {
      const request = objectStore.get(dataId);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async query(collection: string, parameters: QueryParameters): Promise<RealtimeOfflineQueryResults> {
    const db = await this.openDB();
    const transaction = db.transaction(collection);
    const objectStore = transaction.objectStore(collection);
    let snapshots: RealtimeOfflineData[] | undefined;
    for (const key of Object.keys(parameters)) {
      if (objectStore.indexNames.contains(key)) {
        const filter = parameters[key] as Filter;
        const keyRange = getKeyRange(filter);
        if (keyRange !== undefined) {
          const index = objectStore.index(key);
          snapshots = await getAllFromCursor(index, keyRange);
          break;
        }
      }
    }
    if (snapshots == null) {
      snapshots = await this.getAll(collection);
    }
    return performQuery(parameters, snapshots);
  }

  async put(collection: string, offlineData: RealtimeOfflineData): Promise<void> {
    const db = await this.openDB();

    const transaction = db.transaction(collection, 'readwrite');
    const objectStore = transaction.objectStore(collection);

    await new Promise<void>((resolve, reject) => {
      const request = objectStore.put(offlineData);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async putData(collection: string, data: OfflineData): Promise<OfflineData | undefined> {
    const db = await this.openDB();
    const transaction = db.transaction(collection, 'readwrite');
    const objectStore = transaction.objectStore(collection);

    await new Promise<void>((resolve, reject) => {
      const request = objectStore.put(data);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    return await new Promise<OfflineData>((resolve, reject) => {
      const request = objectStore.get(data.id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async delete(collection: string, id: string): Promise<void> {
    const db = await this.openDB();

    const transaction = db.transaction(collection, 'readwrite');
    const objectStore = transaction.objectStore(collection);

    await new Promise<void>((resolve, reject) => {
      const request = objectStore.delete(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  deleteData(collection: string, dataId: string): Promise<void> {
    return this.delete(collection, dataId);
  }

  async deleteDB(): Promise<void> {
    await this.closeDB();
    await new Promise<void>((resolve, reject) => {
      const request = window.indexedDB.deleteDatabase(DATABASE_NAME);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private openDB(): Promise<IDBDatabase> {
    if (this.openDBPromise != null) {
      return this.openDBPromise;
    }
    this.openDBPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (!window.indexedDB) {
        return reject(new Error('IndexedDB is not available in this browser. Please use a different browser.'));
      }
      const request = window.indexedDB.open(DATABASE_NAME, environment.offlineDBVersion);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        // close on version change so we don't block the deletion of the database from a different tab/window
        db.onversionchange = () => this.closeDB();
        resolve(db);
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (db.objectStoreNames.length === 0) {
          for (const docType of this.domainModel.docTypes) {
            const objectStore = db.createObjectStore(docType.COLLECTION, { keyPath: 'id' });
            for (const path of docType.INDEX_PATHS) {
              objectStore.createIndex(path, `${nameof<RealtimeOfflineData>('data')}.${path}`);
            }
          }
        }
        // Create an audio store
        for (const dataType of this.offlineDataModel.dataTypes) {
          db.createObjectStore(dataType.COLLECTION, { keyPath: 'id' });
        }
      };
    });
    return this.openDBPromise;
  }

  private async closeDB(): Promise<void> {
    if (this.openDBPromise != null) {
      const db = await this.openDBPromise;
      db.close();
      this.openDBPromise = undefined;
    }
  }
}
