import { hasExactKeys, isPlainObject } from '../utils/type-utils';

/**
 * Strict decoders turn an `unknown` value, such as a parsed websocket message, into a typed value. A decoder accepts
 * exactly the shape its type describes: no extra keys, no inherited properties, no values of other types and no
 * numbers outside its bounds. It never throws; a value it does not accept gives a DecodeFailure that says where and
 * why.
 *
 * Decoders for objects are written by hand with `exactFields`, which checks the key set and then hands out each
 * field's value as `unknown` for a field decoder to check. The decoded object is then built as an object literal of
 * the target type, so that the type system checks what is built, and no cast is needed anywhere.
 */

/** Why a value was not accepted. `path` is where in the value the problem is, such as `$.op[2].p`. */
export interface DecodeFailure {
  readonly ok: false;
  readonly path: string;
  readonly message: string;
}

/** A value that was accepted. */
export interface DecodeSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export type DecodeResult<T> = DecodeSuccess<T> | DecodeFailure;

/** Checks `input` (found at `path`) and gives the typed value or the reason it was not accepted. */
export type Decoder<T> = (input: unknown, path: string) => DecodeResult<T>;

/** The type a decoder produces. */
export type DecodedType<D> = D extends Decoder<infer T> ? T : never;

/** Object keys that would reach an object's prototype or constructor if code used them to index an object. */
export const FORBIDDEN_KEYS: readonly string[] = ['__proto__', 'constructor', 'prototype'];

/** The root path for decoding a whole message. */
export const ROOT_PATH = '$';

export function success<T>(value: T): DecodeSuccess<T> {
  return { ok: true, value: value };
}

export function failure(path: string, message: string): DecodeFailure {
  return { ok: false, path: path, message: message };
}

/** The path of a property within the value at `path`. */
export function propertyPath(path: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}

/** The path of an array element within the value at `path`. */
export function indexPath(path: string, index: number): string {
  return `${path}[${index}]`;
}

/** Decodes a value at the root path. */
export function decode<T>(decoder: Decoder<T>, input: unknown): DecodeResult<T> {
  return decoder(input, ROOT_PATH);
}

/** Options for `stringValue`. */
export interface StringOptions {
  readonly minLength?: number;
  readonly maxLength: number;
  /** A pattern the whole string must match. Anchor it with ^ and $. */
  readonly pattern?: RegExp;
}

/** Accepts a string primitive within the length bounds, and matching the pattern if one is given. */
export function stringValue(options: StringOptions): Decoder<string> {
  const minLength: number = options.minLength ?? 0;
  return (input: unknown, path: string): DecodeResult<string> => {
    if (typeof input !== 'string') {
      return failure(path, 'expected a string');
    }
    if (input.length < minLength || input.length > options.maxLength) {
      return failure(path, `expected a string of length ${minLength} to ${options.maxLength}`);
    }
    if (options.pattern != null && !options.pattern.test(input)) {
      return failure(path, 'string does not have the expected form');
    }
    return success(input);
  };
}

/** Options for `integerValue`. Both bounds are inclusive and must be safe integers. */
export interface IntegerOptions {
  readonly min: number;
  readonly max: number;
}

/** Accepts a safe integer within the bounds. */
export function integerValue(options: IntegerOptions): Decoder<number> {
  return (input: unknown, path: string): DecodeResult<number> => {
    if (typeof input !== 'number' || !Number.isSafeInteger(input)) {
      return failure(path, 'expected a safe integer');
    }
    if (input < options.min || input > options.max) {
      return failure(path, `expected an integer from ${options.min} to ${options.max}`);
    }
    return success(input);
  };
}

/** Accepts a non-negative safe integer, such as a doc version. */
export const nonNegativeInteger: Decoder<number> = integerValue({ min: 0, max: Number.MAX_SAFE_INTEGER });

/** Accepts a safe integer of at least 1, such as a client's op sequence number or query id. */
export const positiveInteger: Decoder<number> = integerValue({ min: 1, max: Number.MAX_SAFE_INTEGER });

/** Accepts `true` or `false`. */
export const booleanValue: Decoder<boolean> = (input: unknown, path: string): DecodeResult<boolean> =>
  typeof input === 'boolean' ? success(input) : failure(path, 'expected a boolean');

