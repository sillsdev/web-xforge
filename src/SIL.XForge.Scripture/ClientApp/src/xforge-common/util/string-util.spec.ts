import { areStringArraysEqual, isWhitespace } from './string-util';

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

describe('isWhitespace', () => {
  it('returns true for empty string', () => {
    expect(isWhitespace('')).toBe(true);
  });

  it('returns false for null or undefined', () => {
    expect(isWhitespace(null as any)).toBe(false);
    expect(isWhitespace(undefined as any)).toBe(false);
  });

  it('returns true for strings with only whitespace characters', () => {
    expect(isWhitespace(' ')).toBe(true);
    expect(isWhitespace('\n')).toBe(true);
    expect(isWhitespace('\t')).toBe(true);
    expect(isWhitespace(' \n\t ')).toBe(true);
    expect(isWhitespace('   \n\t   ')).toBe(true);
    expect(isWhitespace(' \r\n\t ')).toBe(true);
    expect(isWhitespace(' \f ')).toBe(true); // Form feed
    expect(isWhitespace(' \v ')).toBe(true); // Vertical tab
    expect(isWhitespace(' \u00A0 ')).toBe(true); // Non-breaking space
  });

  it('returns false for non-whitespace strings', () => {
    expect(isWhitespace('hello')).toBe(false);
    expect(isWhitespace('"')).toBe(false);
    expect(isWhitespace(' blah')).toBe(false);
    expect(isWhitespace('blah ')).toBe(false);
    expect(isWhitespace('\na\n')).toBe(false);
  });
});
