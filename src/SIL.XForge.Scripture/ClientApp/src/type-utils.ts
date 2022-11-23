/**
 * Determines whether a value is a non-null object, and narrows the type to object if so.
 */
export function isObj(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

export function hasProp<X, Y extends PropertyKey>(value: X, property: Y): value is X & Record<Y, unknown> {
  return isObj(value) && property in value;
}

export function hasStringProp<X, Y extends PropertyKey>(value: X, property: Y): value is X & Record<Y, string> {
  return hasProp(value, property) && typeof value[property] === 'string';
}

export function hasFunctionProp<X, Y extends PropertyKey>(value: X, property: Y): value is X & Record<Y, Function> {
  return hasProp(value, property) && typeof value[property] === 'function';
}

export function hasObjectProp<X, Y extends PropertyKey>(value: X, property: Y): value is X & Record<Y, object> {
  return hasProp(value, property) && isObj(value[property]);
}

export function hasNumberProp<X, Y extends PropertyKey>(value: X, property: Y): value is X & Record<Y, number> {
  return hasProp(value, property) && typeof value[property] === 'number';
}

export function hasPropWithValue<X, Y extends PropertyKey>(
  obj: X,
  prop: Y,
  val: unknown
): obj is X & Record<Y, unknown> {
  return hasProp(obj, prop) && obj[prop] === val;
}

// The CaretPosition type is no longer in the TypeScript DOM API type definitions, though it is still in Firefox,
// as of Firefox 104.0, on 2022-09-06
export interface CaretPosition {
  readonly offset: number;
  readonly offsetNode: Node;
}

// The following types up to ObjectPaths are fairly complicated. The earlier types are supporting types for the
// ObjectPaths type definition
// See https://stackoverflow.com/a/58436959 for an explanation of how this works.
// Look up type manipulation in the TypeScript handbook for an explanation of the operators that are being used.

// Define an array type that contains types that correspond to values ones less than the index they are at. This allows
// subtracting one when evaluating the Leaves type below, thereby preventing excessive recursion (which would produce a
// compiler error).
// This is not a list of values. This is a list of types. For example, `5` is a type that contains only the number 5.
type OneLessThan = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, ...10[]];

/**
 * Given two types K and P:
 * - If `K` is a string or number, and `P` is a string or number, and P is not the empty string, constructs a string
 * type consisting of the concatenation of `K` and `P` with a `.` between them.
 * - If `K` is a string or number, and `P` is the empty string, constructs a string type consisting of `K` converted to
 * a string.
 * - Otherwise resolves to `never`.
 */
type JoinWithDot<K, P> = K extends string | number
  ? P extends string | number
    ? `${K}${'' extends P ? '' : '.'}${P}`
    : never
  : never;

/**
 * Given an object type `T`, where T has properties, and the keys to those properties are numbers or strings, and the
 * values of those properties are strings or objects (which objects in turn satisfy the same conditions, recursively):
 * Resolves to a type that is the union of all string paths to string values within the object structure, formed joining
 * the key paths with the `.` character between each key.
 *
 * For example, `ObjectPaths<{ a: { b: 'c' }, d: 'e' }>` will resolve to `"d" | "a.b"`.
 *
 * @param T The type from which to derive paths.
 * @param Depth The maximum recursive depth to search for string values. Default is 10. Maximum is 10, and setting it
 * higher than 10 will have the same effect as setting it to 10. This should be considered an approximate value, rather
 * than a precise value, since the meaning of searching to a given depth is not clearly defined, and the implementation
 * has not been carefully crafted to ensure it is precisely followed with no off-by-one-errors (since the precise
 * value is considered unimportant).
 */
// prettier-ignore
export type ObjectPaths<T, Depth extends number = 10> = Depth extends never
  ? never
  : T extends object
    ? { [Key in keyof T]-?: JoinWithDot<Key, ObjectPaths<T[Key], OneLessThan[Depth]>> }[keyof T]
    : '';
