/**
 * Moves an item at one index in a ReadonlyArray to another and returns the new array.
 * @param arr The ReadonlyArray to move the item within
 * @param fromIndex The index of the item to move
 * @param toIndex The index to move the item to
 * @throws {Error} If fromIndex or toIndex are out of bounds
 * @returns A new array with the item moved
 */
export function moveItemInReadonlyArray<T>(
  arr: ReadonlyArray<T>,
  fromIndex: number,
  toIndex: number
): ReadonlyArray<T> {
  if (fromIndex < 0 || fromIndex >= arr.length || toIndex < 0 || toIndex >= arr.length) {
    throw new Error('Invalid index');
  }

  const result = [...arr];
  const [removed] = result.splice(fromIndex, 1);
  result.splice(toIndex, 0, removed);

  return result;
}

/**
 * Moves an item from one ReadonlyArray to another and returns two new arrays.
 * @param fromArray The ReadonlyArray to move the item from
 * @param toArray The ReadonlyArray to move the item to
 * @param fromIndex The index of the item to move
 * @param toIndex The index to move the item to
 * @throws {Error} If fromIndex or toIndex are out of bounds
 * @returns A tuple with two new arrays, the first with the item removed and the second with the item added
 */
export function transferItemAcrossReadonlyArrays<T>(
  fromArray: ReadonlyArray<T>,
  toArray: ReadonlyArray<T>,
  fromIndex: number,
  toIndex: number
): [T[], T[]] {
  if (fromIndex < 0 || fromIndex >= fromArray.length || toIndex < 0 || toIndex > toArray.length) {
    throw new Error('Invalid index');
  }

  const newFromArray = [...fromArray];
  const newToArray = [...toArray];
  const [removed] = newFromArray.splice(fromIndex, 1);
  newToArray.splice(toIndex, 0, removed);

  return [newFromArray, newToArray];
}
