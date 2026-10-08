import { hasOwnProp, isPlainObject } from '../utils/type-utils';
import {
  arrayOf,
  DecodeResult,
  Decoder,
  exactFields,
  failure,
  Fields,
  firstOf,
  integerValue,
  literal,
  map,
  nonNegativeInteger,
  nullable,
  oneOf,
  positiveInteger,
  propertyPath,
  recordOf,
  ROOT_PATH,
  stringValue,
  success
} from './decoder';
import {
  ErrorReply,
  ErrorReplyAction,
  OpMessage,
  OutboundError,
  OutboundMessage,
  OutboundOpContent,
  OutboundSnapshot,
  PresenceMessage,
  QueryDiff,
  ResultSnapshot,
  SnapshotMapEntry
} from './outbound-messages';
import { JSON0_TYPE_NAME, JSON0_TYPE_URI, RICH_TEXT_TYPE_URI } from './protocol-config';

/**
 * Decoders for the messages ShareDB 5.2.2's Agent writes to a client stream, for the requests the gateway forwards.
 * The input is the result of `JSON.parse(JSON.stringify(message))`, so keys whose value was `undefined` are gone and
 * arraydiff objects have become plain objects. Shapes and line numbers refer to node_modules/sharedb/lib/agent.js.
 *
 * Only the fields that say which docs, queries and requests a message is about are checked closely. Doc contents
 * (snapshot data, op contents, query `extra`, presence values) are passed on as `unknown`.
 */

/**
 * The longest collection name, doc id, presence channel, connection id or presence id accepted. Generous on purpose:
 * replies echo what the gateway forwarded, so these must not be stricter than the inbound decoders' bounds.
 */
const MAX_NAME_LENGTH = 4096;
/** The longest error code string accepted. */
const MAX_ERROR_CODE_LENGTH = 256;
/**
 * Bound for lengths the server's own output has no meaningful limit on, such as error message text, query results
 * and bulk reply maps. The decoders need some bound; this one never refuses anything a real server sends.
 */
const NO_PRACTICAL_LIMIT = Number.MAX_SAFE_INTEGER;
/** The name ShareDB registers the rich-text OT type under. */
const RICH_TEXT_TYPE_NAME = 'rich-text';
/** The ShareDB protocol version the server announces in `init` and `hs` replies (sharedb/lib/protocol.js). */
const PROTOCOL_MAJOR = 1;
const PROTOCOL_MINOR = 2;

const nameValue: Decoder<string> = stringValue({ minLength: 1, maxLength: MAX_NAME_LENGTH });
const errorMessageValue: Decoder<string> = stringValue({ maxLength: NO_PRACTICAL_LIMIT });
/** Query ids and `nf` request ids. The client numbers them from 1; a 0 would not reveal anything, so it is allowed. */
const requestIdValue: Decoder<number> = nonNegativeInteger;
const unknownValue: Decoder<unknown> = (input: unknown): DecodeResult<unknown> => success(input);

/**
 * An OT type as ShareDB names it in a snapshot, a create op or a doc presence. ShareDB accepts a type's short name
 * wherever it accepts its URI, so both are accepted; the result is always the URI.
 */
const otTypeValue: Decoder<string> = map(
  oneOf([JSON0_TYPE_URI, RICH_TEXT_TYPE_URI, JSON0_TYPE_NAME, RICH_TEXT_TYPE_NAME]),
  (type: string): string => {
    if (type === JSON0_TYPE_NAME) {
      return JSON0_TYPE_URI;
    }
    if (type === RICH_TEXT_TYPE_NAME) {
      return RICH_TEXT_TYPE_URI;
    }
    return type;
  }
);

/**
 * Decodes one message ShareDB wrote to a client stream, after a JSON round trip. Anything that is not exactly one of
 * the shapes ShareDB produces for the requests the gateway forwards is refused.
 */
export function decodeOutboundMessage(raw: unknown): DecodeResult<OutboundMessage> {
  const path: string = ROOT_PATH;
  if (!isPlainObject(raw)) {
    return failure(path, 'expected a plain object');
  }
  const action: unknown = ownDataValue(raw, 'a');
  if (hasOwnProp(raw, 'error')) {
    // A presence relay error and an error reply to the client's own `p` both have action `p` and an error. The
    // reply echoes the request, which always has `p` and `pv`, so the relay error is the one with only these keys.
    if (action === 'p' && hasOnlyKeys(raw, ['a', 'ch', 'id', 'error'])) {
      return decodePresenceError(raw, path);
    }
    return decodeErrorReply(raw, path);
  }
  switch (action) {
    case 'init':
    case 'hs':
      return decodeHandshake(raw, path, action);
    case 'f':
    case 's':
      return decodeDocReply(raw, path, action);
    case 'u':
      return decodeUnsubscribeReply(raw, path);
    case 'bf':
    case 'bs':
      return decodeBulkReply(raw, path, action);
    case 'bu':
      return decodeBulkUnsubscribeReply(raw, path);
    case 'qf':
      return decodeQueryFetchReply(raw, path);
    case 'qs':
      return decodeQuerySubscribeReply(raw, path);
    case 'qu':
      return decodeQueryUnsubscribeReply(raw, path);
    case 'q':
      return decodeQueryUpdate(raw, path);
    case 'op':
      return decodeOpMessage(raw, path);
    case 'nf':
      return decodeSnapshotFetchReply(raw, path);
    case 'p':
      return decodePresence(raw, path);
    case 'pr':
      return decodePresenceRequest(raw, path);
    case 'ps':
    case 'pu':
      return decodePresenceSubscriptionReply(raw, path, action);
    default:
      return failure(propertyPath(path, 'a'), 'unexpected action');
  }
}

