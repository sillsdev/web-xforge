import { Injectable } from '@angular/core';
import { RecordIdentity } from '@orbit/data';
import { clone } from '@orbit/utils';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { Connection, Query } from 'sharedb/lib/client';
import { environment } from '../environments/environment';
import { LocationService } from './location.service';
import { DomainModel } from './models/domain-model';
import { RealtimeDoc } from './models/realtime-doc';
import { SharedbRealtimeDocAdapter } from './realtime-doc-adapter';
import { RealtimeOfflineStore } from './realtime-offline-store';
import { getCollectionName } from './utils';

function serializeRecordIdentity(identity: RecordIdentity): string {
  return `${identity.type}:${identity.id}`;
}

export interface RealtimeQueryResults<T extends RealtimeDoc> {
  docs: T[];
  totalPagedCount?: number;
}

export interface QueryParameters {
  sort?: any;
  skip?: number;
  limit?: number;
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
  private readonly docs = new Map<string, RealtimeDoc>();
  private store: RealtimeOfflineStore;
  private accessToken: string;

  constructor(private readonly domainModel: DomainModel, private readonly locationService: LocationService) {}

  async init(accessToken: string, deleteStore: boolean): Promise<void> {
    this.store = new RealtimeOfflineStore(this.domainModel);
    if (deleteStore) {
      await this.deleteStore();
    }
    this.accessToken = accessToken;
    this.ws = new ReconnectingWebSocket(() => this.getUrl());
    this.connection = new Connection(this.ws);
  }

  async deleteStore(): Promise<void> {
    if (this.store != null) {
      await this.store.deleteDB();
    }
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
    const key = serializeRecordIdentity(identity);
    let doc = this.docs.get(key);
    if (doc == null) {
      doc = this.createDoc(identity);
      this.docs.set(key, doc);
    }
    await doc.subscribe();
    return doc as T;
  }

  async onlineQuery<T extends RealtimeDoc>(
    type: string,
    query: any,
    parameters: QueryParameters = {}
  ): Promise<RealtimeQueryResults<T>> {
    const collection = getCollectionName(type);
    const resultsQuery = clone(query);
    if (parameters.sort != null) {
      resultsQuery.$sort = parameters.sort;
    }
    if (parameters.skip != null) {
      resultsQuery.$skip = parameters.skip;
    }
    if (parameters.limit != null) {
      resultsQuery.$limit = parameters.limit;
    }
    const countQuery = clone(query);
    countQuery.$count = { applySkipLimit: false };
    const [countQueryObj, resultsQueryObj] = await Promise.all([
      this.createFetchQuery(collection, countQuery),
      this.createFetchQuery(collection, resultsQuery)
    ]);
    const RealtimeDocType = this.domainModel.getRealtimeDocType(type);
    const docs: T[] = [];
    for (const shareDoc of resultsQueryObj.results) {
      const key = serializeRecordIdentity({ type, id: shareDoc.id });
      let doc = this.docs.get(key);
      if (doc == null) {
        doc = new RealtimeDocType(new SharedbRealtimeDocAdapter(shareDoc), this.store);
        this.docs.set(key, doc);
      }
      docs.push(doc as T);
    }
    return { docs, totalPagedCount: countQueryObj.extra };
  }

  /**
   * Deletes all real-time docs from local storage for a specified type and project.
   *
   * @param {string} type The doc type.
   * @param {string} projectId The project id.
   * @returns {Promise<void>} Resolves when the data has been deleted.
   */
  async localDeleteProjectDocs(type: string, projectId: string): Promise<void> {
    const tasks: Promise<void>[] = [];
    for (const identity of await this.store.keys(type)) {
      if (identity.id.startsWith(projectId)) {
        tasks.push(this.store.delete(identity));
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

  private createDoc(identity: RecordIdentity): RealtimeDoc {
    const collection = getCollectionName(identity.type);
    const sharedbDoc = this.connection.get(collection, identity.id);
    const RealtimeDocType = this.domainModel.getRealtimeDocType(identity.type);
    return new RealtimeDocType(new SharedbRealtimeDocAdapter(sharedbDoc), this.store);
  }

  private createFetchQuery(collection: string, query: any): Promise<Query> {
    return new Promise<Query>((resolve, reject) => {
      const queryObj = this.connection.createFetchQuery(collection, query, {}, (err, results) => {
        if (err != null) {
          reject(err);
        } else {
          resolve(queryObj);
        }
      });
    });
  }
}
