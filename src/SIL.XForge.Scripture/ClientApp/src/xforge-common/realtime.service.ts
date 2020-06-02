import { Injectable } from '@angular/core';
import { RealtimeDoc } from './models/realtime-doc';
import { RealtimeQuery } from './models/realtime-query';
import { QueryParameters } from './query-parameters';
import { RealtimeDocTypes } from './realtime-doc-types';
import { RealtimeOfflineStore } from './realtime-offline-store';
import { RealtimeRemoteStore } from './realtime-remote-store';

function getDocKey(collection: string, id: string): string {
  return `${collection}:${id}`;
}

/**
 * The realtime service is responsible for retrieving and mutating realtime data models. This service transparently
 * manages the interaction between three data sources: a memory cache, a local database (IndexedDB), and a realtime
 * collaboration server (ShareDB).
 */
@Injectable({
  providedIn: 'root'
})
export class RealtimeService {
  protected readonly docs = new Map<string, RealtimeDoc>();
  protected readonly subscribeQueries = new Map<string, Set<RealtimeQuery>>();

  constructor(
    private readonly docTypes: RealtimeDocTypes,
    public readonly remoteStore: RealtimeRemoteStore,
    public readonly offlineStore: RealtimeOfflineStore
  ) {}

  get<T extends RealtimeDoc>(collection: string, id: string): T {
    const key = getDocKey(collection, id);
    let doc = this.docs.get(key);
    if (doc == null) {
      const RealtimeDocType = this.docTypes.getDocType(collection);
      if (RealtimeDocType == null) {
        throw new Error('The collection is unknown.');
      }
      doc = new RealtimeDocType(this, this.remoteStore.createDocAdapter(collection, id));
      this.docs.set(key, doc);
    }
    return doc as T;
  }

  createQuery<T extends RealtimeDoc>(collection: string, parameters: QueryParameters): RealtimeQuery<T> {
    return new RealtimeQuery<T>(this, this.remoteStore.createQueryAdapter(collection, parameters));
  }

  isSet<T extends RealtimeDoc>(collection: string, id: string): boolean {
    return this.docs.get(getDocKey(collection, id)) != null;
  }

  /**
   * Gets the real-time doc with the specified id and subscribes to remote changes.
   *
   * @param {string} collection The collection name.
   * @param {string} id The id.
   * @returns {Promise<T>} The real-time doc.
   */
  async subscribe<T extends RealtimeDoc>(collection: string, id: string): Promise<T> {
    const doc = this.get<T>(collection, id);
    await doc.subscribe();
    return doc;
  }

  async onlineFetch<T extends RealtimeDoc>(collection: string, id: string): Promise<T> {
    const doc = this.get<T>(collection, id);
    await doc.onlineFetch();
    return doc;
  }

  /**
   * Creates a real-time doc with the specified id and data.
   *
   * @param {string} collection The collection name.
   * @param {string} id The id.
   * @param {*} data The initial data.
   * @returns {Promise<T>} The newly created real-time doc.
   */
  async create<T extends RealtimeDoc>(collection: string, id: string, data: any): Promise<T> {
    const doc = this.get<T>(collection, id);
    await doc.create(data);
    return doc;
  }

  /**
   * Performs an optimistic query on the specified collection and subscribes to any remote changes to both the results
   * and the individual docs.
   *
   * @param {string} collection The collection name.
   * @param {QueryParameters} parameters The query parameters.
   * See https://github.com/share/sharedb-mongo#queries.
   * @returns {Promise<RealtimeQuery<T>>} The query.
   */
  async subscribeQuery<T extends RealtimeDoc>(
    collection: string,
    parameters: QueryParameters
  ): Promise<RealtimeQuery<T>> {
    const query = this.createQuery<T>(collection, parameters);
    await query.subscribe();
    return query;
  }

  /**
   * Performs a pessimistic query on the specified collection. The returned query is not notified of any changes.
   *
   * @param {string} collection The collection name.
   * @param {QueryParameters} parameters The query parameters.
   * See https://github.com/share/sharedb-mongo#queries.
   * @returns {Promise<RealtimeQuery<T>>} The query.
   */
  async onlineQuery<T extends RealtimeDoc>(collection: string, parameters: QueryParameters): Promise<RealtimeQuery<T>> {
    const query = this.createQuery<T>(collection, parameters);
    await query.fetch();
    return query;
  }

  onQuerySubscribe(query: RealtimeQuery): void {
    let collectionQueries = this.subscribeQueries.get(query.collection);
    if (collectionQueries == null) {
      collectionQueries = new Set<RealtimeQuery>();
      this.subscribeQueries.set(query.collection, collectionQueries);
    }
    collectionQueries.add(query);
  }

  onQueryUnsubscribe(query: RealtimeQuery): void {
    const collectionQueries = this.subscribeQueries.get(query.collection);
    if (collectionQueries != null) {
      collectionQueries.delete(query);
    }
  }

  async onLocalDocUpdate(doc: RealtimeDoc): Promise<void> {
    const collectionQueries = this.subscribeQueries.get(doc.collection);
    if (collectionQueries != null) {
      const promises: Promise<void>[] = [];
      for (const query of collectionQueries) {
        promises.push(query.localUpdate());
      }
      await Promise.all(promises);
    }
  }

  async onLocalDocDispose(doc: RealtimeDoc): Promise<void> {
    if (this.isSet(doc.collection, doc.id)) {
      await this.offlineStore.delete(doc.collection, doc.id);
      this.docs.delete(getDocKey(doc.collection, doc.id));
    }
  }
}
