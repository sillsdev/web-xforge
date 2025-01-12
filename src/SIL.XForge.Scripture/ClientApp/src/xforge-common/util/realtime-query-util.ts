import { DestroyRef } from '@angular/core';
import { filter, race, take, timer } from 'rxjs';
import { RealtimeDoc } from '../models/realtime-doc';
import { RealtimeQuery } from '../models/realtime-query';

/**
 * Ensures query is disposed when the component associated with DestroyRef is destroyed.
 * This will handle the case where the component is destroyed before `queryPromise` resolves.
 * @param queryPromise The Promise for the RealtimeQuery.
 * @param destroyRef The DestroyRef associated with the component.
 * @returns The passed in `queryPromise`.
 */
export function manageQuery<T extends RealtimeDoc>(
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
