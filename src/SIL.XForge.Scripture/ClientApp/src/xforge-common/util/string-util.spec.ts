import { areStringArraysEqual } from './string-util';

describe('areStringArraysEqual', () => {
  it('should return true if two empty arrays are compared', () => {
    expect(areStringArraysEqual([], [])).toBe(true);
  });

  it('should return true if two identical arrays are compared', () => {
    expect(areStringArraysEqual(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true);
  });

  it('should return false if two arrays with different lengths are compared', () => {
    expect(areStringArraysEqual(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
  });

  it('should return false if two arrays with different elements are compared', () => {
    expect(areStringArraysEqual(['a', 'b', 'c'], ['x', 'y', 'z'])).toBe(false);
  });
});