/** The value of an own data property, without running a getter. exactFields later checks the whole key set. */
function ownDataValue(input: object, key: string): unknown {
  const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(input, key);
  return descriptor?.value;
}

function hasOnlyKeys(input: object, keys: readonly string[]): boolean {
  const ownKeys: string[] = Object.getOwnPropertyNames(input);
  return ownKeys.length === keys.length && ownKeys.every((key: string) => keys.includes(key));
}

/** Decodes a field that `exactFields` has already confirmed is present. */
function field<K extends string, T>(fields: Fields<K, never>, key: K, decoder: Decoder<T>): DecodeResult<T> {
  return decoder(fields.required(key), fields.path(key));
}

/** Decodes an optional field, giving null when it is absent. */
function optionalField<R extends string, O extends string, T>(
  fields: Fields<R, O>,
  key: O,
  decoder: Decoder<T>
): DecodeResult<T | null> {
  if (!fields.has(key)) {
    return success(null);
  }
  return decoder(fields.optional(key), fields.path(key));
}

// Errors and snapshots

/** getReplyErrorObject (agent.js:301-316): `{code, message}`, either of which is absent when the error had none. */
const errorValue: Decoder<OutboundError> = (input: unknown, path: string): DecodeResult<OutboundError> => {
  const fields: DecodeResult<Fields<never, 'code' | 'message'>> = exactFields(input, path, [], ['code', 'message']);
  if (!fields.ok) {
    return fields;
  }
  // A string for ShareDB's own codes, a number for database errors and the realtime server's own (such as 4000).
  const codeValue: Decoder<string | number> = firstOf<string | number>(
    [
      stringValue({ minLength: 1, maxLength: MAX_ERROR_CODE_LENGTH }),
      integerValue({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER })
    ],
    'a string or integer error code'
  );
  const code: DecodeResult<string | number | null> = optionalField(fields.value, 'code', codeValue);
  if (!code.ok) {
    return code;
  }
  const message: DecodeResult<string | null> = optionalField(fields.value, 'message', errorMessageValue);
  if (!message.ok) {
    return message;
  }
  return success({ code: code.value, message: message.value });
};

/** The fields of a snapshot as ShareDB writes it, read from whichever message carries it. */
interface SnapshotFields {
  readonly version: unknown;
  readonly hasType: boolean;
  readonly type: unknown;
  readonly hasData: boolean;
  readonly data: unknown;
}

/**
 * Builds a snapshot from getSnapshotData's fields (agent.js:625-634) or from an `nf` reply's. `type` is absent for
 * json0 docs (the default type), and null for a doc that does not exist, which then has no data. `path` is the path of
 * the object holding the fields.
 */
function snapshotFrom(snapshotFields: SnapshotFields, path: string): DecodeResult<OutboundSnapshot> {
  const version: DecodeResult<number> = nonNegativeInteger(snapshotFields.version, propertyPath(path, 'v'));
  if (!version.ok) {
    return version;
  }
  let type: string | null = JSON0_TYPE_URI;
  if (snapshotFields.hasType) {
    const decodedType: DecodeResult<string | null> = nullable(otTypeValue)(
      snapshotFields.type,
      propertyPath(path, 'type')
    );
    if (!decodedType.ok) {
      return decodedType;
    }
    type = decodedType.value;
  }
  if (type == null) {
    if (snapshotFields.hasData) {
      return failure(propertyPath(path, 'data'), 'a doc that does not exist has no data');
    }
    return success({ exists: false, version: version.value });
  }
  if (!snapshotFields.hasData) {
    return failure(path, 'missing keys: data');
  }
  return success({ exists: true, version: version.value, type: type, data: snapshotFields.data });
}

/** The snapshot fields of an object that has `v`, and may have `data` and `type`. */
function snapshotFieldsOf<R extends string>(fields: Fields<R | 'v', 'data' | 'type'>): SnapshotFields {
  return {
    version: fields.required('v'),
    hasType: fields.has('type'),
    type: fields.optional('type'),
    hasData: fields.has('data'),
    data: fields.optional('data')
  };
}

/** A snapshot in a doc or bulk reply: `{v, data?, type?}`. */
const snapshotValue: Decoder<OutboundSnapshot> = (input: unknown, path: string): DecodeResult<OutboundSnapshot> => {
  const fields: DecodeResult<Fields<'v', 'data' | 'type'>> = exactFields(input, path, ['v'], ['data', 'type']);
  if (!fields.ok) {
    return fields;
  }
  return snapshotFrom(snapshotFieldsOf(fields.value), path);
};

/** A snapshot in query results (getResultsData, agent.js:598-607): a snapshot plus its doc id `d`. */
const resultSnapshotValue: Decoder<ResultSnapshot> = (input: unknown, path: string): DecodeResult<ResultSnapshot> => {
  const fields: DecodeResult<Fields<'v' | 'd', 'data' | 'type'>> = exactFields(
    input,
    path,
    ['v', 'd'],
    ['data', 'type']
  );
  if (!fields.ok) {
    return fields;
  }
  const docId: DecodeResult<string> = field(fields.value, 'd', nameValue);
  if (!docId.ok) {
    return docId;
  }
  const snapshot: DecodeResult<OutboundSnapshot> = snapshotFrom(snapshotFieldsOf(fields.value), path);
  if (!snapshot.ok) {
    return snapshot;
  }
  return success({ ...snapshot.value, docId: docId.value });
};