/** Accepts exactly one value, compared with `===`. */
export function literal<const T extends string | number | boolean | null>(expected: T): Decoder<T> {
  return (input: unknown, path: string): DecodeResult<T> =>
    input === expected ? success(expected) : failure(path, `expected ${JSON.stringify(expected)}`);
}

/** Accepts any one of the listed values, compared with `===`. */
export function oneOf<const T extends string | number>(allowed: readonly T[]): Decoder<T> {
  return (input: unknown, path: string): DecodeResult<T> => {
    for (const value of allowed) {
      if (input === value) {
        return success(value);
      }
    }
    return failure(path, `expected one of ${JSON.stringify(allowed)}`);
  };
}

/** Accepts `null`, or whatever `decoder` accepts. */
export function nullable<T>(decoder: Decoder<T>): Decoder<T | null> {
  return (input: unknown, path: string): DecodeResult<T | null> =>
    input === null ? success(null) : decoder(input, path);
}

/** Options for `arrayOf`. */
export interface ArrayOptions {
  readonly minLength?: number;
  readonly maxLength: number;
}

/** Accepts an array whose length is within bounds and whose every element `element` accepts. */
export function arrayOf<T>(element: Decoder<T>, options: ArrayOptions): Decoder<readonly T[]> {
  const minLength: number = options.minLength ?? 0;
  return (input: unknown, path: string): DecodeResult<readonly T[]> => {
    if (!Array.isArray(input)) {
      return failure(path, 'expected an array');
    }
    if (input.length < minLength || input.length > options.maxLength) {
      return failure(path, `expected an array of length ${minLength} to ${options.maxLength}`);
    }
    const values: T[] = [];
    for (let index = 0; index < input.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(input, index)) {
        return failure(indexPath(path, index), 'array has a hole');
      }
      const result: DecodeResult<T> = element(input[index], indexPath(path, index));
      if (!result.ok) {
        return result;
      }
      values.push(result.value);
    }
    return success(values);
  };
}

/** Accepts a two-element array whose elements the two decoders accept. */
export function pair<A, B>(first: Decoder<A>, second: Decoder<B>): Decoder<readonly [A, B]> {
  return (input: unknown, path: string): DecodeResult<readonly [A, B]> => {
    if (!Array.isArray(input) || input.length !== 2) {
      return failure(path, 'expected an array of two elements');
    }
    const firstResult: DecodeResult<A> = first(input[0], indexPath(path, 0));
    if (!firstResult.ok) {
      return firstResult;
    }
    const secondResult: DecodeResult<B> = second(input[1], indexPath(path, 1));
    if (!secondResult.ok) {
      return secondResult;
    }
    return success([firstResult.value, secondResult.value]);
  };
}

/** Options for `recordOf`. */
export interface RecordOptions {
  readonly minEntries?: number;
  readonly maxEntries: number;
}

/**
 * Accepts a plain object used as a map, such as `{ [docId]: version }`. Every key `key` accepts and every value
 * `value` accepts. Keys in FORBIDDEN_KEYS are refused. The result is a Map, so no key can collide with anything
 * inherited.
 */
export function recordOf<V>(
  key: Decoder<string>,
  value: Decoder<V>,
  options: RecordOptions
): Decoder<ReadonlyMap<string, V>> {
  const minEntries: number = options.minEntries ?? 0;
  return (input: unknown, path: string): DecodeResult<ReadonlyMap<string, V>> => {
    if (!isPlainObject(input) || Object.getOwnPropertySymbols(input).length > 0) {
      return failure(path, 'expected a plain object');
    }
    const keys: string[] = Object.getOwnPropertyNames(input);
    if (keys.length < minEntries || keys.length > options.maxEntries) {
      return failure(path, `expected ${minEntries} to ${options.maxEntries} entries`);
    }
    const entries = new Map<string, V>();
    for (const entryKey of keys) {
      const entryPath: string = propertyPath(path, entryKey);
      if (FORBIDDEN_KEYS.includes(entryKey)) {
        return failure(entryPath, 'forbidden key');
      }
      const keyResult: DecodeResult<string> = key(entryKey, entryPath);
      if (!keyResult.ok) {
        return keyResult;
      }
      const ownValue: OwnValue = readOwnDataProperty(input, entryKey);
      if (!ownValue.present) {
        return failure(entryPath, 'expected an enumerable data property');
      }
      const valueResult: DecodeResult<V> = value(ownValue.value, entryPath);
      if (!valueResult.ok) {
        return valueResult;
      }
      entries.set(keyResult.value, valueResult.value);
    }
    return success(entries);
  };
}

