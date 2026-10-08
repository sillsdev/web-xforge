import { isPlainObject } from '../utils/type-utils';
import {
  arrayOf,
  DecodeResult,
  Decoder,
  exactFields,
  failure,
  Fields,
  FORBIDDEN_KEYS,
  nonNegativeInteger,
  positiveInteger,
  success
} from './decoder';
import { DeltaOp, Json0Component, Json0Path, OpEdit } from './inbound-messages';
import { jsonObject, JsonObject, jsonValue, JsonValue } from './json';
import { GatewayOtType } from './protocol-config';

/**
 * Decoders and encoders for the change an `op` message carries: a json0 op (an array of components) or a rich-text op
 * (a serialized Quill delta). The decoders accept only the kinds of content the application's client produces (the
 * Json0Component and DeltaOp kinds in inbound-messages.ts) and copy every value, so nothing in a decoded op is shared with the input. The
 * encoders turn a decoded op back into ShareDB's wire form.
 */

/**
 * The most components a json0 op may have to be decoded at all. The frame size limit already bounds the work of
 * decoding, so this is set well above what a client could compose; how many components the gateway lets through to
 * ShareDB is a separate, lower limit (MAX_FORWARDED_JSON0_COMPONENTS), whose refusal is an error reply, not a close.
 */
export const MAX_JSON0_OP_COMPONENTS = 100_000;

/** The longest json0 path. Doc data is never nested this deeply. */
export const MAX_JSON0_PATH_LENGTH = 64;

/** The longest object key in a json0 path. Keys in our docs are field names and ids, far shorter than this. */
export const MAX_JSON0_PATH_KEY_LENGTH = 1024;

/**
 * The most ops a rich-text delta may have. Pasting a whole chapter, or a history revert (the difference between two
 * versions of a whole chapter), makes thousands of ops; the frame size limit is what really bounds the work.
 */
export const MAX_DELTA_OPS = 100_000;

/** Options for decoding a json0 op. */
export interface Json0OpOptions {
  /**
   * Whether a component may both insert and delete a list item (`li` with `ld`). The client never sends one, but
   * ShareDB can produce one when it transforms a client's op, so the write hook, which sees transformed ops, allows it.
   */
  readonly allowListReplace: boolean;
}

/** Accepts a json0 op: an array, possibly empty, of the component kinds in Json0Component. */
export function json0OpDecoder(options: Json0OpOptions): Decoder<readonly Json0Component[]> {
  return arrayOf(json0ComponentDecoder(options), { maxLength: MAX_JSON0_OP_COMPONENTS });
}

/**
 * Accepts a rich-text op in the form the client sends it: a Quill delta serialized as `{ ops: [...] }`, possibly with
 * no ops. Retains of embeds (an object as `retain`) are not accepted, because the client never sends them.
 */
export const richTextOpDecoder: Decoder<readonly DeltaOp[]> = (
  input: unknown,
  path: string
): DecodeResult<readonly DeltaOp[]> => {
  const fields: DecodeResult<Fields<'ops', never>> = exactFields(input, path, ['ops']);
  if (!fields.ok) {
    return fields;
  }
  return arrayOf(deltaOpDecoder, { maxLength: MAX_DELTA_OPS })(fields.value.required('ops'), fields.value.path('ops'));
};

/** Accepts the change of an edit op in a collection of the given OT type. */
export function opEditDecoder(otType: GatewayOtType, options: Json0OpOptions): Decoder<OpEdit> {
  switch (otType) {
    case 'json0': {
      const componentsDecoder: Decoder<readonly Json0Component[]> = json0OpDecoder(options);
      return (input: unknown, path: string): DecodeResult<OpEdit> => {
        const components: DecodeResult<readonly Json0Component[]> = componentsDecoder(input, path);
        if (!components.ok) {
          return components;
        }
        return success({ otType: 'json0', components: components.value });
      };
    }
    case 'rich-text':
      return (input: unknown, path: string): DecodeResult<OpEdit> => {
        const ops: DecodeResult<readonly DeltaOp[]> = richTextOpDecoder(input, path);
        if (!ops.ok) {
          return ops;
        }
        return success({ otType: 'rich-text', ops: ops.value });
      };
  }
}

