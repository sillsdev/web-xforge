import { DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MonoTypeOperatorFunction, OperatorFunction } from 'rxjs';
import { filter } from 'rxjs/operators';
import { hasStringProp } from '../../type-utils';

/**
 * Rxjs pipeable operator function to filters out null and undefined values.
 *
 * @returns {OperatorFunction<T | undefined, T>} An observable that emits only values that are not null or undefined.
 */
export function filterNullish<T>(): OperatorFunction<T | undefined | null, T> {
  return filter((value): value is T => value != null);
}

export function isNG0911Error(error: unknown): boolean {
  return hasStringProp(error, 'message') && error.message.includes('NG0911');
}

/**
 * Like `takeUntilDestroyed`, but catches and logs NG0911 errors (unless `options.logWarnings` is false).
 */
export function quietTakeUntilDestroyed<T>(
  destroyRef: DestroyRef,
  options = { logWarnings: true }
): MonoTypeOperatorFunction<T> {
  const stack = new Error().stack;
  const wrappedDestroyRef = {
    onDestroy(callback: () => void): () => void {
      try {
        return destroyRef.onDestroy(callback);
      } catch (error) {
        if (isNG0911Error(error) && options.logWarnings) {
          console.warn('NG0911 error caught and ignored. Original stack: ', stack);
        }
        if (!isNG0911Error(error)) throw error;
        callback();
        return () => {};
      }
    }
  };
  return takeUntilDestroyed(wrappedDestroyRef);
}