const resultSnapshotsValue: Decoder<readonly ResultSnapshot[]> = arrayOf(resultSnapshotValue, {
  maxLength: NO_PRACTICAL_LIMIT
});

/** One entry of getMapResult (agent.js:609-623): a snapshot, or `{error}` for a doc whose read was refused. */
const snapshotMapEntryValue: Decoder<SnapshotMapEntry> = (
  input: unknown,
  path: string
): DecodeResult<SnapshotMapEntry> => {
  if (isPlainObject(input) && hasOwnProp(input, 'error')) {
    const fields: DecodeResult<Fields<'error', never>> = exactFields(input, path, ['error']);
    if (!fields.ok) {
      return fields;
    }
    const error: DecodeResult<OutboundError> = field(fields.value, 'error', errorValue);
    if (!error.ok) {
      return error;
    }
    return success({ kind: 'error', error: error.value });
  }
  const snapshot: DecodeResult<OutboundSnapshot> = snapshotValue(input, path);
  if (!snapshot.ok) {
    return snapshot;
  }
  return success({ kind: 'snapshot', snapshot: snapshot.value });
};

const snapshotMapValue: Decoder<ReadonlyMap<string, SnapshotMapEntry>> = recordOf(nameValue, snapshotMapEntryValue, {
  maxEntries: NO_PRACTICAL_LIMIT
});

const docIdsValue: Decoder<readonly string[]> = arrayOf(nameValue, { maxLength: NO_PRACTICAL_LIMIT });
const docVersionsValue: Decoder<ReadonlyMap<string, number>> = recordOf(nameValue, nonNegativeInteger, {
  maxEntries: NO_PRACTICAL_LIMIT
});

// Handshake and single docs

/** `init` (agent.js:74) and the `hs` reply (agent.js:441-444) have the same shape (_initMessage, agent.js:792-800). */
function decodeHandshake(raw: unknown, path: string, action: 'init' | 'hs'): DecodeResult<OutboundMessage> {
  const fields: DecodeResult<Fields<'a' | 'protocol' | 'protocolMinor' | 'id' | 'type', never>> = exactFields(
    raw,
    path,
    ['a', 'protocol', 'protocolMinor', 'id', 'type']
  );
  if (!fields.ok) {
    return fields;
  }
  const protocol: DecodeResult<number> = field(fields.value, 'protocol', literal(PROTOCOL_MAJOR));
  if (!protocol.ok) {
    return protocol;
  }
  const protocolMinor: DecodeResult<number> = field(fields.value, 'protocolMinor', literal(PROTOCOL_MINOR));
  if (!protocolMinor.ok) {
    return protocolMinor;
  }
  const type: DecodeResult<string> = field(fields.value, 'type', literal(JSON0_TYPE_URI));
  if (!type.ok) {
    return type;
  }
  const id: DecodeResult<string> = field(fields.value, 'id', nameValue);
  if (!id.ok) {
    return id;
  }
  if (action === 'init') {
    return success({ kind: 'init', id: id.value });
  }
  return success({ kind: 'handshake-reply', id: id.value });
}

/**
 * The reply to `f` or `s` (agent.js:645-651, 695-719): `{a, c, d, data}`, or `{a, c, d}` when the request had a
 * version and the ops were sent before the reply.
 */
function decodeDocReply(raw: unknown, path: string, action: 'f' | 's'): DecodeResult<OutboundMessage> {
  const fields: DecodeResult<Fields<'a' | 'c' | 'd', 'data'>> = exactFields(raw, path, ['a', 'c', 'd'], ['data']);
  if (!fields.ok) {
    return fields;
  }
  const collection: DecodeResult<string> = field(fields.value, 'c', nameValue);
  if (!collection.ok) {
    return collection;
  }
  const docId: DecodeResult<string> = field(fields.value, 'd', nameValue);
  if (!docId.ok) {
    return docId;
  }
  const snapshot: DecodeResult<OutboundSnapshot | null> = optionalField(fields.value, 'data', snapshotValue);
  if (!snapshot.ok) {
    return snapshot;
  }
  return success({
    kind: action === 'f' ? 'fetch-reply' : 'subscribe-reply',
    collection: collection.value,
    docId: docId.value,
    snapshot: snapshot.value
  });
}

/** The reply to `u` (agent.js:744-751). */
function decodeUnsubscribeReply(raw: unknown, path: string): DecodeResult<OutboundMessage> {
  const fields: DecodeResult<Fields<'a' | 'c' | 'd', never>> = exactFields(raw, path, ['a', 'c', 'd']);
  if (!fields.ok) {
    return fields;
  }
  const collection: DecodeResult<string> = field(fields.value, 'c', nameValue);
  if (!collection.ok) {
    return collection;
  }
  const docId: DecodeResult<string> = field(fields.value, 'd', nameValue);
  if (!docId.ok) {
    return docId;
  }
  return success({ kind: 'unsubscribe-reply', collection: collection.value, docId: docId.value });
}

// Bulk

/**
 * The reply to `bf` or `bs`. With a list of ids it carries a snapshot map in `data` and does not echo `b`
 * (agent.js:334); with a versions map it echoes the map in `b`, the ops having been sent before it.
 */