/** The ShareDB wire form of an edit op's change: a json0 component array, or `{ ops: [...] }` for rich-text. */
export function encodeOpEdit(edit: OpEdit): JsonValue {
  switch (edit.otType) {
    case 'json0':
      return edit.components.map(encodeJson0Component);
    case 'rich-text': {
      const delta: JsonObject = { ops: edit.ops.map(encodeDeltaOp) };
      return delta;
    }
  }
}

/** The json0 wire form of one component, such as `{ p: ['answers', 0], li: {...} }`. */
export function encodeJson0Component(component: Json0Component): JsonObject {
  const path: JsonValue = [...component.path];
  switch (component.kind) {
    case 'list-insert':
      return { p: path, li: component.inserted };
    case 'list-delete':
      return { p: path, ld: component.deleted };
    case 'list-replace':
      return { p: path, li: component.inserted, ld: component.deleted };
    case 'object-insert':
      return { p: path, oi: component.inserted };
    case 'object-delete':
      return { p: path, od: component.deleted };
    case 'object-replace':
      return { p: path, oi: component.inserted, od: component.deleted };
  }
}

/** The Quill delta wire form of one op. `attributes` is present only when the op has attributes. */
export function encodeDeltaOp(op: DeltaOp): JsonObject {
  switch (op.kind) {
    case 'insert-text':
      return op.attributes == null ? { insert: op.text } : { insert: op.text, attributes: op.attributes };
    case 'insert-embed':
      return op.attributes == null ? { insert: op.embed } : { insert: op.embed, attributes: op.attributes };
    case 'retain':
      return op.attributes == null ? { retain: op.length } : { retain: op.length, attributes: op.attributes };
    case 'delete':
      return { delete: op.length };
  }
}

const json0PathKey: Decoder<string> = (input: unknown, path: string): DecodeResult<string> => {
  if (typeof input !== 'string') {
    return failure(path, 'expected a string or a non-negative integer');
  }
  if (input.length > MAX_JSON0_PATH_KEY_LENGTH) {
    return failure(path, `expected a key of at most ${MAX_JSON0_PATH_KEY_LENGTH} characters`);
  }
  if (FORBIDDEN_KEYS.includes(input)) {
    return failure(path, 'forbidden key');
  }
  return success(input);
};

const json0PathElement: Decoder<string | number> = (input: unknown, path: string): DecodeResult<string | number> =>
  typeof input === 'number' ? nonNegativeInteger(input, path) : json0PathKey(input, path);

const json0Path: Decoder<Json0Path> = arrayOf(json0PathElement, { minLength: 1, maxLength: MAX_JSON0_PATH_LENGTH });

const anyJsonValue: Decoder<JsonValue> = jsonValue();

type Json0ValueKey = 'li' | 'ld' | 'oi' | 'od';

