export function isObj(value: unknown): value is {} {
  return typeof value === 'object' && value !== null;
}

export function hasProp<X, Y extends PropertyKey>(value: X, property: Y): value is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(value, property);
}

export function hasFunctionProp<X, Y extends PropertyKey>(value: X, property: Y): value is X & Record<Y, Function> {
  return hasProp(value, property) && typeof value[property] === 'function';
}

// The CaretPosition type is no longer in the TypeScript DOM API type definitions, though it is still in Firefox,
// as of Firefox 104.0, on 2022-09-06
export interface CaretPosition {
  readonly offset: number;
  readonly offsetNode: Node;
}
