import { OperatorFunction } from 'rxjs';
import { filter } from 'rxjs/operators';

/**
 * Rxjs pipeable operator function to filters out null and undefined values.
 *
 * @returns {OperatorFunction<T | undefined, T>} An observable that emits only values that are not null or undefined.
 */
export function filterNullish<T>(): OperatorFunction<T | undefined | null, T> {
  return filter((value): value is T => value != null);
}
