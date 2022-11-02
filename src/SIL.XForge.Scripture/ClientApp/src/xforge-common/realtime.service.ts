import { Injectable, Optional } from '@angular/core';
import { AppError } from 'xforge-common/exception-handling-service';
import { FileService } from './file.service';
import { RealtimeDoc } from './models/realtime-doc';
import { RealtimeQuery } from './models/realtime-query';
import { OfflineStore } from './offline-store';
import { PwaService } from './pwa.service';
import { QueryParameters } from './query-parameters';
import { RealtimeRemoteStore } from './realtime-remote-store';
import { TypeRegistry } from './type-registry';

function getDocKey(collection: string, id: string): string {
  return `${collection}:${id}`;
}

type CollectionName = string;
type ShareDBAction = string;
const stats = new Map<ShareDBAction, Map<CollectionName, number>>();

function incrementMap(action: ShareDBAction, collection: CollectionName) {
  if (!stats.has(action)) stats.set(action, new Map());
  const map = stats.get(action)!;
  if (!map.has(collection)) map.set(collection, 0);
  map.set(collection, map.get(collection)! + 1);
}

window['showStats'] = () => {
  for (const [action, counts] of stats.entries()) {
    console.log(`Stats for ${action}`);
    console.log(counts);
  }
};

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
    private readonly typeRegistry: TypeRegistry,
    public readonly remoteStore: RealtimeRemoteStore,
    public readonly offlineStore: OfflineStore,
    @Optional() public readonly fileService?: FileService,
    @Optional() public readonly pwaService?: PwaService
  ) {
    if (this.fileService != null) {
      this.fileService.init(this);
    }
  }

  get<T extends RealtimeDoc>(collection: string, id: string): T {
    incrementMap('get', collection);
    const key = getDocKey(collection, id);
    let doc = this.docs.get(key);
    if (doc == null) {
      const RealtimeDocType = this.typeRegistry.getDocType(collection);
      if (RealtimeDocType == null) {
        throw new Error('The collection is unknown.');
      }
      doc = new RealtimeDocType(this, this.remoteStore.createDocAdapter(collection, id));
      if (doc.id == null) {
        throw new AppError('Document could not be created.', {
          collection: collection,
          id: id ?? 'undefined'
        });
      }
      this.docs.set(key, doc);
    }
    return doc as T;
  }

  createQuery<T extends RealtimeDoc>(collection: string, parameters: QueryParameters): RealtimeQuery<T> {
    incrementMap('createQuery', collection);
    return new RealtimeQuery<T>(this, this.remoteStore.createQueryAdapter(collection, parameters));
  }

  isSet(collection: string, id: string): boolean {
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
    incrementMap('subscribe', collection);
    const doc = this.get<T>(collection, id);
    await doc.subscribe();
    return doc;
  }

  async onlineFetch<T extends RealtimeDoc>(collection: string, id: string): Promise<T> {
    incrementMap('onlineFetch', collection);
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
    incrementMap('create', collection);
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
    incrementMap('subscribeQuery', collection);
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
    incrementMap('onlineQuery', collection);
    const query = this.createQuery<T>(collection, parameters);
    await query.fetch();
    return query;
  }

  onQuerySubscribe<T extends RealtimeDoc>(query: RealtimeQuery<T>): void {
    let collectionQueries = this.subscribeQueries.get(query.collection);
    if (collectionQueries == null) {
      collectionQueries = new Set<RealtimeQuery>();
      this.subscribeQueries.set(query.collection, collectionQueries);
    }
    collectionQueries.add(query as any as RealtimeQuery);
  }

  onQueryUnsubscribe<T extends RealtimeDoc>(query: RealtimeQuery<T>): void {
    const collectionQueries = this.subscribeQueries.get(query.collection);
    if (collectionQueries != null) {
      collectionQueries.delete(query as any as RealtimeQuery);
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
