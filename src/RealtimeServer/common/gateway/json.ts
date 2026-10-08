import { isPlainObject } from '../utils/type-utils';
import { DecodeResult, Decoder, failure, FORBIDDEN_KEYS, indexPath, propertyPath, success } from './decoder';

/** A value that JSON can represent. Numbers are finite. */
export type JsonValue = null | boolean | number | string | JsonArray | JsonObject;

/** A JSON array. */
export type JsonArray = readonly JsonValue[];

/** A JSON object. Keys never include FORBIDDEN_KEYS (see jsonValue). */
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/**
 * The deepest nesting the transport accepts in a message. Values inside a message are nested less deeply than the
 * message itself, so decoding them with this limit never refuses what the transport accepted.
 */
export const MAX_JSON_DEPTH = 32;

/**
 * Accepts any JSON value: null, a boolean, a finite number, a string, or arrays and plain objects of these, nested
 * at most `maxDepth` levels. Object keys in FORBIDDEN_KEYS are refused. The result is a fresh copy, so nothing in it
 * is shared with the input.
 */
export function jsonValue(maxDepth: number = MAX_JSON_DEPTH): Decoder<JsonValue> {
  return (input: unknown, path: string): DecodeResult<JsonValue> => copyJsonValue(input, path, maxDepth);
}

/** Accepts a JSON object (see jsonValue). */
export function jsonObject(maxDepth: number = MAX_JSON_DEPTH): Decoder<JsonObject> {
  return (input: unknown, path: string): DecodeResult<JsonObject> => copyJsonObject(input, path, maxDepth);
}

function copyJsonValue(input: unknown, path: string, depthLeft: number): DecodeResult<JsonValue> {
  if (input === null || typeof input === 'boolean' || typeof input === 'string') {
    return success(input);
  }
  if (typeof input === 'number') {
    return Number.isFinite(input) ? success(input) : failure(path, 'expected a finite number');
  }
  if (Array.isArray(input)) {
    if (depthLeft <= 0) {
      return failure(path, 'nested too deeply');
    }
    const copy: JsonValue[] = [];
    for (let index = 0; index < input.length; index++) {
      if (!Object.prototype.hasOwnProperty.call(input, index)) {
        return failure(indexPath(path, index), 'array has a hole');
      }
      const element: DecodeResult<JsonValue> = copyJsonValue(input[index], indexPath(path, index), depthLeft - 1);
      if (!element.ok) {
        return element;
      }
      copy.push(element.value);
    }
    return success(copy);
  }
  return copyJsonObject(input, path, depthLeft);
}

function copyJsonObject(input: unknown, path: string, depthLeft: number): DecodeResult<JsonObject> {
  if (!isPlainObject(input) || Object.getOwnPropertySymbols(input).length > 0) {
    return failure(path, 'expected a JSON value');
  }
  if (depthLeft <= 0) {
    return failure(path, 'nested too deeply');
  }
  const copy: { [key: string]: JsonValue } = {};
  for (const key of Object.getOwnPropertyNames(input)) {
    const keyPath: string = propertyPath(path, key);
    if (FORBIDDEN_KEYS.includes(key)) {
      return failure(keyPath, 'forbidden key');
    }
    const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(input, key);
    if (
      descriptor == null ||
      descriptor.enumerable !== true ||
      !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      return failure(keyPath, 'expected an enumerable data property');
    }
    const value: DecodeResult<JsonValue> = copyJsonValue(descriptor.value, keyPath, depthLeft - 1);
    if (!value.ok) {
      return value;
    }
    // Safe to assign: the key is not __proto__, so this creates an own property rather than setting the prototype.
    copy[key] = value.value;
  }
  return success(copy);
}
