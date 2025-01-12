import { DestroyRef } from '@angular/core';
import { fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { RealtimeDoc } from '../models/realtime-doc';
import { RealtimeQuery } from '../models/realtime-query';
import { manageQuery } from './realtime-query-util';

describe('realtime-query-util', () => {
  describe('manageQuery', () => {
    let destroyRef: DestroyRef;
    let mockQuery: jasmine.SpyObj<RealtimeQuery<RealtimeDoc>>;
    let ready$: BehaviorSubject<boolean>;
    let onDestroyCallback: () => void;

    beforeEach(() => {
      ready$ = new BehaviorSubject<boolean>(false);
      mockQuery = jasmine.createSpyObj('RealtimeQuery', ['dispose']);
      Object.defineProperty(mockQuery, 'ready$', { get: () => ready$ });

      destroyRef = {
        onDestroy: (callback: () => void) => {
          onDestroyCallback = callback;
        }
      } as DestroyRef;
    });

    it('should dispose query when component is destroyed', fakeAsync(() => {
      const queryPromise = Promise.resolve(mockQuery);
      manageQuery(queryPromise, destroyRef);

      onDestroyCallback();
      tick(5000);

      expect(mockQuery.dispose).toHaveBeenCalled();
    }));

    it('should dispose query immediately if view is already destroyed', fakeAsync(() => {
      const queryPromise = Promise.resolve(mockQuery);
      const destroyedRef = {
        onDestroy: () => {
          throw new Error('View destroyed');
        }
      } as DestroyRef;

      manageQuery(queryPromise, destroyedRef);
      tick();

      expect(mockQuery.dispose).toHaveBeenCalled();
    }));

    it('should dispose query when ready$ emits true', fakeAsync(() => {
      const queryPromise = Promise.resolve(mockQuery);
      manageQuery(queryPromise, destroyRef);
      onDestroyCallback();

      ready$.next(true);
      tick();

      expect(mockQuery.dispose).toHaveBeenCalled();
    }));

    it('should dispose query after timeout if not ready', fakeAsync(() => {
      const queryPromise = Promise.resolve(mockQuery);
      manageQuery(queryPromise, destroyRef);
      onDestroyCallback();

      tick(5000);

      expect(mockQuery.dispose).toHaveBeenCalled();
    }));
  });
});
