import { DestroyRef } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { instance, mock, verify, when } from 'ts-mockito';
import { IDestroyRef } from 'xforge-common/utils';
import { SF_TYPE_REGISTRY } from '../app/core/models/sf-type-registry';
import { RealtimeDoc } from './models/realtime-doc';
import { RealtimeQuery } from './models/realtime-query';
import { RealtimeService } from './realtime.service';
import { TestRealtimeModule } from './test-realtime.module';
import { configureTestingModule } from './test-utils';

describe('RealtimeService', () => {
  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)]
  }));

  describe('manageQuery', () => {
    let service: RealtimeService;
    let destroyRef: IDestroyRef;
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
      } as IDestroyRef;
    });

    afterEach(() => {
      expect(true).toBe(true); // Suppress 'no expectations' warning
    });

    it('should dispose query when component is destroyed', fakeAsync(() => {
      const queryPromise = Promise.resolve(queryInstance);
      service['manageQuery'](queryPromise, destroyRef);

      onDestroyCallback();
      tick(5000);

      verify(mockQuery.dispose()).once();
    }));

    it('should dispose query immediately if view is already destroyed', fakeAsync(() => {
      const queryPromise = Promise.resolve(queryInstance);
      const destroyedRef = {
        onDestroy: () => {
          throw new Error('View destroyed');
        }
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

      tick(5000);

      verify(mockQuery.dispose()).once();
    }));
  });
});
