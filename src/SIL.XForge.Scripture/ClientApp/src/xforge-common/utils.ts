import { ObjectId } from 'bson';
import { createProxy, getPath, ObjPathProxy, ObjProxyArg } from 'ts-object-path';

export function nameof<T>(name: Extract<keyof T, string>): string {
  return name;
}

export function objectId(): string {
  return new ObjectId().toHexString();
}

/**
 * `eq` checks the equality of two objects.
 *
 * The properties belonging to objects (but not their prototypes) will be
 * traversed deeply and compared.
 *
 * Includes special handling for strings, numbers, dates, booleans, regexes, and
 * arrays.
 *
 * The semantics of this implementation is more correct for real-time data than Lodash "isEqual", because it will treat
 * a property explicitly assigned "undefined" as equal to a property that is not defined.
 */
export function eq(a: any, b: any): boolean {
  // tslint:disable: triple-equals
  // Some elements of this function come from underscore
  // (c) 2009-2013 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
  //
  // https://github.com/jashkenas/underscore/blob/master/underscore.js

  // Identical objects are equal. `0 === -0`, but they aren't identical.
  // See the [Harmony `egal` proposal](http://wiki.ecmascript.org/doku.php?id=harmony:egal).
  if (a === b) {
    return a !== 0 || 1 / a == 1 / b;
  }
  // A strict comparison is necessary because `null == undefined`.
  if (a == null || b == null) {
    return a === b;
  }

  const type = Object.prototype.toString.call(a);
  if (type !== Object.prototype.toString.call(b)) {
    return false;
  }

  switch (type) {
    case '[object String]':
      return a == String(b);
    case '[object Number]':
      // `NaN`s are equivalent, but non-reflexive. An `egal` comparison is performed for
      // other numeric values.
      return a != +a ? b != +b : a == 0 ? 1 / a == 1 / b : a == +b;
    case '[object Date]':
    case '[object Boolean]':
      // Coerce dates and booleans to numeric primitive values. Dates are compared by their
      // millisecond representations. Note that invalid dates with millisecond representations
      // of `NaN` are not equivalent.
      return +a == +b;
    // RegExps are compared by their source patterns and flags.
    case '[object RegExp]':
      return a.source == b.source && a.global == b.global && a.multiline == b.multiline && a.ignoreCase == b.ignoreCase;
  }
  if (typeof a != 'object' || typeof b != 'object') {
    return false;
  }

  if (type === '[object Array]') {
    if (a.length !== b.length) {
      return false;
    }
  }

  let i;
  for (i in b) {
    if (b.hasOwnProperty(i)) {
      if (!eq(a[i], b[i])) {
        return false;
      }
    }
  }
  for (i in a) {
    if (a.hasOwnProperty(i)) {
      if (!eq(a[i], b[i])) {
        return false;
      }
    }
  }
  return true;
  // tslint:enable: triple-equals
}

export { ObjProxyArg, ObjPathProxy } from 'ts-object-path';

export function objProxy<T>(): ObjPathProxy<T, T> {
  return createProxy<T>();
}

export function getObjPathStr<TRoot, T>(proxy: ObjProxyArg<TRoot, T>): string {
  return getPath(proxy).join('.');
}

export function getObjValue<TRoot, T>(
  object: TRoot,
  proxy: ObjProxyArg<TRoot, T>,
  defaultValue?: T | null | undefined
) {
  return getPath(proxy).reduce(
    (o, key) => (o != null && o[key] !== undefined ? o[key] : defaultValue),
    object as any
  ) as T;
}

export function getObjPath<TRoot, T>(proxy: ObjProxyArg<TRoot, T>): Array<string | number> {
  return getPath(proxy) as Array<string | number>;
}