/** The value of an own property, if the object has it as an enumerable data property. */
type OwnValue = { readonly present: true; readonly value: unknown } | { readonly present: false };

function readOwnDataProperty(input: object, key: string): OwnValue {
  const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(input, key);
  if (
    descriptor == null ||
    descriptor.enumerable !== true ||
    !Object.prototype.hasOwnProperty.call(descriptor, 'value')
  ) {
    return { present: false };
  }
  return { present: true, value: descriptor.value };
}

/**
 * The fields of an object that `exactFields` accepted. `required` reads a field the object must have; `optional`
 * reads one it may have, giving `undefined` when it does not. Only the names given to `exactFields` can be read.
 */
export interface Fields<Required extends string, Optional extends string> {
  required(key: Required): unknown;
  /** Whether the object has this optional field. A field present with the value `undefined` cannot come from JSON. */
  has(key: Optional): boolean;
  optional(key: Optional): unknown;
  /** The path of a field, for passing to the field's decoder. */
  path(key: Required | Optional): string;
}

/**
 * Accepts a plain object whose own keys are exactly `required` plus any of `optional`, all of them enumerable data
 * properties (see hasExactKeys). Values are not checked; read each with the returned Fields and decode it.
 */
export function exactFields<const Required extends string, const Optional extends string = never>(
  input: unknown,
  path: string,
  required: readonly Required[],
  optional: readonly Optional[] = []
): DecodeResult<Fields<Required, Optional>> {
  if (!hasExactKeys(input, required, optional)) {
    return failure(path, describeKeyMismatch(input, required, optional));
  }
  const values = new Map<string, unknown>();
  for (const key of Object.getOwnPropertyNames(input)) {
    const ownValue: OwnValue = readOwnDataProperty(input, key);
    if (ownValue.present) {
      values.set(key, ownValue.value);
    }
  }
  const fields: Fields<Required, Optional> = {
    required: (key: Required): unknown => values.get(key),
    has: (key: Optional): boolean => values.has(key),
    optional: (key: Optional): unknown => values.get(key),
    path: (key: Required | Optional): string => propertyPath(path, key)
  };
  return success(fields);
}

/** Says, for a log, why an object did not have the expected keys. */
function describeKeyMismatch(input: unknown, required: readonly string[], optional: readonly string[]): string {
  if (!isPlainObject(input)) {
    return 'expected a plain object';
  }
  const ownKeys: string[] = Object.getOwnPropertyNames(input);
  const extra: string[] = ownKeys.filter(key => !required.includes(key) && !optional.includes(key));
  const missing: string[] = required.filter(key => !ownKeys.includes(key));
  if (extra.length > 0) {
    // Key names come from the client. Only a few are reported, and each is cut short, to keep log entries small.
    const shown: string[] = extra.slice(0, 5).map(key => JSON.stringify(key.slice(0, 40)));
    return `unexpected keys: ${shown.join(', ')}`;
  }
  if (missing.length > 0) {
    return `missing keys: ${missing.join(', ')}`;
  }
  return 'expected only enumerable data properties';
}

/** Gives the first decoder's result if it accepts the input, otherwise tries the next, and so on. */
export function firstOf<T>(decoders: readonly Decoder<T>[], description: string): Decoder<T> {
  return (input: unknown, path: string): DecodeResult<T> => {
    for (const decoder of decoders) {
      const result: DecodeResult<T> = decoder(input, path);
      if (result.ok) {
        return result;
      }
    }
    return failure(path, `expected ${description}`);
  };
}

/** Applies `transform` to what `decoder` accepted. */
export function map<A, B>(decoder: Decoder<A>, transform: (value: A) => B): Decoder<B> {
  return (input: unknown, path: string): DecodeResult<B> => {
    const result: DecodeResult<A> = decoder(input, path);
    return result.ok ? success(transform(result.value)) : result;
  };
}
