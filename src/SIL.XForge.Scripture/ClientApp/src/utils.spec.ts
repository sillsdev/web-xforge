import {
  hasData,
  hasFunctionProp,
  hasProp,
  hasStringProp,
  isObj,
  isPopulatedString,
  isString,
  notNull
} from './type-utils';

const miscValues = [undefined, null, NaN, true, false, Infinity, -1, 0, Symbol(), '', '\0', () => {}, BigInt(3)];

const objValues = [{}, [], new Error()];

describe('type utils', () => {
  it('checks whether a value is an object', () => {
    for (const value of miscValues) expect(isObj(value)).toBeFalse();
    for (const obj of objValues) expect(isObj(obj)).toBeTrue();
  });

  describe('isString()', () => {
    it('returns false for string objects', () => {
      expect(isString(new String())).toBeFalse();
    });

    it('returns false for nullish values', () => {
      expect(isString(undefined)).toBeFalse();
      expect(isString(null)).toBeFalse();
    });

    it('returns false for non-string types', () => {
      expect(isString(true)).toBeFalse();
      expect(isString(false)).toBeFalse();
      expect(isString(0)).toBeFalse();
      expect(isString(NaN)).toBeFalse();
      expect(isString(() => {})).toBeFalse();
      expect(isString({})).toBeFalse();
      expect(isString([])).toBeFalse();
    });

    it('returns true for string primitive values', () => {
      expect(isString('')).toBeTrue();
      expect(isString('hello')).toBeTrue();
    });
  });

  it('checks whether a value has a property', () => {
    for (const value of [...miscValues, ...objValues]) expect(hasProp(value, 'hello')).toBeFalse();

    expect(hasProp({}, 'hello')).toBeFalse();
    expect(hasProp({ hello: false }, 'hello')).toBeTrue();
    expect(hasProp({ hello: undefined }, 'hello')).toBeTrue();

    const prototype = { hello: 'world' };
    const objectFromPrototype = Object.create(prototype);
    expect(prototype.hasOwnProperty('hello')).toBeTrue();
    expect(objectFromPrototype.hasOwnProperty('hello')).toBeFalse();
    expect(hasProp(prototype, 'hello')).toBeTrue();
    expect(hasProp(objectFromPrototype, 'hello')).toBeTrue();
  });

  it('checks whether a value has a string property', () => {
    for (const value of [...miscValues, ...objValues]) expect(hasStringProp(value, 'hello')).toBeFalse();

    expect(hasStringProp({}, 'hello')).toBeFalse();
    expect(hasStringProp({ hello: () => {} }, 'hello')).toBeFalse();
    expect(hasStringProp({ hello: 'world' }, 'hello')).toBeTrue();
  });

  it('checks whether a value has a function property', () => {
    for (const value of [...miscValues, ...objValues]) expect(hasFunctionProp(value, 'hello')).toBeFalse();

    expect(hasFunctionProp({}, 'hello')).toBeFalse();
    expect(hasFunctionProp({ hello: 'world' }, 'hello')).toBeFalse();
    expect(hasFunctionProp({ hello: () => {} }, 'hello')).toBeTrue();
  });

  it('hasData works', () => {
    expect(hasData({ data: 'hello' })).toBeTrue();
    expect(hasData({ data: {} })).toBeTrue();
    expect(hasData({ data: null })).toBeFalse();
    expect(hasData({ data: undefined })).toBeFalse();
    expect(hasData(null)).toBeFalse();
    expect(hasData(undefined)).toBeFalse();
    // These could be good expectations, but are not expected to compile
    // at this time.
    // expect(hasData({})).toBeFalse();
    // expect(hasData({ a: 'b' })).toBeFalse();
  });

  it('isInstantiated works', () => {
    expect(notNull(null)).toBeFalse();
    expect(notNull(undefined)).toBeFalse();
    expect(notNull('hello')).toBeTrue();
    expect(notNull({})).toBeTrue();
    expect(notNull(1)).toBeTrue();
    expect(notNull({ a: 'b' })).toBeTrue();
  });

  it('isPopulatedString should return true for non-empty strings', () => {
    expect(isPopulatedString('a')).toBe(true);
    expect(isPopulatedString('  a  ')).toBe(true);
    expect(isPopulatedString(' ')).toBe(true);
    expect(isPopulatedString('0')).toBe(true);
    expect(isPopulatedString('false')).toBe(true);
    const value: string | null | undefined = 'abc';
    expect(isPopulatedString(value)).toBe(true);
  });

  it('isPopulatedString should return false for null, undefined, empty strings, or non-strings', () => {
    expect(isPopulatedString(null)).toBe(false);
    expect(isPopulatedString(undefined)).toBe(false);
    expect(isPopulatedString('')).toBe(false);
    let value: string | null | undefined = '';
    expect(isPopulatedString(value)).toBe(false);
    value = null;
    expect(isPopulatedString(value)).toBe(false);
    value = undefined;
    expect(isPopulatedString(value)).toBe(false);
    expect(isPopulatedString(0)).toBe(false);
    expect(isPopulatedString({})).toBe(false);
    expect(isPopulatedString([])).toBe(false);
  });
});
