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