function decodeBulkReply(raw: unknown, path: string, action: 'bf' | 'bs'): DecodeResult<OutboundMessage> {
  const fields: DecodeResult<Fields<'a' | 'c', 'data' | 'b'>> = exactFields(raw, path, ['a', 'c'], ['data', 'b']);
  if (!fields.ok) {
    return fields;
  }
  const collection: DecodeResult<string> = field(fields.value, 'c', nameValue);
  if (!collection.ok) {
    return collection;
  }
  if (fields.value.has('data') === fields.value.has('b')) {
    return failure(path, 'expected exactly one of data and b');
  }
  if (fields.value.has('data')) {
    const snapshots: DecodeResult<ReadonlyMap<string, SnapshotMapEntry>> = snapshotMapValue(
      fields.value.optional('data'),
      fields.value.path('data')
    );
    if (!snapshots.ok) {
      return snapshots;
    }
    return success({
      kind: action === 'bf' ? 'bulk-fetch-reply' : 'bulk-subscribe-reply',
      collection: collection.value,
      snapshots: snapshots.value
    });
  }
  const versions: DecodeResult<ReadonlyMap<string, number>> = docVersionsValue(
    fields.value.optional('b'),
    fields.value.path('b')
  );
  if (!versions.ok) {
    return versions;
  }
  return success({
    kind: action === 'bf' ? 'bulk-fetch-versions-reply' : 'bulk-subscribe-versions-reply',
    collection: collection.value,
    versions: versions.value
  });
}

/** The reply to `bu`, which echoes its list of ids. */
function decodeBulkUnsubscribeReply(raw: unknown, path: string): DecodeResult<OutboundMessage> {
  const fields: DecodeResult<Fields<'a' | 'c' | 'b', never>> = exactFields(raw, path, ['a', 'c', 'b']);
  if (!fields.ok) {
    return fields;
  }
  const collection: DecodeResult<string> = field(fields.value, 'c', nameValue);
  if (!collection.ok) {
    return collection;
  }
  const ids: DecodeResult<readonly string[]> = field(fields.value, 'b', docIdsValue);
  if (!ids.ok) {
    return ids;
  }
  return success({ kind: 'bulk-unsubscribe-reply', collection: collection.value, ids: ids.value });
}

// Queries

/** The reply to `qf` (agent.js:535-545). `extra` is absent unless the query produced one, such as a `$count`. */
function decodeQueryFetchReply(raw: unknown, path: string): DecodeResult<OutboundMessage> {
  const fields: DecodeResult<Fields<'a' | 'id' | 'data', 'extra'>> = exactFields(
    raw,
    path,
    ['a', 'id', 'data'],
    ['extra']
  );
  if (!fields.ok) {
    return fields;
  }
  const queryId: DecodeResult<number> = field(fields.value, 'id', requestIdValue);
  if (!queryId.ok) {
    return queryId;
  }
  const results: DecodeResult<readonly ResultSnapshot[]> = field(fields.value, 'data', resultSnapshotsValue);
  if (!results.ok) {
    return results;
  }
  return success({
    kind: 'query-fetch-reply',
    queryId: queryId.value,
    results: results.value,
    hasExtra: fields.value.has('extra'),
    extra: fields.value.optional('extra')
  });
}

/**
 * The reply to `qs` (agent.js:547-588), in three forms: `{a, id, data: results[], extra?}` for a fresh subscribe;
 * `{a, id, data: snapshotMap}` when `r` listed docs with a null version; `{a, id}` when `r` listed only docs with
 * versions.
 */
function decodeQuerySubscribeReply(raw: unknown, path: string): DecodeResult<OutboundMessage> {
  const fields: DecodeResult<Fields<'a' | 'id', 'data' | 'extra'>> = exactFields(
    raw,
    path,
    ['a', 'id'],
    ['data', 'extra']
  );
  if (!fields.ok) {
    return fields;
  }
  const queryId: DecodeResult<number> = field(fields.value, 'id', requestIdValue);
  if (!queryId.ok) {
    return queryId;
  }
  const hasExtra: boolean = fields.value.has('extra');
  const extra: unknown = fields.value.optional('extra');
  if (!fields.value.has('data')) {
    if (hasExtra) {
      return failure(propertyPath(path, 'extra'), 'extra comes only with query results');
    }
    return success({
      kind: 'query-subscribe-reply',
      queryId: queryId.value,
      data: { form: 'none' },
      hasExtra: false,
      extra: undefined
    });
  }
  const data: unknown = fields.value.optional('data');
  const dataPath: string = fields.value.path('data');
  if (Array.isArray(data)) {
    const results: DecodeResult<readonly ResultSnapshot[]> = resultSnapshotsValue(data, dataPath);
    if (!results.ok) {
      return results;
    }
    return success({
      kind: 'query-subscribe-reply',
      queryId: queryId.value,
      data: { form: 'results', results: results.value },
      hasExtra: hasExtra,
      extra: extra
    });
  }
  if (hasExtra) {
    return failure(propertyPath(path, 'extra'), 'extra comes only with query results');
  }
  const snapshots: DecodeResult<ReadonlyMap<string, SnapshotMapEntry>> = snapshotMapValue(data, dataPath);
  if (!snapshots.ok) {
    return snapshots;
  }
  return success({
    kind: 'query-subscribe-reply',
    queryId: queryId.value,
    data: { form: 'snapshot-map', snapshots: snapshots.value },
    hasExtra: false,
    extra: undefined
  });
}

/** The reply to `qu` (agent.js:636-643). */
function decodeQueryUnsubscribeReply(raw: unknown, path: string): DecodeResult<OutboundMessage> {
  const fields: DecodeResult<Fields<'a' | 'id', never>> = exactFields(raw, path, ['a', 'id']);
  if (!fields.ok) {
    return fields;
  }
  const queryId: DecodeResult<number> = field(fields.value, 'id', requestIdValue);
  if (!queryId.ok) {
    return queryId;
  }
  return success({ kind: 'query-unsubscribe-reply', queryId: queryId.value });
}

