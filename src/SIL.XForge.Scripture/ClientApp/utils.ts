export function isObj(value: unknown): value is {} {
  return typeof value === 'object' && value !== null;
}

export function hasProp<X, Y extends PropertyKey>(value: X, property: Y): value is X & Record<Y, unknown> {
  return Object.prototype.hasOwnProperty.call(value, property);
}

export function hasFunctionProp<X, Y extends PropertyKey>(value: X, property: Y): value is X & Record<Y, Function> {
  return hasProp(value, property) && typeof value[property] === 'function';
}
