import { difference, intersection, union } from './set-util';

describe('set-util', () => {
  describe('intersection', () => {
    it('returns elements present in both sets', () => {
      expect([...intersection(new Set([1, 2, 3]), new Set([2, 3, 4]))]).toEqual([2, 3]);
    });

    it('returns an empty set when there is no overlap', () => {
      expect(intersection(new Set([1, 2]), new Set([3, 4])).size).toBe(0);
    });

    it('does not mutate the inputs', () => {
      const a = new Set([1, 2, 3]);
      const b = new Set([2, 3, 4]);
      intersection(a, b);
      expect([...a]).toEqual([1, 2, 3]);
      expect([...b]).toEqual([2, 3, 4]);
    });
  });

  describe('union', () => {
    it('returns elements present in either set, without duplicates', () => {
      expect([...union(new Set([1, 2]), new Set([2, 3]))]).toEqual([1, 2, 3]);
    });

    it('does not mutate the inputs', () => {
      const a = new Set([1, 2]);
      const b = new Set([2, 3]);
      union(a, b);
      expect([...a]).toEqual([1, 2]);
      expect([...b]).toEqual([2, 3]);
    });
  });

  describe('difference', () => {
    it('returns elements in the first set but not the second', () => {
      expect([...difference(new Set([1, 2, 3]), new Set([2, 3, 4]))]).toEqual([1]);
    });

    it('returns a copy of the first set when there is no overlap', () => {
      expect([...difference(new Set([1, 2]), new Set([3, 4]))]).toEqual([1, 2]);
    });

    it('does not mutate the inputs', () => {
      const a = new Set([1, 2, 3]);
      const b = new Set([2, 3]);
      difference(a, b);
      expect([...a]).toEqual([1, 2, 3]);
      expect([...b]).toEqual([2, 3]);
    });
  });
});