/**
 * `q`, a subscribed query's update (agent.js:199-213): `{a, id, diff}`, or `{a, id, extra}` when its `extra`
 * changed (`{a, id}` if the new `extra` serialized to nothing).
 */
function decodeQueryUpdate(raw: unknown, path: string): DecodeResult<OutboundMessage> {
  const fields: DecodeResult<Fields<'a' | 'id', 'diff' | 'extra'>> = exactFields(
    raw,
    path,
    ['a', 'id'],
    ['diff', 'extra']
  );
  if (!fields.ok) {
    return fields;
  }
  const queryId: DecodeResult<number> = field(fields.value, 'id', requestIdValue);
  if (!queryId.ok) {
    return queryId;
  }
  if (fields.value.has('diff')) {
    if (fields.value.has('extra')) {
      return failure(path, 'expected only one of diff and extra');
    }
    const diff: DecodeResult<readonly QueryDiff[]> = arrayOf(queryDiffValue, { maxLength: NO_PRACTICAL_LIMIT })(
      fields.value.optional('diff'),
      fields.value.path('diff')
    );
    if (!diff.ok) {
      return diff;
    }
    return success({ kind: 'query-diff', queryId: queryId.value, diff: diff.value });
  }
  return success({
    kind: 'query-extra',
    queryId: queryId.value,
    hasExtra: fields.value.has('extra'),
    extra: fields.value.optional('extra')
  });
}

/**
 * One item of a query diff, as arraydiff's toJSON writes it (arraydiff.js:11-48). Insert values have been replaced
 * by result snapshots (agent.js:204-209).
 */
const queryDiffValue: Decoder<QueryDiff> = (input: unknown, path: string): DecodeResult<QueryDiff> => {
  if (!isPlainObject(input)) {
    return failure(path, 'expected a plain object');
  }
  const type: unknown = ownDataValue(input, 'type');
  switch (type) {
    case 'insert': {
      const fields: DecodeResult<Fields<'type' | 'index' | 'values', never>> = exactFields(input, path, [
        'type',
        'index',
        'values'
      ]);
      if (!fields.ok) {
        return fields;
      }
      const index: DecodeResult<number> = field(fields.value, 'index', nonNegativeInteger);
      if (!index.ok) {
        return index;
      }
      const values: DecodeResult<readonly ResultSnapshot[]> = field(fields.value, 'values', resultSnapshotsValue);
      if (!values.ok) {
        return values;
      }
      return success({ kind: 'insert', index: index.value, values: values.value });
    }
    case 'remove': {
      const fields: DecodeResult<Fields<'type' | 'index' | 'howMany', never>> = exactFields(input, path, [
        'type',
        'index',
        'howMany'
      ]);
      if (!fields.ok) {
        return fields;
      }
      const index: DecodeResult<number> = field(fields.value, 'index', nonNegativeInteger);
      if (!index.ok) {
        return index;
      }
      const howMany: DecodeResult<number> = field(fields.value, 'howMany', positiveInteger);
      if (!howMany.ok) {
        return howMany;
      }
      return success({ kind: 'remove', index: index.value, howMany: howMany.value });
    }
    case 'move': {
      const fields: DecodeResult<Fields<'type' | 'from' | 'to' | 'howMany', never>> = exactFields(input, path, [
        'type',
        'from',
        'to',
        'howMany'
      ]);
      if (!fields.ok) {
        return fields;
      }
      const from: DecodeResult<number> = field(fields.value, 'from', nonNegativeInteger);
      if (!from.ok) {
        return from;
      }
      const to: DecodeResult<number> = field(fields.value, 'to', nonNegativeInteger);
      if (!to.ok) {
        return to;
      }
      const howMany: DecodeResult<number> = field(fields.value, 'howMany', positiveInteger);
      if (!howMany.ok) {
        return howMany;
      }
      return success({ kind: 'move', from: from.value, to: to.value, howMany: howMany.value });
    }
    default:
      return failure(propertyPath(path, 'type'), 'expected "insert", "remove" or "move"');
  }
};

// Ops

/**
 * `op`: an op push (_sendOp, agent.js:274-288) `{a, c, d, v, src?, seq?, op? | create? | del?}`, or the ack of a
 * submitted op (agent.js:764-782) `{a, c, d, src, seq, v, fixup?}`. `src` and `seq` are absent on ops stored
 * without them. A push with none of op, create and del is a no-op.
 */
