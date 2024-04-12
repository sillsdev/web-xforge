import { moveItemInReadonlyArray, transferItemAcrossReadonlyArrays } from './array-util';

describe('array-util', () => {
  describe('moveItemInReadonlyArray', () => {
    it('should move an item from one index to another', () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      expect(moveItemInReadonlyArray(arr, 1, 3)).toEqual([1, 3, 4, 2, 5]);
      expect(moveItemInReadonlyArray(arr, 3, 1)).toEqual([1, 4, 2, 3, 5]);
    });

    it('should throw an error if fromIndex is out of bounds', () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      expect(() => moveItemInReadonlyArray(arr, -1, 3)).toThrowError('Invalid index');
      expect(() => moveItemInReadonlyArray(arr, 5, 3)).toThrowError('Invalid index');
    });

    it('should throw an error if toIndex is out of bounds', () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      expect(() => moveItemInReadonlyArray(arr, 1, -1)).toThrowError('Invalid index');
      expect(() => moveItemInReadonlyArray(arr, 1, 5)).toThrowError('Invalid index');
    });

    it('should return a new array and not mutate the original', () => {
      const arr: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      const result = moveItemInReadonlyArray(arr, 1, 3);
      expect(result).not.toBe(arr);
      expect(arr).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('transferItemAcrossReadonlyArrays', () => {
    it('should transfer an item from one array to another', () => {
      const fromArray: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      const toArray: ReadonlyArray<number> = [6, 7, 8, 9, 10];

      const [newFromArray1, newToArray1] = transferItemAcrossReadonlyArrays(fromArray, toArray, 1, 3);
      expect(newFromArray1).toEqual([1, 3, 4, 5]);
      expect(newToArray1).toEqual([6, 7, 8, 2, 9, 10]);

      const [newFromArray2, newToArray2] = transferItemAcrossReadonlyArrays(fromArray, toArray, 0, 5);
      expect(newFromArray2).toEqual([2, 3, 4, 5]);
      expect(newToArray2).toEqual([6, 7, 8, 9, 10, 1]);
    });

    it('should throw an error if fromIndex is out of bounds', () => {
      const fromArray: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      const toArray: ReadonlyArray<number> = [6, 7, 8, 9, 10];
      expect(() => transferItemAcrossReadonlyArrays(fromArray, toArray, -1, 3)).toThrowError('Invalid index');
      expect(() => transferItemAcrossReadonlyArrays(fromArray, toArray, 5, 3)).toThrowError('Invalid index');
    });

    it('should throw an error if toIndex is out of bounds', () => {
      const fromArray: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      const toArray: ReadonlyArray<number> = [6, 7, 8, 9, 10];
      expect(() => transferItemAcrossReadonlyArrays(fromArray, toArray, 1, -1)).toThrowError('Invalid index');
      expect(() => transferItemAcrossReadonlyArrays(fromArray, toArray, 1, 6)).toThrowError('Invalid index');
    });

    it('should return new arrays and not mutate the original arrays', () => {
      const fromArray: ReadonlyArray<number> = [1, 2, 3, 4, 5];
      const toArray: ReadonlyArray<number> = [6, 7, 8, 9, 10];
      const [newFromArray, newToArray] = transferItemAcrossReadonlyArrays(fromArray, toArray, 1, 3);
      expect(newFromArray).not.toBe(fromArray);
      expect(newToArray).not.toBe(toArray);
      expect(fromArray).toEqual([1, 2, 3, 4, 5]);
      expect(toArray).toEqual([6, 7, 8, 9, 10]);
    });
  });
});
