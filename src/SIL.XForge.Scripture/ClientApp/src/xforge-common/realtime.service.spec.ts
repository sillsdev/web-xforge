import { DestroyRef } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { instance, mock, verify, when } from 'ts-mockito';
import { SF_TYPE_REGISTRY } from '../app/core/models/sf-type-registry';
import { QuerySubscription, RealtimeDoc } from './models/realtime-doc';
import { RealtimeQuery } from './models/realtime-query';
import { RealtimeService } from './realtime.service';
import { provideTestRealtime } from './test-realtime-providers';
import { configureTestingModule } from './test-utils';

describe('RealtimeService', () => {
  const QUERY_DISPOSE_TIMEOUT_MS = 5000;

  configureTestingModule(() => ({
    providers: [provideTestRealtime(SF_TYPE_REGISTRY)]
  }));

  describe('manageQuery', () => {
    let service: RealtimeService;
    let destroyRef: DestroyRef;
    let mockQuery: RealtimeQuery<RealtimeDoc>;
    let queryInstance: RealtimeQuery<RealtimeDoc>;
    let ready$: BehaviorSubject<boolean>;
    let onDestroyCallback: () => void;

    beforeEach(() => {
      service = TestBed.inject(RealtimeService);

      ready$ = new BehaviorSubject<boolean>(false);
      mockQuery = mock(RealtimeQuery);
      when(mockQuery.ready$).thenReturn(ready$);
      queryInstance = instance(mockQuery);

      destroyRef = {
        onDestroy: (callback: () => void) => {
          onDestroyCallback = callback;
        }
      } as DestroyRef;
    });

    afterEach(() => {
      expect(true).toBe(true); // Suppress 'no expectations' warning
    });

    it('should dispose query when component is destroyed', fakeAsync(() => {
      const queryPromise = Promise.resolve(queryInstance);
      service['manageQuery'](queryPromise, destroyRef);

      onDestroyCallback();
      tick(QUERY_DISPOSE_TIMEOUT_MS);

      verify(mockQuery.dispose()).once();
    }));

    it('should dispose query immediately if view is already destroyed', fakeAsync(() => {
      const queryPromise = Promise.resolve(queryInstance);
      const destroyedRef = {
        onDestroy: () => {
          throw new Error('View destroyed');
        },
        destroyed: true
      } as DestroyRef;

      service['manageQuery'](queryPromise, destroyedRef);
      tick();

      verify(mockQuery.dispose()).once();
    }));

    it('should dispose query when ready$ emits true', fakeAsync(() => {
      const queryPromise = Promise.resolve(queryInstance);
      service['manageQuery'](queryPromise, destroyRef);
      onDestroyCallback();

      ready$.next(true);
      tick();

      verify(mockQuery.dispose()).once();
    }));

    it('should dispose query after timeout if not ready', fakeAsync(() => {
      const queryPromise = Promise.resolve(queryInstance);
      service['manageQuery'](queryPromise, destroyRef);
      onDestroyCallback();

      tick(QUERY_DISPOSE_TIMEOUT_MS);

      verify(mockQuery.dispose()).once();
    }));

    it('should dispose query when QuerySubscription is unsubscribed and query is ready', fakeAsync(() => {
      const queryPromise = Promise.resolve(queryInstance);
      const querySubscription = new QuerySubscription('realtime.service.spec');

      service['manageQuery'](queryPromise, querySubscription);

      querySubscription.unsubscribe();
      ready$.next(true);
      tick();

      verify(mockQuery.dispose()).once();
    }));

    it('should dispose query after timeout when QuerySubscription is unsubscribed and query is not ready', fakeAsync(() => {
      const queryPromise = Promise.resolve(queryInstance);
      const querySubscription = new QuerySubscription('realtime.service.spec');

      service['manageQuery'](queryPromise, querySubscription);
      querySubscription.unsubscribe();

      tick(QUERY_DISPOSE_TIMEOUT_MS - 1);
      verify(mockQuery.dispose()).never();

      tick(1);

      verify(mockQuery.dispose()).once();
    }));

    it('should not dispose query before QuerySubscription is unsubscribed', fakeAsync(() => {
      const queryPromise = Promise.resolve(queryInstance);
      const querySubscription = new QuerySubscription('realtime.service.spec');

      service['manageQuery'](queryPromise, querySubscription);
      tick(QUERY_DISPOSE_TIMEOUT_MS);

      verify(mockQuery.dispose()).never();
    }));
  });
});