function decodeOpMessage(raw: unknown, path: string): DecodeResult<OpMessage> {
  const fields: DecodeResult<Fields<'a' | 'c' | 'd' | 'v', 'src' | 'seq' | 'op' | 'create' | 'del' | 'fixup'>> =
    exactFields(raw, path, ['a', 'c', 'd', 'v'], ['src', 'seq', 'op', 'create', 'del', 'fixup']);
  if (!fields.ok) {
    return fields;
  }
  const collection: DecodeResult<string> = field(fields.value, 'c', nameValue);
  if (!collection.ok) {
    return collection;
  }
  const docId: DecodeResult<string> = field(fields.value, 'd', nameValue);
  if (!docId.ok) {
    return docId;
  }
  const version: DecodeResult<number> = field(fields.value, 'v', nonNegativeInteger);
  if (!version.ok) {
    return version;
  }
  // Ops stored without a src or seq can come back from MongoDB with null in place of the missing value, so null is
  // read the same as absent.
  const src: DecodeResult<string | null> = optionalField(fields.value, 'src', nullable(nameValue));
  if (!src.ok) {
    return src;
  }
  const seq: DecodeResult<number | null> = optionalField(fields.value, 'seq', nullable(positiveInteger));
  if (!seq.ok) {
    return seq;
  }
  const content: DecodeResult<OutboundOpContent> = opContentFrom(fields.value, path);
  if (!content.ok) {
    return content;
  }
  let fixup: readonly unknown[] = [];
  if (fields.value.has('fixup')) {
    // Only an ack carries fixup, and only when there is at least one (agent.js:767).
    if (content.value.kind !== 'none' || src.value == null || seq.value == null) {
      return failure(propertyPath(path, 'fixup'), 'only an op ack carries fixup');
    }
    const decodedFixup: DecodeResult<readonly unknown[]> = arrayOf(unknownValue, {
      minLength: 1,
      maxLength: NO_PRACTICAL_LIMIT
    })(fields.value.optional('fixup'), fields.value.path('fixup'));
    if (!decodedFixup.ok) {
      return decodedFixup;
    }
    fixup = decodedFixup.value;
  }
  return success({
    kind: 'op',
    collection: collection.value,
    docId: docId.value,
    version: version.value,
    src: src.value,
    seq: seq.value,
    content: content.value,
    fixup: fixup
  });
}

/** What an op message carries: at most one of `op`, `create` (`{type, data?}`) and `del` (always `true`). */
function opContentFrom(
  fields: Fields<'a' | 'c' | 'd' | 'v', 'src' | 'seq' | 'op' | 'create' | 'del' | 'fixup'>,
  path: string
): DecodeResult<OutboundOpContent> {
  const allContentKeys: readonly ('op' | 'create' | 'del')[] = ['op', 'create', 'del'];
  const contentKeys: ('op' | 'create' | 'del')[] = allContentKeys.filter((key: 'op' | 'create' | 'del') =>
    fields.has(key)
  );
  if (contentKeys.length > 1) {
    return failure(path, 'expected at most one of op, create and del');
  }
  if (fields.has('op')) {
    return success({ kind: 'edit', op: fields.optional('op') });
  }
  if (fields.has('create')) {
    const createPath: string = fields.path('create');
    const createFields: DecodeResult<Fields<'type', 'data'>> = exactFields(
      fields.optional('create'),
      createPath,
      ['type'],
      ['data']
    );
    if (!createFields.ok) {
      return createFields;
    }
    const type: DecodeResult<string> = field(createFields.value, 'type', otTypeValue);
    if (!type.ok) {
      return type;
    }
    return success({ kind: 'create', type: type.value, data: createFields.value.optional('data') });
  }
  if (fields.has('del')) {
    const del: DecodeResult<true> = literal(true)(fields.optional('del'), fields.path('del'));
    if (!del.ok) {
      return del;
    }
    return success({ kind: 'delete' });
  }
  return success({ kind: 'none' });
}

/**
 * The reply to `nf` (agent.js:784-790, backend.js:783-807). The reply object is the Snapshot itself
 * (sharedb/lib/snapshot.js) with `a` added and `id` overwritten by the request id (agent.js:329-330), so unlike other
 * snapshots `type` is always present (json0's URI included) and so is the snapshot metadata `m`.
 */
function decodeSnapshotFetchReply(raw: unknown, path: string): DecodeResult<OutboundMessage> {
  const fields: DecodeResult<Fields<'a' | 'id' | 'v' | 'type' | 'm', 'data'>> = exactFields(
    raw,
    path,
    ['a', 'id', 'v', 'type', 'm'],
    ['data']
  );
  if (!fields.ok) {
    return fields;
  }
  const requestId: DecodeResult<number> = field(fields.value, 'id', requestIdValue);
  if (!requestId.ok) {
    return requestId;
  }
  const meta: unknown = fields.value.required('m');
  if (meta !== null && !isPlainObject(meta)) {
    return failure(fields.value.path('m'), 'expected null or a plain object');
  }
  const snapshotFields: SnapshotFields = {
    version: fields.value.required('v'),
    hasType: true,
    type: fields.value.required('type'),
    hasData: fields.value.has('data'),
    data: fields.value.optional('data')
  };
  const snapshot: DecodeResult<OutboundSnapshot> = snapshotFrom(snapshotFields, path);
  if (!snapshot.ok) {
    return snapshot;
  }
  return success({ kind: 'snapshot-fetch-reply', requestId: requestId.value, snapshot: snapshot.value });
}

// Presence

/**
 * `p`: a presence relayed from another connection (agent.js:945-964), or the client's own presence echoed back as
 * the reply to its `p` (agent.js:846). Both are the object _createPresence builds (agent.js:883-897):
 * `{a, ch, src, id, p, pv, c?, d?, v?, t?}`, where `c`, `d`, `v` and `t` are all present for doc presence and all
 * absent for plain presence.
 *
 * When a connection's presence subscription ends (it unsubscribed or disconnected), ShareDB relays its presence once
 * more with `p: null`, after running `request.seq++` on a presence object that has no `seq` (agent.js:180). That makes
 * `seq` NaN, which JSON writes as null. So these relays also carry `seq: null`.
 */
