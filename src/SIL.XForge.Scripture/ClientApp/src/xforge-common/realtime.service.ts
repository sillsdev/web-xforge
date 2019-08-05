import { Injectable } from '@angular/core';
import cloneDeep from 'lodash/cloneDeep';
import ReconnectingWebSocket from 'reconnecting-websocket';
import { Connection, Query } from 'sharedb/lib/client';
import { environment } from '../environments/environment';
import { LocationService } from './location.service';
import { DomainModel } from './models/domain-model';
import { RealtimeDoc } from './models/realtime-doc';
import { SharedbRealtimeDocAdapter } from './realtime-doc-adapter';
import { RealtimeOfflineStore } from './realtime-offline-store';
import { getCollectionName } from './utils';

function getDocKey(type: string, id: string): string {
  return `${type}:${id}`;
}

export interface QueryResults<T extends RealtimeDoc> {
  docs: T[];
  totalPagedCount: number;
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
  async get<T extends RealtimeDoc>(type: string, id: string): Promise<T> {
    const key = getDocKey(type, id);
    let doc = this.docs.get(key);
    if (doc == null) {
      doc = this.createDoc(type, id);
      this.docs.set(key, doc);
    }
    await doc.subscribe();
    return doc as T;
  }

  async onlineQuery<T extends RealtimeDoc>(
    type: string,
    query: any,
    parameters: QueryParameters = {}
  ): Promise<QueryResults<T>> {
    const collection = getCollectionName(type);
    const resultsQueryParams = cloneDeep(query);
    if (parameters.sort != null) {
      resultsQueryParams.$sort = parameters.sort;
    }
    let getCount = false;
    if (parameters.skip != null) {
      resultsQueryParams.$skip = parameters.skip;
      getCount = true;
    }
    if (parameters.limit != null) {
      resultsQueryParams.$limit = parameters.limit;
      getCount = true;
    }
    const queryPromises: Promise<Query>[] = [];
    queryPromises.push(this.createFetchQuery(collection, resultsQueryParams));
    if (getCount) {
      const countQueryParams = cloneDeep(query);
      countQueryParams.$count = { applySkipLimit: false };
      queryPromises.push(this.createFetchQuery(collection, countQueryParams));
    }
    const queries = await Promise.all(queryPromises);
    const resultsQuery = queries[0];
    const RealtimeDocType = this.domainModel.getRealtimeDocType(type);
    const docs: T[] = [];
    for (const shareDoc of resultsQuery.results) {
      const key = getDocKey(type, shareDoc.id);
      let doc = this.docs.get(key);
      if (doc == null) {
        doc = new RealtimeDocType(new SharedbRealtimeDocAdapter(this.connection, collection, shareDoc), this.store);
        this.docs.set(key, doc);
      }
      docs.push(doc as T);
    }
    return { docs, totalPagedCount: queries.length === 2 ? queries[1].extra : docs.length };
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

  private createDoc(type: string, id: string): RealtimeDoc {
    const collection = getCollectionName(type);
    const sharedbDoc = this.connection.get(collection, id);
    const RealtimeDocType = this.domainModel.getRealtimeDocType(type);
    return new RealtimeDocType(new SharedbRealtimeDocAdapter(this.connection, collection, sharedbDoc), this.store);
  }

  private createFetchQuery(collection: string, query: any): Promise<Query> {
    return new Promise<Query>((resolve, reject) => {
      const queryObj = this.connection.createFetchQuery(collection, query, {}, err => {
        if (err != null) {
          reject(err);
        } else {
          resolve(queryObj);
        }
      });
    });
  }
}
