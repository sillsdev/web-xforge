import { Injectable } from '@angular/core';
import isObjectLike from 'lodash-es/isObjectLike';
import { environment } from '../environments/environment';
import { OfflineData, OfflineStore } from './offline-store';
import { Filter, performQuery, QueryParameters, QueryResults } from './query-parameters';
import { TypeRegistry } from './type-registry';

const DATABASE_NAME = 'xforge';

function getAllFromCursor<T extends OfflineData>(
  store: IDBObjectStore | IDBIndex,
  query?: IDBValidKey | IDBKeyRange
): Promise<T[]> {
  return new Promise<T[]>((resolve, reject) => {
    const request = store.getAll(query);
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

function createObjectStore(db: IDBDatabase, collection: string, indexPaths?: string[]): void {
  const objectStore = db.createObjectStore(collection, { keyPath: 'id' });
  if (indexPaths != null) {
    for (const path of indexPaths) {
      objectStore.createIndex(path, `data.${path}`);
    }
  }
}

/**
 * This class is an IndexedDB-based implementation of the real-time offline store.
 */
@Injectable({
  providedIn: 'root'
})
export class IndexeddbOfflineStore extends OfflineStore {
  private openDBPromise?: Promise<IDBDatabase>;

  constructor(private readonly typeRegistry: TypeRegistry) {
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

  async getAll<T extends OfflineData>(collection: string): Promise<T[]> {
    const db = await this.openDB();

    const transaction = db.transaction(collection);
    const objectStore = transaction.objectStore(collection);

    return await getAllFromCursor(objectStore);
  }

  async get<T extends OfflineData>(collection: string, id: string): Promise<T | undefined> {
    const db = await this.openDB();

    const transaction = db.transaction(collection);
    const objectStore = transaction.objectStore(collection);

    return await new Promise<T>((resolve, reject) => {
      const request = objectStore.get(id);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async query<T extends OfflineData>(collection: string, parameters: QueryParameters): Promise<QueryResults<T>> {
    const db = await this.openDB();
    const transaction = db.transaction(collection);
    const objectStore = transaction.objectStore(collection);
    let snapshots: T[] | undefined;
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

  async put(collection: string, offlineData: OfflineData): Promise<void> {
    const db = await this.openDB();

    const transaction = db.transaction(collection, 'readwrite');
    const objectStore = transaction.objectStore(collection);

    await new Promise<void>((resolve, reject) => {
      const request = objectStore.put(offlineData);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      // The transaction is aborted if the storage quota has been exceeded. We want to handle that if it happens.
      transaction.onabort = event => {
        const target = event.target! as IDBTransaction;
        reject(target.error);
      };
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
        const storeNames = db.objectStoreNames;
        for (const docType of this.typeRegistry.docTypes) {
          if (!storeNames.contains(docType.COLLECTION)) {
            createObjectStore(db, docType.COLLECTION, docType.INDEX_PATHS);
          }
        }
        for (const fileType of this.typeRegistry.fileTypes) {
          if (!storeNames.contains(fileType)) {
            createObjectStore(db, fileType);
          }
        }
        for (const featureType of this.typeRegistry.customTypes) {
          if (!storeNames.contains(featureType)) {
            createObjectStore(db, featureType);
          }
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
