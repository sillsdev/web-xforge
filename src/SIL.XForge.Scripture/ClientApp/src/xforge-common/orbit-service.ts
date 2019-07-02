import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import Coordinator, { LogTruncationStrategy } from '@orbit/coordinator';
import { Schema, SchemaSettings } from '@orbit/data';
import { XForgeIndexedDBBucket } from './indexeddb/xforge-indexeddb-bucket';
import { XForgeIndexedDBSource } from './indexeddb/xforge-indexeddb-source';
import { XForgeJSONAPISource } from './jsonapi/xforge-jsonapi-source';
import { LocationService } from './location.service';
import { XForgeStore } from './store/xforge-store';
import { RemotePullFailStrategy } from './strategies/remote-pull-fail-strategy';
import { RemotePushFailStrategy } from './strategies/remote-push-fail-strategy';
import { RemoteStoreSyncStrategy } from './strategies/remote-store-sync-strategy';
import { StoreBackupSyncStrategy } from './strategies/store-backup-sync-strategy';
import { StoreRemoteQueryStrategy } from './strategies/store-remote-query-strategy';
import { StoreRemoteUpdateStrategy } from './strategies/store-remote-update-strategy';
import { objectId } from './utils';

const STORE = 'store';
const REMOTE = 'remote';
const BACKUP = 'backup';
const NAMESPACE = 'json-api';

/**
 * This service is reponsible for initializing the Orbit store and making it available to other services. This service
 * can be mocked so that a memory-only store is provided. This makes it easier to write unit tests for services that are
 * dependent on Orbit.
 */
@Injectable({
  providedIn: 'root'
})
export class OrbitService {
  private _schema: Schema;

  private _store: XForgeStore;

  private bucket: XForgeIndexedDBBucket;
  private remote: XForgeJSONAPISource;
  private backup: XForgeIndexedDBSource;
  private coordinator: Coordinator;

  constructor(private readonly http: HttpClient, private readonly locationService: LocationService) {}

  get schema(): Schema {
    return this._schema;
  }

  get store(): XForgeStore {
    return this._store;
  }

  /**
   * Initializes the service. This should be called at application startup after the user has logged in.
   *
   * @param {string} accessToken The user's current access token.
   */
  async init(accessToken: string, deleteStore: boolean): Promise<void> {
    const schemaDef = await this.http
      .get<SchemaSettings>(`${NAMESPACE}/schema`, { headers: { 'Content-Type': 'application/json' } })
      .toPromise();
    schemaDef.generateId = () => objectId();
    this._schema = new Schema(schemaDef);

    this.bucket = new XForgeIndexedDBBucket({
      namespace: 'xforge-state'
    });

    this._store = new XForgeStore({
      schema: this._schema,
      bucket: this.bucket
    });

    this.remote = new XForgeJSONAPISource({
      schema: this._schema,
      bucket: this.bucket,
      name: REMOTE,
      host: this.locationService.origin,
      namespace: NAMESPACE
    });

    this.backup = new XForgeIndexedDBSource({
      schema: this._schema,
      bucket: this.bucket,
      name: BACKUP,
      namespace: 'xforge'
    });

    if (deleteStore) {
      await this.deleteStore();
    }

    this.coordinator = new Coordinator({
      sources: [this._store, this.remote, this.backup],
      strategies: [
        // Handle a pull failure
        new RemotePullFailStrategy(REMOTE),
        // Handle a push failure
        new RemotePushFailStrategy(REMOTE, STORE),
        // Query the remote server whenever the store is queried
        new StoreRemoteQueryStrategy(STORE, REMOTE),
        // Update the remote server whenever the store is updated
        new StoreRemoteUpdateStrategy(STORE, REMOTE),
        // Sync all changes received from the remote server to the store
        new RemoteStoreSyncStrategy(REMOTE, STORE),
        // Sync the store to IndexedDB
        new StoreBackupSyncStrategy(STORE, BACKUP),
        new LogTruncationStrategy()
      ]
    });

    this.setAccessToken(accessToken);

    // restore backup
    const transforms = await this.backup.pull(q => q.findRecords());
    await this._store.sync(transforms);
    await this.coordinator.activate();
  }

  /**
   * Updates the access token. This should be called when the access token is refreshed.
   *
   * @param {string} accessToken The user's current access token.
   */
  setAccessToken(accessToken: string): void {
    const headerValue = 'Bearer ' + accessToken;
    this.remote.defaultFetchSettings.headers['Authorization'] = headerValue;
  }

  resourceUrl(type: string, id?: string): string {
    let url = this.remote.resourceURL(type, id);
    if (url.startsWith(this.locationService.origin)) {
      url = url.substring(this.locationService.origin.length + 1);
    }
    return url;
  }

  async deleteStore(): Promise<void> {
    if (this.bucket != null) {
      await this.bucket.deleteDB();
    }
    if (this.backup != null) {
      await this.backup.deleteDB();
    }
  }
}
