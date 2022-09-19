import { hasFunctionProp, hasProp, isObj } from './utils';

const miscValues = [undefined, null, NaN, true, false, Infinity, -1, 0, Symbol(), '', '\0', () => {}, BigInt(3)];

const objValues = [{}, [], new Error()];

describe('type utils', () => {
  it('checks whether a value is an object', () => {
    for (const value of miscValues) expect(isObj(value)).toBeFalse();
    for (const obj of objValues) expect(isObj(obj)).toBeTrue();
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

  it('checks whether a value has a function property', () => {
    for (const value of [...miscValues, ...objValues]) expect(hasFunctionProp(value, 'hello')).toBeFalse();

    expect(hasFunctionProp({}, 'hello')).toBeFalse();
    expect(hasFunctionProp({ hello: 'world' }, 'hello')).toBeFalse();
    expect(hasFunctionProp({ hello: () => {} }, 'hello')).toBeTrue();
  });
});