function json0ComponentDecoder(options: Json0OpOptions): Decoder<Json0Component> {
  return (input: unknown, path: string): DecodeResult<Json0Component> => {
    const fieldsResult: DecodeResult<Fields<'p', Json0ValueKey>> = exactFields(
      input,
      path,
      ['p'],
      ['li', 'ld', 'oi', 'od']
    );
    if (!fieldsResult.ok) {
      return fieldsResult;
    }
    const fields: Fields<'p', Json0ValueKey> = fieldsResult.value;
    const componentPath: DecodeResult<Json0Path> = json0Path(fields.required('p'), fields.path('p'));
    if (!componentPath.ok) {
      return componentPath;
    }
    const hasListKey: boolean = fields.has('li') || fields.has('ld');
    const hasObjectKey: boolean = fields.has('oi') || fields.has('od');
    if (hasListKey === hasObjectKey) {
      return failure(path, 'expected a component with li and/or ld, or with oi and/or od');
    }
    const readValue = (key: Json0ValueKey): DecodeResult<JsonValue> =>
      anyJsonValue(fields.optional(key), fields.path(key));

    if (hasListKey) {
      if (fields.has('li') && fields.has('ld')) {
        if (!options.allowListReplace) {
          return failure(path, 'a component may not both insert and delete a list item');
        }
        const inserted: DecodeResult<JsonValue> = readValue('li');
        if (!inserted.ok) {
          return inserted;
        }
        const deleted: DecodeResult<JsonValue> = readValue('ld');
        if (!deleted.ok) {
          return deleted;
        }
        return success({
          kind: 'list-replace',
          path: componentPath.value,
          inserted: inserted.value,
          deleted: deleted.value
        });
      }
      if (fields.has('li')) {
        const inserted: DecodeResult<JsonValue> = readValue('li');
        if (!inserted.ok) {
          return inserted;
        }
        return success({ kind: 'list-insert', path: componentPath.value, inserted: inserted.value });
      }
      const deleted: DecodeResult<JsonValue> = readValue('ld');
      if (!deleted.ok) {
        return deleted;
      }
      return success({ kind: 'list-delete', path: componentPath.value, deleted: deleted.value });
    }

    if (fields.has('oi') && fields.has('od')) {
      const inserted: DecodeResult<JsonValue> = readValue('oi');
      if (!inserted.ok) {
        return inserted;
      }
      const deleted: DecodeResult<JsonValue> = readValue('od');
      if (!deleted.ok) {
        return deleted;
      }
      return success({
        kind: 'object-replace',
        path: componentPath.value,
        inserted: inserted.value,
        deleted: deleted.value
      });
    }
    if (fields.has('oi')) {
      const inserted: DecodeResult<JsonValue> = readValue('oi');
      if (!inserted.ok) {
        return inserted;
      }
      return success({ kind: 'object-insert', path: componentPath.value, inserted: inserted.value });
    }
    const deleted: DecodeResult<JsonValue> = readValue('od');
    if (!deleted.ok) {
      return deleted;
    }
    return success({ kind: 'object-delete', path: componentPath.value, deleted: deleted.value });
  };
}

const anyJsonObject: Decoder<JsonObject> = jsonObject();

type DeltaOpKey = 'insert' | 'retain' | 'delete' | 'attributes';

const deltaOpDecoder: Decoder<DeltaOp> = (input: unknown, path: string): DecodeResult<DeltaOp> => {
  const fieldsResult: DecodeResult<Fields<never, DeltaOpKey>> = exactFields(
    input,
    path,
    [],
    ['insert', 'retain', 'delete', 'attributes']
  );
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<never, DeltaOpKey> = fieldsResult.value;
  const actionCount: number = [fields.has('insert'), fields.has('retain'), fields.has('delete')].filter(
    (present: boolean) => present
  ).length;
  if (actionCount !== 1) {
    return failure(path, 'expected exactly one of insert, retain and delete');
  }

  if (fields.has('delete')) {
    if (fields.has('attributes')) {
      return failure(fields.path('attributes'), 'a delete has no attributes');
    }
    const length: DecodeResult<number> = positiveInteger(fields.optional('delete'), fields.path('delete'));
    if (!length.ok) {
      return length;
    }
    return success({ kind: 'delete', length: length.value });
  }

  let attributes: JsonObject | null = null;
  if (fields.has('attributes')) {
    const decodedAttributes: DecodeResult<JsonObject> = anyJsonObject(
      fields.optional('attributes'),
      fields.path('attributes')
    );
    if (!decodedAttributes.ok) {
      return decodedAttributes;
    }
    attributes = decodedAttributes.value;
  }

  if (fields.has('retain')) {
    const length: DecodeResult<number> = positiveInteger(fields.optional('retain'), fields.path('retain'));
    if (!length.ok) {
      return length;
    }
    return success({ kind: 'retain', length: length.value, attributes: attributes });
  }

  const inserted: unknown = fields.optional('insert');
  if (typeof inserted === 'string') {
    return success({ kind: 'insert-text', text: inserted, attributes: attributes });
  }
  if (!isPlainObject(inserted)) {
    return failure(fields.path('insert'), 'expected a string or an embed object');
  }
  const embed: DecodeResult<JsonObject> = anyJsonObject(inserted, fields.path('insert'));
  if (!embed.ok) {
    return embed;
  }
  return success({ kind: 'insert-embed', embed: embed.value, attributes: attributes });
};
