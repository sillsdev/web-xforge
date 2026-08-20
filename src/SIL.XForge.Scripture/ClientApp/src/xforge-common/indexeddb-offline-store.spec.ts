import { TestBed } from '@angular/core/testing';
import { IndexeddbOfflineStore } from './indexeddb-offline-store';
import { RealtimeDocConstructor } from './models/realtime-doc';
import { TypeRegistry } from './type-registry';

const TEST_COLLECTION = 'users';

describe('IndexeddbOfflineStore', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        IndexeddbOfflineStore,
        {
          provide: TypeRegistry,
          useValue: new TypeRegistry(
            [{ COLLECTION: TEST_COLLECTION, INDEX_PATHS: [] } as unknown as RealtimeDocConstructor],
            [],
            []
          )
        }
      ]
    });
  });

  afterEach(async () => {
    await deleteDatabase();
  });

  it('should store and retrieve data', async () => {
    const store = TestBed.inject(IndexeddbOfflineStore);
    await store.put(TEST_COLLECTION, { id: 'user01' });
    expect(await store.getAllIds(TEST_COLLECTION)).toEqual(['user01']);
  });

  it('should not re-create the database when written to after deleteDB and disable', async () => {
    const store = TestBed.inject(IndexeddbOfflineStore);
    await store.put(TEST_COLLECTION, { id: 'user01' });

    store.disable();
    await store.deleteDB();

    // Simulates realtime doc persistence that is still in flight during logout (SF-3855)
    await expectNeverSettles(store.put(TEST_COLLECTION, { id: 'user01' }));
    expect(await databaseExists()).toBe(false);
  });

  it('should not settle reads or writes once disabled', async () => {
    const store = TestBed.inject(IndexeddbOfflineStore);
    await store.put(TEST_COLLECTION, { id: 'user01' });

    store.disable();
    expect(store.disabled).toBe(true);
    await expectNeverSettles(store.put(TEST_COLLECTION, { id: 'user02' }));
    await expectNeverSettles(store.getAllIds(TEST_COLLECTION));
    await expectNeverSettles(store.getAll(TEST_COLLECTION));
    await expectNeverSettles(store.get(TEST_COLLECTION, 'user01'));
    await expectNeverSettles(store.query(TEST_COLLECTION, {}));
    await expectNeverSettles(store.delete(TEST_COLLECTION, 'user01'));
  });
});

const PENDING = 'pending';

/** Expects the promise to be still pending (i.e. to lose a race against a short timer). */
async function expectNeverSettles(promise: Promise<unknown>): Promise<void> {
  const result = await Promise.race([
    promise.then(
      () => 'resolved',
      () => 'rejected'
    ),
    new Promise(resolve => setTimeout(() => resolve(PENDING), 25))
  ]);
  expect(result).toBe(PENDING);
}

function databaseExists(): Promise<boolean> {
  return indexedDB.databases().then(dbs => dbs.some(db => db.name === 'xforge'));
}

function deleteDatabase(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('xforge');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}