function decodePresence(raw: unknown, path: string): DecodeResult<PresenceMessage> {
  const fields: DecodeResult<Fields<'a' | 'ch' | 'src' | 'id' | 'p' | 'pv', 'c' | 'd' | 'v' | 't' | 'seq'>> =
    exactFields(raw, path, ['a', 'ch', 'src', 'id', 'p', 'pv'], ['c', 'd', 'v', 't', 'seq']);
  if (!fields.ok) {
    return fields;
  }
  const channel: DecodeResult<string> = field(fields.value, 'ch', nameValue);
  if (!channel.ok) {
    return channel;
  }
  const src: DecodeResult<string> = field(fields.value, 'src', nameValue);
  if (!src.ok) {
    return src;
  }
  const presenceId: DecodeResult<string> = field(fields.value, 'id', nameValue);
  if (!presenceId.ok) {
    return presenceId;
  }
  const presenceVersion: DecodeResult<number> = field(fields.value, 'pv', nonNegativeInteger);
  if (!presenceVersion.ok) {
    return presenceVersion;
  }
  const seq: DecodeResult<null> = optionalField(fields.value, 'seq', literal(null));
  if (!seq.ok) {
    return seq;
  }
  const allDocKeys: readonly ('c' | 'd' | 'v' | 't')[] = ['c', 'd', 'v', 't'];
  const docKeys: ('c' | 'd' | 'v' | 't')[] = allDocKeys.filter((key: 'c' | 'd' | 'v' | 't') => fields.value.has(key));
  let doc: PresenceMessage['doc'] = null;
  if (docKeys.length === 4) {
    const collection: DecodeResult<string> = nameValue(fields.value.optional('c'), fields.value.path('c'));
    if (!collection.ok) {
      return collection;
    }
    const docId: DecodeResult<string> = nameValue(fields.value.optional('d'), fields.value.path('d'));
    if (!docId.ok) {
      return docId;
    }
    const version: DecodeResult<number> = nonNegativeInteger(fields.value.optional('v'), fields.value.path('v'));
    if (!version.ok) {
      return version;
    }
    const type: DecodeResult<string> = otTypeValue(fields.value.optional('t'), fields.value.path('t'));
    if (!type.ok) {
      return type;
    }
    doc = { collection: collection.value, docId: docId.value, version: version.value, type: type.value };
  } else if (docKeys.length > 0) {
    return failure(path, 'expected all or none of c, d, v and t');
  }
  return success({
    kind: 'presence',
    channel: channel.value,
    src: src.value,
    presenceId: presenceId.value,
    value: fields.value.required('p'),
    presenceVersion: presenceVersion.value,
    doc: doc
  });
}

/** `{a: 'p', ch, id, error}`: relaying a presence to this connection failed (agent.js:957-958). */
function decodePresenceError(raw: unknown, path: string): DecodeResult<OutboundMessage> {
  const fields: DecodeResult<Fields<'a' | 'ch' | 'id' | 'error', never>> = exactFields(raw, path, [
    'a',
    'ch',
    'id',
    'error'
  ]);
  if (!fields.ok) {
    return fields;
  }
  const channel: DecodeResult<string> = field(fields.value, 'ch', nameValue);
  if (!channel.ok) {
    return channel;
  }
  const presenceId: DecodeResult<string> = field(fields.value, 'id', nameValue);
  if (!presenceId.ok) {
    return presenceId;
  }
  const error: DecodeResult<OutboundError> = field(fields.value, 'error', errorValue);
  if (!error.ok) {
    return error;
  }
  return success({ kind: 'presence-error', channel: channel.value, presenceId: presenceId.value, error: error.value });
}

/**
 * `pr`: `{a, ch}` relayed when someone asks for everyone's presence on a channel (agent.js:948), or `{a}` as the
 * reply to the client's own `pr`, whose callback has no message (agent.js:940-943).
 */
function decodePresenceRequest(raw: unknown, path: string): DecodeResult<OutboundMessage> {
  const fields: DecodeResult<Fields<'a', 'ch'>> = exactFields(raw, path, ['a'], ['ch']);
  if (!fields.ok) {
    return fields;
  }
  const channel: DecodeResult<string | null> = optionalField(fields.value, 'ch', nameValue);
  if (!channel.ok) {
    return channel;
  }
  if (channel.value == null) {
    return success({ kind: 'presence-request-reply' });
  }
  return success({ kind: 'presence-request-relay', channel: channel.value });
}

/** The reply to `ps` or `pu`: `{a, ch, seq}` (agent.js:899-934). */
function decodePresenceSubscriptionReply(
  raw: unknown,
  path: string,
  action: 'ps' | 'pu'
): DecodeResult<OutboundMessage> {
  const fields: DecodeResult<Fields<'a' | 'ch' | 'seq', never>> = exactFields(raw, path, ['a', 'ch', 'seq']);
  if (!fields.ok) {
    return fields;
  }
  const channel: DecodeResult<string> = field(fields.value, 'ch', nameValue);
  if (!channel.ok) {
    return channel;
  }
  const seq: DecodeResult<number> = field(fields.value, 'seq', positiveInteger);
  if (!seq.ok) {
    return seq;
  }
  return success({
    kind: action === 'ps' ? 'presence-subscribe-reply' : 'presence-unsubscribe-reply',
    channel: channel.value,
    seq: seq.value
  });
}

// Error replies

/** The keys of a forwarded request, other than `a`, that an error reply can echo. */
type RequestKey =
  | 'id'
  | 'protocol'
  | 'protocolMinor'
  | 'c'
  | 'd'
  | 'v'
  | 'b'
  | 'src'
  | 'seq'
  | 'x'
  | 'op'
  | 'create'
  | 'q'
  | 'r'
  | 'ch'
  | 'p'
  | 'pv'
  | 't';

/**
 * Which keys the request the gateway forwards for each action carries (see forwarded-messages.ts), as ShareDB echoes
 * it in an error reply. `required` are the keys that identify the request, which every forwarded request of that
 * action has; `optional` are the rest. ShareDB echoes the request object after its own changes, such as rewriting a
 * create's type to its URI (submit-request.js:290-293); those change values, not keys.
 */
