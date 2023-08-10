import { Observable, from } from 'rxjs';
import { filterNullUndefined } from './rxjs-util';

describe('filterNullUndefined', () => {
  it('should filter out only null and undefined values', () => {
    const source$: Observable<number | string | boolean | object | bigint | undefined | null> = from([
      0,
      1,
      undefined,
      null,
      NaN,
      {},
      'hello',
      '',
      null,
      false,
      undefined,
      -0,
      0n
    ]);
    const result$: Observable<number | string | boolean | object | bigint> = source$.pipe(filterNullUndefined());

    const expected: (number | string | boolean | object | bigint)[] = [0, 1, NaN, {}, 'hello', '', false, -0, 0n];
    const result: (number | string | boolean | object | bigint)[] = [];
    result$.subscribe(value => result.push(value));

    expect(result).toEqual(expected);
  });
});
