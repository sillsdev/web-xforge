import { Injectable } from '@angular/core';
import { RecordIdentity } from '@orbit/data';
import { underscore } from '@orbit/utils';
import * as localforage from 'localforage';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { Connection } from 'sharedb/lib/client';
import { environment } from '../environments/environment';
import { LocationService } from './location.service';
import { DomainModel } from './models/domain-model';
import { RealtimeDoc } from './models/realtime-doc';
import { SharedbRealtimeDocAdapter } from './realtime-doc-adapter';
import { RealtimeOfflineStore } from './realtime-offline-store';

function serializeRecordIdentity(identity: RecordIdentity): string {
  return `${identity.type}:${identity.id}`;
}

/**
 * The realtime service is responsible for retrieving realtime data models. This service transparently manages the
 * interaction between three data sources: a memory cache, an IndexedDB database, and a realtime collaboration server
 * (ShareDB). Models are cached and reused until the service is reset.
 */
@Injectable({
  providedIn: 'root'
})
export class RealtimeService {
  private ws: ReconnectingWebSocket;
  private connection: Connection;
  private readonly docs = new Map<string, Promise<RealtimeDoc>>();
  private readonly stores = new Map<string, RealtimeOfflineStore>();
  private resetPromise: Promise<void> = Promise.resolve();
  private accessToken: string;

  constructor(private readonly domainModel: DomainModel, private readonly locationService: LocationService) {}

  init(accessToken: string): void {
    this.accessToken = accessToken;
    this.ws = new ReconnectingWebSocket(() => this.getUrl());
    this.connection = new Connection(this.ws);
  }

  setAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
  }

  /**
   * Gets the real-time data with the specified identity. It is not necessary to subscribe to the returned model.
   *
   * @param {RecordIdentity} identity The data identity.
   * @returns {Promise<T>} The realtime data.
   */
  async get<T extends RealtimeDoc>(identity: RecordIdentity): Promise<T> {
    // wait for pending reset to complete before getting data
    await this.resetPromise;
    const key = serializeRecordIdentity(identity);
    let dataPromise = this.docs.get(key);
    if (dataPromise == null) {
      dataPromise = this.createDoc(identity);
      this.docs.set(key, dataPromise);
    }
    return await (dataPromise as Promise<T>);
  }

  /**
   * Resets the realtime data cache.
   */
  reset(): void {
    if (this.docs.size > 0) {
      this.resetPromise = this.clearDataMap();
    }
  }

  /**
   * Deletes all real-time docs from local storage for a specified type and project.
   *
   * @param {string} type The doc type.
   * @param {string} projectId The project id.
   * @returns {Promise<void>} Resolves when the data has been deleted.
   */
  async localDeleteProjectDocs(type: string, projectId: string): Promise<void> {
    const store = this.getStore(type);

    const tasks: Promise<void>[] = [];
    for (const id of await store.keys()) {
      if (id.startsWith(projectId)) {
        tasks.push(store.delete(id));
      }
    }
    await Promise.all(tasks);
  }

  private getUrl(): string {
    const protocol = this.locationService.protocol === 'https:' ? 'wss:' : 'ws:';
    let url = `${protocol}//${this.locationService.hostname}`;
    if ('realtimePort' in environment && environment.realtimePort != null && environment.realtimePort !== 0) {
      url += `:${environment.realtimePort}`;
    }
    url += environment.realtimeUrl + '?access_token=' + this.accessToken;
    return url;
  }

  private getStore(type: string): RealtimeOfflineStore {
    if (!this.stores.has(type)) {
      this.stores.set(
        type,
        new RealtimeOfflineStore(localforage.createInstance({ name: 'xforge-realtime', storeName: type }))
      );
    }
    return this.stores.get(type);
  }

  private async createDoc(identity: RecordIdentity): Promise<RealtimeDoc> {
    let collection = underscore(identity.type) + '_data';
    if (identity.type === 'project') {
      collection = environment.prefix + '_' + collection;
    }
    const sharedbDoc = this.connection.get(collection, identity.id);
    const store = this.getStore(identity.type);
    const RealtimeDocType = this.domainModel.getRealtimeDocType(identity.type);
    const realtimeDoc = new RealtimeDocType(new SharedbRealtimeDocAdapter(sharedbDoc), store);
    await realtimeDoc.subscribe();
    return realtimeDoc;
  }

  private async clearDataMap(): Promise<void> {
    const disposePromises: Promise<void>[] = [];
    for (const dataPromise of this.docs.values()) {
      disposePromises.push(this.disposeData(dataPromise));
    }
    this.docs.clear();
    await Promise.all(disposePromises);
  }

  private async disposeData(dataPromise: Promise<RealtimeDoc>): Promise<void> {
    const data = await dataPromise;
    await data.dispose();
  }
}