const ERROR_REPLY_KEYS: {
  readonly [A in ErrorReplyAction]: {
    readonly required: readonly RequestKey[];
    readonly optional: readonly RequestKey[];
  };
} = {
  hs: { required: [], optional: ['id', 'protocol', 'protocolMinor'] },
  f: { required: ['c', 'd'], optional: ['v'] },
  s: { required: ['c', 'd'], optional: ['v'] },
  u: { required: ['c', 'd'], optional: [] },
  bf: { required: ['c', 'b'], optional: [] },
  bs: { required: ['c', 'b'], optional: [] },
  bu: { required: ['c', 'b'], optional: [] },
  op: { required: ['c', 'd', 'seq'], optional: ['v', 'src', 'x', 'op', 'create'] },
  qf: { required: ['id', 'c'], optional: ['q'] },
  qs: { required: ['id', 'c'], optional: ['q', 'r'] },
  qu: { required: ['id'], optional: [] },
  nf: { required: ['id', 'c', 'd'], optional: ['v'] },
  ps: { required: ['ch', 'seq'], optional: [] },
  pu: { required: ['ch', 'seq'], optional: [] },
  pr: { required: ['ch'], optional: [] },
  // `p` and `pv` are required: they tell this reply apart from a presence relay error (see decodeOutboundMessage).
  p: { required: ['ch', 'id', 'p', 'pv'], optional: ['c', 'd', 'v', 't'] }
};

const errorReplyActionValue: Decoder<ErrorReplyAction> = oneOf<ErrorReplyAction>([
  'hs',
  'f',
  's',
  'u',
  'bf',
  'bs',
  'bu',
  'op',
  'qf',
  'qs',
  'qu',
  'nf',
  'ps',
  'pu',
  'pr',
  'p'
]);

/**
 * An error reply: the forwarded request with `error` added (agent.js:321-324). Checks that its keys are ones the
 * forwarded request for its action has, and decodes the fields that say which request it answers.
 */
function decodeErrorReply(raw: Readonly<Record<string, unknown>>, path: string): DecodeResult<ErrorReply> {
  const action: DecodeResult<ErrorReplyAction> = errorReplyActionValue(ownDataValue(raw, 'a'), propertyPath(path, 'a'));
  if (!action.ok) {
    return action;
  }
  const keys: { readonly required: readonly RequestKey[]; readonly optional: readonly RequestKey[] } =
    ERROR_REPLY_KEYS[action.value];
  const requiredKeys: ('a' | 'error' | RequestKey)[] = ['a', 'error', ...keys.required];
  const fields: DecodeResult<Fields<'a' | 'error' | RequestKey, RequestKey>> = exactFields(
    raw,
    path,
    requiredKeys,
    keys.optional
  );
  if (!fields.ok) {
    return fields;
  }
  const error: DecodeResult<OutboundError> = errorValue(fields.value.required('error'), fields.value.path('error'));
  if (!error.ok) {
    return error;
  }
  const collection: DecodeResult<string | null> = optionalField(fields.value, 'c', nameValue);
  if (!collection.ok) {
    return collection;
  }
  const docId: DecodeResult<string | null> = optionalField(fields.value, 'd', nameValue);
  if (!docId.ok) {
    return docId;
  }
  const bulkIds: DecodeResult<readonly string[] | null> = optionalField(
    fields.value,
    'b',
    action.value === 'bu' ? docIdsValue : bulkDocIdsValue
  );
  if (!bulkIds.ok) {
    return bulkIds;
  }
  const id: DecodeResult<string | number | null> = optionalField(fields.value, 'id', errorReplyIdValue(action.value));
  if (!id.ok) {
    return id;
  }
  const src: DecodeResult<string | null> = optionalField(fields.value, 'src', nameValue);
  if (!src.ok) {
    return src;
  }
  const seq: DecodeResult<number | null> = optionalField(fields.value, 'seq', positiveInteger);
  if (!seq.ok) {
    return seq;
  }
  const channel: DecodeResult<string | null> = optionalField(fields.value, 'ch', nameValue);
  if (!channel.ok) {
    return channel;
  }
  if (action.value === 'op' && fields.value.has('op') === fields.value.has('create')) {
    return failure(path, 'expected exactly one of op and create');
  }
  return success({
    kind: 'error-reply',
    action: action.value,
    error: error.value,
    collection: collection.value,
    docId: docId.value,
    bulkIds: bulkIds.value,
    id: id.value,
    src: src.value,
    seq: seq.value,
    channel: channel.value
  });
}

/** The doc ids of a forwarded `bf` or `bs`, which has either a list of ids or a map of id to version. */
const bulkDocIdsValue: Decoder<readonly string[]> = (input: unknown, path: string): DecodeResult<readonly string[]> => {
  if (Array.isArray(input)) {
    return docIdsValue(input, path);
  }
  const versions: DecodeResult<ReadonlyMap<string, number>> = docVersionsValue(input, path);
  if (!versions.ok) {
    return versions;
  }
  return success([...versions.value.keys()]);
};

/**
 * What `id` is in a forwarded request: the connection id a handshake asks for (null on a first connection), a
 * presence update's own id, or the number of a query or `nf` request.
 */
function errorReplyIdValue(action: ErrorReplyAction): Decoder<string | number | null> {
  if (action === 'hs') {
    return nullable(nameValue);
  }
  if (action === 'p') {
    return nameValue;
  }
  return requestIdValue;
}
