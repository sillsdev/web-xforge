import { DestroyRef, Injectable, Optional } from '@angular/core';
import { filter, race, take, timer } from 'rxjs';
import { AppError } from 'xforge-common/exception-handling.service';
import { FileService } from './file.service';
import { DocSubscriberInfo, FETCH_WITHOUT_SUBSCRIBE, RealtimeDoc } from './models/realtime-doc';
import { RealtimeQuery } from './models/realtime-query';
import { OfflineStore } from './offline-store';
import { QueryParameters } from './query-parameters';
import { RealtimeRemoteStore } from './realtime-remote-store';
import { TypeRegistry } from './type-registry';

function getDocKey(collection: string, id: string): string {
  return `${collection}:${id}`;
}

/**
 * A no-op DestroyRef that is not associated with any component.
 * This may be useful to satisfy a subscribe query in testing or if a query is not associated with a component.
 */
export const noopDestroyRef: DestroyRef = {
  onDestroy: _callback => () => {}
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
    @Optional() public readonly fileService?: FileService
  ) {
    if (this.fileService != null) {
      this.fileService.init(this);
    }

    // Subscribe to before-send-op events so the pending ops can be updated in IndexedDB with the src and seq on the
    // inflight op, before it is sent to the server.
    this.remoteStore.subscribeToBeforeSendOp(async (collection: string, docId: string) => {
      const doc: RealtimeDoc | undefined = this.docs.get(getDocKey(collection, docId));
      await doc?.updateOfflineData();
    });
  }

  get totalDocCount(): number {
    return this.docs.size;
  }

  get queriesByCollection(): { [key: string]: number } {
    const queriesByCollection: { [key: string]: number } = {};
    for (const [collection, queries] of this.subscribeQueries.entries()) {
      queriesByCollection[collection] = queries.size;
    }
    return queriesByCollection;
  }

  get docsCountByCollection(): {
    [key: string]: { docs: number; subscribers: number; activeDocSubscriptionsCount: number };
  } {
    const countsByCollection: {
      [key: string]: { docs: number; subscribers: number; activeDocSubscriptionsCount: number };
    } = {};
    for (const [id, doc] of this.docs.entries()) {
      const collection = id.split(':')[0];
      countsByCollection[collection] ??= { docs: 0, subscribers: 0, activeDocSubscriptionsCount: 0 };
      countsByCollection[collection].docs++;
      countsByCollection[collection].subscribers += doc.docSubscriptionsCount;
      countsByCollection[collection].activeDocSubscriptionsCount += doc.activeDocSubscriptionsCount;
    }
    return countsByCollection;
  }

  get subscriberCountsByContext(): { [key: string]: { [key: string]: { all: number; active: number } } } {
    const countsByContext: { [key: string]: { [key: string]: { all: number; active: number } } } = {};
    for (const [id, doc] of this.docs.entries()) {
      const collection = id.split(':')[0];
      countsByContext[collection] ??= {};
      for (const subscriber of doc.docSubscriptions) {
        countsByContext[collection][subscriber.callerContext] ??= { all: 0, active: 0 };
        countsByContext[collection][subscriber.callerContext].all++;
        if (!subscriber.isUnsubscribed) {
          countsByContext[collection][subscriber.callerContext].active++;
        }
      }
    }
    return countsByContext;
  }

  get<T extends RealtimeDoc>(collection: string, id: string, subscriber: DocSubscriberInfo): T {
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
    if (subscriber !== FETCH_WITHOUT_SUBSCRIBE) doc.addSubscriber(subscriber);

    return doc as T;
  }

  createQuery<T extends RealtimeDoc>(collection: string, parameters: QueryParameters): RealtimeQuery<T> {
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
  async subscribe<T extends RealtimeDoc>(collection: string, id: string, subscriber: DocSubscriberInfo): Promise<T> {
    const doc = this.get<T>(collection, id, subscriber);
    await doc.subscribe();
    return doc;
  }

  // /**
  //  * Gets the real-time doc with the specified id without subscribing to remote changes (well, it actually does
  //  * subscribe to remote changes, but marks it as not needing to be kept around).
  //  *
  //  * @param {string} collection The collection name.
  //  * @param {string} id The id.
  //  * @returns {Promise<T>} The real-time doc.
  //  */
  // async fetch<T extends RealtimeDoc>(collection: string, id: string): Promise<T> {
  //   return await this.subscribe<T>(collection, id, FETCH_WITHOUT_SUBSCRIBE);
  // }

  async onlineFetch<T extends RealtimeDoc>(collection: string, id: string, subscriber: DocSubscriberInfo): Promise<T> {
    const doc = this.get<T>(collection, id, subscriber);
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
  async create<T extends RealtimeDoc>(
    collection: string,
    id: string,
    data: any,
    subscriber: DocSubscriberInfo,
    type?: string
  ): Promise<T> {
    const doc = this.get<T>(collection, id, subscriber);
    await doc.create(data, type);
    return doc;
  }

  /**
   * Performs an optimistic query on the specified collection and subscribes to any remote changes to both the results
   * and the individual docs.
   *
   * @param {string} collection The collection name.
   * @param {QueryParameters} parameters The query parameters.
   * See https://github.com/share/sharedb-mongo#queries.
   * @param {DestroyRef} destroyRef The reference to destroy the query when the component gets destroyed.
   * @returns {Promise<RealtimeQuery<T>>} A promise for the query.
   */
  async subscribeQuery<T extends RealtimeDoc>(
    collection: string,
    parameters: QueryParameters,
    destroyRef: DestroyRef
  ): Promise<RealtimeQuery<T>> {
    const query = this.createQuery<T>(collection, parameters);
    return this.manageQuery(
      query.subscribe().then(() => query),
      destroyRef
    );
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

  /**
   * Ensures query is disposed when the component associated with DestroyRef is destroyed.
   * This will handle the case where the component is destroyed before `queryPromise` resolves.
   * @param queryPromise The Promise for the RealtimeQuery.
   * @param destroyRef The DestroyRef associated with the component.
   * @returns The passed in `queryPromise`.
   */
  private manageQuery<T extends RealtimeDoc>(
    queryPromise: Promise<RealtimeQuery<T>>,
    destroyRef: DestroyRef
  ): Promise<RealtimeQuery<T>> {
    try {
      destroyRef.onDestroy(() =>
        queryPromise.then(query => {
          // Call dispose when the query is ready or after 5 seconds (query will not emit 'ready' when offline)
          race([
            query.ready$.pipe(
              filter(ready => ready),
              take(1)
            ),
            timer(5000)
          ])
            .pipe(take(1))
            .subscribe(() => query.dispose());
        })
      );
    } catch {
      // If 'onDestroy' callback registration fails (view already destroyed), dispose immediately
      queryPromise.then(query => query.dispose());
    }

    return queryPromise;
  }
}
