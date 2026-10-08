import { isPlainObject } from '../utils/type-utils';
import {
  arrayOf,
  booleanValue,
  DecodeResult,
  Decoder,
  exactFields,
  failure,
  Fields,
  FORBIDDEN_KEYS,
  literal,
  nonNegativeInteger,
  nullable,
  oneOf,
  pair,
  positiveInteger,
  propertyPath,
  recordOf,
  ROOT_PATH,
  stringValue,
  success
} from './decoder';
import {
  BulkDocs,
  ChannelPresenceUpdate,
  CreateOpRequest,
  DocPresenceUpdate,
  EditOpRequest,
  InboundMessage,
  OpEdit,
  PresenceChannel,
  QueryKnownResult,
  TextRange,
  ViewerPresence
} from './inbound-messages';
import { jsonObject, JsonObject } from './json';
import { opEditDecoder } from './op-content-decoders';
import {
  CollectionProtocol,
  GatewayProtocolConfig,
  JSON0_TYPE_NAME,
  JSON0_TYPE_URI,
  RICH_TEXT_TYPE_URI
} from './protocol-config';

/**
 * The gateway's inbound decoder: it turns a message parsed from a client's websocket frame into an InboundMessage,
 * accepting exactly the messages the application's ShareDB client sends (see inbound-messages.ts). Anything it does
 * not accept is a protocol violation. Which collections may be addressed, and how, comes from the application's
 * GatewayProtocolConfig.
 */

/** The longest doc id. Our ids are a project id, a colon and a short suffix, far shorter than this. */
export const MAX_DOC_ID_LENGTH = 1024;

/**
 * The longest connection id, sent as the `id` of `hs` and the `src` of `op`. Ids the gateway mints and the ids older
 * ShareDB servers issued are both under 100 characters.
 */
export const MAX_CONNECTION_ID_LENGTH = 256;

/**
 * The most docs in one bulk request. The client sends a bulk request on reconnect for every doc of a collection it
 * has loaded, which in a large project can be thousands of note threads or biblical terms.
 */
export const MAX_BULK_DOCS = 100_000;

/**
 * The most entries in the `r` (results the client already has) of a query subscribe. The largest result sets are a
 * project's biblical terms, which can be around ten thousand.
 */
export const MAX_QUERY_KNOWN_RESULTS = 50_000;

/** The longest display name or cursor color in a viewer presence. The cursor color is user-editable, so any string. */
export const MAX_VIEWER_TEXT_LENGTH = 4096;

/** The longest avatar URL in a viewer presence. */
export const MAX_AVATAR_URL_LENGTH = 8192;

/** A presence id, which the client makes with objectId(): 24 lowercase hex characters. */
const PRESENCE_ID_PATTERN = /^[0-9a-f]{24}$/;

/** The handshake protocol version our client speaks (ShareDB protocol 1.2). */
const PROTOCOL_MAJOR = 1;
const PROTOCOL_MINOR = 2;

/** Decodes a message a client sent. `raw` is the message as JSON.parse produced it. */
export function decodeInboundMessage(raw: unknown, config: GatewayProtocolConfig): DecodeResult<InboundMessage> {
  const path: string = ROOT_PATH;
  const action: DecodeResult<string> = readAction(raw, path);
  if (!action.ok) {
    return action;
  }
  switch (action.value) {
    case 'hs':
      return decodeHandshake(raw, path);
    case 'f':
    case 's':
      return decodeFetchOrSubscribe(action.value, raw, path, config);
    case 'u':
      return decodeUnsubscribe(raw, path, config);
    case 'bf':
    case 'bs':
      return decodeBulkFetchOrSubscribe(action.value, raw, path, config);
    case 'bu':
      return decodeBulkUnsubscribe(raw, path, config);
    case 'op':
      return decodeOp(raw, path, config);
    case 'qf':
      return decodeQueryFetch(raw, path, config);
    case 'qs':
      return decodeQuerySubscribe(raw, path, config);
    case 'qu':
      return decodeQueryUnsubscribe(raw, path);
    case 'nf':
      return decodeSnapshotFetch(raw, path, config);
    case 'ps':
    case 'pu':
      return decodePresenceSubscription(action.value, raw, path, config);
    case 'pr':
      return decodePresenceRequest(raw, path, config);
    case 'p':
      return decodePresence(raw, path, config);
    default:
      return failure(propertyPath(path, 'a'), 'unknown action');
  }
}

/**
 * Accepts a doc id: a non-empty string of bounded length that is not the name of anything on Object.prototype (such
 * as `__proto__` or `constructor`), because ShareDB keeps docs in plain objects keyed by id.
 */
export const docIdDecoder: Decoder<string> = (input: unknown, path: string): DecodeResult<string> => {
  const id: DecodeResult<string> = stringValue({ minLength: 1, maxLength: MAX_DOC_ID_LENGTH })(input, path);
  if (!id.ok) {
    return id;
  }
  if (Object.prototype.hasOwnProperty.call(Object.prototype, id.value) || FORBIDDEN_KEYS.includes(id.value)) {
    return failure(path, 'forbidden doc id');
  }
  return success(id.value);
};

/** A collection (or projection) a message addresses, with how the client uses it. */
interface AddressedCollection {
  readonly name: string;
  readonly protocol: CollectionProtocol;
}

type PlainChannel = PresenceChannel & { readonly form: 'plain' };
type DocChannel = PresenceChannel & { readonly form: 'doc' };

const connectionId: Decoder<string> = stringValue({ minLength: 1, maxLength: MAX_CONNECTION_ID_LENGTH });
const anyJsonObject: Decoder<JsonObject> = jsonObject();
const nullableVersion: Decoder<number | null> = nullable(nonNegativeInteger);
const presenceIdDecoder: Decoder<string> = stringValue({ maxLength: 24, pattern: PRESENCE_ID_PATTERN });

/** Reads `a`, the action, without trusting anything else about the message. */
function readAction(raw: unknown, path: string): DecodeResult<string> {
  const actionPath: string = propertyPath(path, 'a');
  if (!isPlainObject(raw)) {
    return failure(path, 'expected a plain object');
  }
  const descriptor: PropertyDescriptor | undefined = Object.getOwnPropertyDescriptor(raw, 'a');
  if (descriptor == null || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    return failure(actionPath, 'missing action');
  }
  const action: unknown = descriptor.value;
  if (typeof action !== 'string') {
    return failure(actionPath, 'expected an action string');
  }
  return success(action);
}

function decodeCollection(
  input: unknown,
  path: string,
  config: GatewayProtocolConfig
): DecodeResult<AddressedCollection> {
  if (typeof input !== 'string') {
    return failure(path, 'expected a collection name');
  }
  const protocol: CollectionProtocol | undefined = config.collections.get(input);
  if (protocol == null) {
    return failure(path, 'unknown collection');
  }
  return success({ name: input, protocol: protocol });
}

function decodeHandshake(raw: unknown, path: string): DecodeResult<InboundMessage> {
  const fieldsResult: DecodeResult<Fields<'a' | 'id' | 'protocol' | 'protocolMinor', never>> = exactFields(raw, path, [
    'a',
    'id',
    'protocol',
    'protocolMinor'
  ]);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<'a' | 'id' | 'protocol' | 'protocolMinor', never> = fieldsResult.value;
  const id: DecodeResult<string | null> = nullable(connectionId)(fields.required('id'), fields.path('id'));
  if (!id.ok) {
    return id;
  }
  const protocol: DecodeResult<number> = literal(PROTOCOL_MAJOR)(fields.required('protocol'), fields.path('protocol'));
  if (!protocol.ok) {
    return protocol;
  }
  const protocolMinor: DecodeResult<number> = literal(PROTOCOL_MINOR)(
    fields.required('protocolMinor'),
    fields.path('protocolMinor')
  );
  if (!protocolMinor.ok) {
    return protocolMinor;
  }
  return success({ kind: 'handshake', id: id.value });
}

function decodeFetchOrSubscribe(
  action: 'f' | 's',
  raw: unknown,
  path: string,
  config: GatewayProtocolConfig
): DecodeResult<InboundMessage> {
  const fieldsResult: DecodeResult<Fields<'a' | 'c' | 'd', 'v'>> = exactFields(raw, path, ['a', 'c', 'd'], ['v']);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<'a' | 'c' | 'd', 'v'> = fieldsResult.value;
  const collection: DecodeResult<AddressedCollection> = decodeCollection(
    fields.required('c'),
    fields.path('c'),
    config
  );
  if (!collection.ok) {
    return collection;
  }
  const docId: DecodeResult<string> = docIdDecoder(fields.required('d'), fields.path('d'));
  if (!docId.ok) {
    return docId;
  }
  // The client leaves `v` out, or sends null, when it has no version of the doc; ShareDB treats both the same way.
  let version: number | null = null;
  if (fields.has('v')) {
    const decodedVersion: DecodeResult<number | null> = nullableVersion(fields.optional('v'), fields.path('v'));
    if (!decodedVersion.ok) {
      return decodedVersion;
    }
    version = decodedVersion.value;
  }
  if (action === 'f') {
    return success({ kind: 'fetch', collection: collection.value.name, docId: docId.value, version: version });
  }
  return success({ kind: 'subscribe', collection: collection.value.name, docId: docId.value, version: version });
}

function decodeUnsubscribe(raw: unknown, path: string, config: GatewayProtocolConfig): DecodeResult<InboundMessage> {
  const fieldsResult: DecodeResult<Fields<'a' | 'c' | 'd', never>> = exactFields(raw, path, ['a', 'c', 'd']);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<'a' | 'c' | 'd', never> = fieldsResult.value;
  const collection: DecodeResult<AddressedCollection> = decodeCollection(
    fields.required('c'),
    fields.path('c'),
    config
  );
  if (!collection.ok) {
    return collection;
  }
  const docId: DecodeResult<string> = docIdDecoder(fields.required('d'), fields.path('d'));
  if (!docId.ok) {
    return docId;
  }
  return success({ kind: 'unsubscribe', collection: collection.value.name, docId: docId.value });
}

/** Accepts the id list of a bulk request: at least two unique doc ids. */
function decodeBulkIds(input: unknown, path: string): DecodeResult<readonly string[]> {
  const ids: DecodeResult<readonly string[]> = arrayOf(docIdDecoder, { minLength: 2, maxLength: MAX_BULK_DOCS })(
    input,
    path
  );
  if (!ids.ok) {
    return ids;
  }
  if (new Set(ids.value).size !== ids.value.length) {
    return failure(path, 'expected unique doc ids');
  }
  return ids;
}

const bulkVersions: Decoder<ReadonlyMap<string, number>> = recordOf(docIdDecoder, nonNegativeInteger, {
  minEntries: 2,
  maxEntries: MAX_BULK_DOCS
});

function decodeBulkDocs(input: unknown, path: string): DecodeResult<BulkDocs> {
  if (Array.isArray(input)) {
    const ids: DecodeResult<readonly string[]> = decodeBulkIds(input, path);
    if (!ids.ok) {
      return ids;
    }
    return success({ form: 'ids', ids: ids.value });
  }
  const versions: DecodeResult<ReadonlyMap<string, number>> = bulkVersions(input, path);
  if (!versions.ok) {
    return versions;
  }
  return success({ form: 'versions', versions: versions.value });
}

function decodeBulkFetchOrSubscribe(
  action: 'bf' | 'bs',
  raw: unknown,
  path: string,
  config: GatewayProtocolConfig
): DecodeResult<InboundMessage> {
  const fieldsResult: DecodeResult<Fields<'a' | 'c' | 'b', never>> = exactFields(raw, path, ['a', 'c', 'b']);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<'a' | 'c' | 'b', never> = fieldsResult.value;
  const collection: DecodeResult<AddressedCollection> = decodeCollection(
    fields.required('c'),
    fields.path('c'),
    config
  );
  if (!collection.ok) {
    return collection;
  }
  const docs: DecodeResult<BulkDocs> = decodeBulkDocs(fields.required('b'), fields.path('b'));
  if (!docs.ok) {
    return docs;
  }
  if (action === 'bf') {
    return success({ kind: 'bulk-fetch', collection: collection.value.name, docs: docs.value });
  }
  return success({ kind: 'bulk-subscribe', collection: collection.value.name, docs: docs.value });
}

function decodeBulkUnsubscribe(
  raw: unknown,
  path: string,
  config: GatewayProtocolConfig
): DecodeResult<InboundMessage> {
  const fieldsResult: DecodeResult<Fields<'a' | 'c' | 'b', never>> = exactFields(raw, path, ['a', 'c', 'b']);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<'a' | 'c' | 'b', never> = fieldsResult.value;
  const collection: DecodeResult<AddressedCollection> = decodeCollection(
    fields.required('c'),
    fields.path('c'),
    config
  );
  if (!collection.ok) {
    return collection;
  }
  // Unsubscribes never carry a version, so the client only sends the id list form.
  const ids: DecodeResult<readonly string[]> = decodeBulkIds(fields.required('b'), fields.path('b'));
  if (!ids.ok) {
    return ids;
  }
  return success({ kind: 'bulk-unsubscribe', collection: collection.value.name, ids: ids.value });
}

/** Accepts an op's `x`: `{}`, or `{ source }` with one of the collection's op sources. Gives the source or null. */
function decodeOpSource(input: unknown, path: string, protocol: CollectionProtocol): DecodeResult<string | null> {
  const fieldsResult: DecodeResult<Fields<never, 'source'>> = exactFields(input, path, [], ['source']);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<never, 'source'> = fieldsResult.value;
  if (!fields.has('source')) {
    return success(null);
  }
  return oneOf(protocol.opSources)(fields.optional('source'), fields.path('source'));
}

type OpRequiredKey = 'a' | 'c' | 'd' | 'v' | 'seq' | 'x';
type OpOptionalKey = 'src' | 'op' | 'create';

function decodeOp(
  raw: unknown,
  path: string,
  config: GatewayProtocolConfig
): DecodeResult<EditOpRequest | CreateOpRequest> {
  const fieldsResult: DecodeResult<Fields<OpRequiredKey, OpOptionalKey>> = exactFields(
    raw,
    path,
    ['a', 'c', 'd', 'v', 'seq', 'x'],
    ['src', 'op', 'create']
  );
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<OpRequiredKey, OpOptionalKey> = fieldsResult.value;
  const collection: DecodeResult<AddressedCollection> = decodeCollection(
    fields.required('c'),
    fields.path('c'),
    config
  );
  if (!collection.ok) {
    return collection;
  }
  const protocol: CollectionProtocol = collection.value.protocol;
  const docId: DecodeResult<string> = docIdDecoder(fields.required('d'), fields.path('d'));
  if (!docId.ok) {
    return docId;
  }
  const seq: DecodeResult<number> = positiveInteger(fields.required('seq'), fields.path('seq'));
  if (!seq.ok) {
    return seq;
  }
  // The client leaves `src` out on an op's first send.
  let src: string | null = null;
  if (fields.has('src')) {
    const decodedSrc: DecodeResult<string> = connectionId(fields.optional('src'), fields.path('src'));
    if (!decodedSrc.ok) {
      return decodedSrc;
    }
    src = decodedSrc.value;
  }
  const source: DecodeResult<string | null> = decodeOpSource(fields.required('x'), fields.path('x'), protocol);
  if (!source.ok) {
    return source;
  }
  if (fields.has('op') === fields.has('create')) {
    return failure(path, 'expected exactly one of op and create');
  }

  if (fields.has('op')) {
    const version: DecodeResult<number> = nonNegativeInteger(fields.required('v'), fields.path('v'));
    if (!version.ok) {
      return version;
    }
    const edit: DecodeResult<OpEdit> = opEditDecoder(protocol.otType, { allowListReplace: false })(
      fields.optional('op'),
      fields.path('op')
    );
    if (!edit.ok) {
      return edit;
    }
    const request: EditOpRequest = {
      kind: 'edit-op',
      collection: collection.value.name,
      docId: docId.value,
      src: src,
      seq: seq.value,
      source: source.value,
      version: version.value,
      edit: edit.value
    };
    return success(request);
  }

  if (!protocol.clientCreates || protocol.otType !== 'json0') {
    return failure(fields.path('create'), 'the client does not create docs in this collection');
  }
  // v is null when the client never loaded the doc before creating it.
  const version: DecodeResult<number | null> = nullableVersion(fields.required('v'), fields.path('v'));
  if (!version.ok) {
    return version;
  }
  const data: DecodeResult<JsonObject> = decodeCreate(fields.optional('create'), fields.path('create'));
  if (!data.ok) {
    return data;
  }
  const request: CreateOpRequest = {
    kind: 'create-op',
    collection: collection.value.name,
    docId: docId.value,
    src: src,
    seq: seq.value,
    source: source.value,
    version: version.value,
    data: data.value
  };
  return success(request);
}

/** Accepts an op's `create`: a json0 type (as its URI or its name) and the doc's data. Gives the data. */
function decodeCreate(input: unknown, path: string): DecodeResult<JsonObject> {
  const fieldsResult: DecodeResult<Fields<'type' | 'data', never>> = exactFields(input, path, ['type', 'data']);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<'type' | 'data', never> = fieldsResult.value;
  const type: DecodeResult<string> = oneOf([JSON0_TYPE_URI, JSON0_TYPE_NAME])(
    fields.required('type'),
    fields.path('type')
  );
  if (!type.ok) {
    return type;
  }
  return anyJsonObject(fields.required('data'), fields.path('data'));
}

/** Accepts `{}`, the only query options our client sends. */
function decodeEmptyOptions(input: unknown, path: string): DecodeResult<null> {
  const fields: DecodeResult<Fields<never, never>> = exactFields(input, path, []);
  if (!fields.ok) {
    return fields;
  }
  return success(null);
}

function decodeQueryFetch(raw: unknown, path: string, config: GatewayProtocolConfig): DecodeResult<InboundMessage> {
  const fieldsResult: DecodeResult<Fields<'a' | 'id' | 'c' | 'q' | 'o', never>> = exactFields(raw, path, [
    'a',
    'id',
    'c',
    'q',
    'o'
  ]);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<'a' | 'id' | 'c' | 'q' | 'o', never> = fieldsResult.value;
  const queryId: DecodeResult<number> = positiveInteger(fields.required('id'), fields.path('id'));
  if (!queryId.ok) {
    return queryId;
  }
  const collection: DecodeResult<AddressedCollection> = decodeCollection(
    fields.required('c'),
    fields.path('c'),
    config
  );
  if (!collection.ok) {
    return collection;
  }
  const query: DecodeResult<JsonObject> = anyJsonObject(fields.required('q'), fields.path('q'));
  if (!query.ok) {
    return query;
  }
  const options: DecodeResult<null> = decodeEmptyOptions(fields.required('o'), fields.path('o'));
  if (!options.ok) {
    return options;
  }
  return success({
    kind: 'query-fetch',
    queryId: queryId.value,
    collection: collection.value.name,
    query: query.value
  });
}

const knownResultsDecoder: Decoder<readonly (readonly [string, number | null])[]> = arrayOf(
  pair(docIdDecoder, nullableVersion),
  { maxLength: MAX_QUERY_KNOWN_RESULTS }
);

function decodeQuerySubscribe(raw: unknown, path: string, config: GatewayProtocolConfig): DecodeResult<InboundMessage> {
  const fieldsResult: DecodeResult<Fields<'a' | 'id' | 'c' | 'q', 'o' | 'r'>> = exactFields(
    raw,
    path,
    ['a', 'id', 'c', 'q'],
    ['o', 'r']
  );
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<'a' | 'id' | 'c' | 'q', 'o' | 'r'> = fieldsResult.value;
  const queryId: DecodeResult<number> = positiveInteger(fields.required('id'), fields.path('id'));
  if (!queryId.ok) {
    return queryId;
  }
  const collection: DecodeResult<AddressedCollection> = decodeCollection(
    fields.required('c'),
    fields.path('c'),
    config
  );
  if (!collection.ok) {
    return collection;
  }
  const query: DecodeResult<JsonObject> = anyJsonObject(fields.required('q'), fields.path('q'));
  if (!query.ok) {
    return query;
  }
  // The results query sends `o: {}`; the count query sends no `o`.
  if (fields.has('o')) {
    const options: DecodeResult<null> = decodeEmptyOptions(fields.optional('o'), fields.path('o'));
    if (!options.ok) {
      return options;
    }
  }
  let knownResults: readonly QueryKnownResult[] | null = null;
  if (fields.has('r')) {
    const results: DecodeResult<readonly (readonly [string, number | null])[]> = knownResultsDecoder(
      fields.optional('r'),
      fields.path('r')
    );
    if (!results.ok) {
      return results;
    }
    knownResults = results.value.map(([docId, version]: readonly [string, number | null]): QueryKnownResult => ({
      docId: docId,
      version: version
    }));
  }
  return success({
    kind: 'query-subscribe',
    queryId: queryId.value,
    collection: collection.value.name,
    query: query.value,
    knownResults: knownResults
  });
}

function decodeQueryUnsubscribe(raw: unknown, path: string): DecodeResult<InboundMessage> {
  const fieldsResult: DecodeResult<Fields<'a' | 'id', never>> = exactFields(raw, path, ['a', 'id']);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const queryId: DecodeResult<number> = positiveInteger(
    fieldsResult.value.required('id'),
    fieldsResult.value.path('id')
  );
  if (!queryId.ok) {
    return queryId;
  }
  return success({ kind: 'query-unsubscribe', queryId: queryId.value });
}

function decodeSnapshotFetch(raw: unknown, path: string, config: GatewayProtocolConfig): DecodeResult<InboundMessage> {
  const fieldsResult: DecodeResult<Fields<'a' | 'id' | 'c' | 'd' | 'v', never>> = exactFields(raw, path, [
    'a',
    'id',
    'c',
    'd',
    'v'
  ]);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<'a' | 'id' | 'c' | 'd' | 'v', never> = fieldsResult.value;
  const requestId: DecodeResult<number> = positiveInteger(fields.required('id'), fields.path('id'));
  if (!requestId.ok) {
    return requestId;
  }
  const collection: DecodeResult<AddressedCollection> = decodeCollection(
    fields.required('c'),
    fields.path('c'),
    config
  );
  if (!collection.ok) {
    return collection;
  }
  if (!collection.value.protocol.snapshotFetchByVersion) {
    return failure(fields.path('c'), 'the client does not fetch past versions in this collection');
  }
  const docId: DecodeResult<string> = docIdDecoder(fields.required('d'), fields.path('d'));
  if (!docId.ok) {
    return docId;
  }
  const version: DecodeResult<number> = nonNegativeInteger(fields.required('v'), fields.path('v'));
  if (!version.ok) {
    return version;
  }
  return success({
    kind: 'snapshot-fetch',
    requestId: requestId.value,
    collection: collection.value.name,
    docId: docId.value,
    version: version.value
  });
}

/**
 * Accepts a presence channel: `<collection>:<docId>` (plain) or `<collection>.<docId>` (doc), for a collection where
 * the client uses presence. Doc ids can contain ':' and '.', so the channel is split after a configured collection
 * name rather than at the first separator. If more than one collection name fits, the channel is not accepted.
 */
/**
 * The presence channel a channel name names, or undefined when it is not a channel the client could use (see
 * decodeChannel). For deciding about channels named in messages ShareDB sends.
 */
export function parsePresenceChannel(name: string, config: GatewayProtocolConfig): PresenceChannel | undefined {
  const channel: DecodeResult<PlainChannel | DocChannel> = decodeChannel(name, 'ch', config);
  return channel.ok ? channel.value : undefined;
}

function decodeChannel(
  input: unknown,
  path: string,
  config: GatewayProtocolConfig
): DecodeResult<PlainChannel | DocChannel> {
  if (typeof input !== 'string') {
    return failure(path, 'expected a presence channel');
  }
  const matches: (PlainChannel | DocChannel)[] = [];
  for (const [collection, protocol] of config.collections) {
    if (!protocol.presence || !input.startsWith(collection)) {
      continue;
    }
    const separator: string = input.charAt(collection.length);
    const docId: string = input.slice(collection.length + 1);
    if (separator === ':') {
      matches.push({ form: 'plain', name: input, collection: collection, docId: docId });
    } else if (separator === '.') {
      matches.push({ form: 'doc', name: input, collection: collection, docId: docId });
    }
  }
  if (matches.length !== 1) {
    return failure(path, 'expected a presence channel of a collection with presence');
  }
  const channel: PlainChannel | DocChannel = matches[0];
  const docId: DecodeResult<string> = docIdDecoder(channel.docId, path);
  if (!docId.ok) {
    return docId;
  }
  return success(channel);
}

function decodeDocChannel(input: unknown, path: string, config: GatewayProtocolConfig): DecodeResult<DocChannel> {
  const channel: DecodeResult<PlainChannel | DocChannel> = decodeChannel(input, path, config);
  if (!channel.ok) {
    return channel;
  }
  if (channel.value.form !== 'doc') {
    return failure(path, 'expected a doc presence channel');
  }
  return success(channel.value);
}

function decodePresenceSubscription(
  action: 'ps' | 'pu',
  raw: unknown,
  path: string,
  config: GatewayProtocolConfig
): DecodeResult<InboundMessage> {
  const fieldsResult: DecodeResult<Fields<'a' | 'ch' | 'seq', never>> = exactFields(raw, path, ['a', 'ch', 'seq']);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<'a' | 'ch' | 'seq', never> = fieldsResult.value;
  const channel: DecodeResult<PlainChannel | DocChannel> = decodeChannel(
    fields.required('ch'),
    fields.path('ch'),
    config
  );
  if (!channel.ok) {
    return channel;
  }
  const seq: DecodeResult<number> = positiveInteger(fields.required('seq'), fields.path('seq'));
  if (!seq.ok) {
    return seq;
  }
  if (action === 'ps') {
    return success({ kind: 'presence-subscribe', channel: channel.value, seq: seq.value });
  }
  return success({ kind: 'presence-unsubscribe', channel: channel.value, seq: seq.value });
}

function decodePresenceRequest(
  raw: unknown,
  path: string,
  config: GatewayProtocolConfig
): DecodeResult<InboundMessage> {
  const fieldsResult: DecodeResult<Fields<'a' | 'ch', never>> = exactFields(raw, path, ['a', 'ch']);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const channel: DecodeResult<DocChannel> = decodeDocChannel(
    fieldsResult.value.required('ch'),
    fieldsResult.value.path('ch'),
    config
  );
  if (!channel.ok) {
    return channel;
  }
  return success({ kind: 'presence-request', channel: channel.value });
}

type PresenceRequiredKey = 'a' | 'ch' | 'id' | 'p' | 'pv';
type DocPresenceKey = 'c' | 'd' | 'v' | 't';
const DOC_PRESENCE_KEYS: readonly DocPresenceKey[] = ['c', 'd', 'v', 't'];

/** `p`. Plain channels carry exactly 5 keys; doc channels also carry the doc and its version and type (9 keys). */
function decodePresence(
  raw: unknown,
  path: string,
  config: GatewayProtocolConfig
): DecodeResult<ChannelPresenceUpdate | DocPresenceUpdate> {
  const fieldsResult: DecodeResult<Fields<PresenceRequiredKey, DocPresenceKey>> = exactFields(
    raw,
    path,
    ['a', 'ch', 'id', 'p', 'pv'],
    DOC_PRESENCE_KEYS
  );
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<PresenceRequiredKey, DocPresenceKey> = fieldsResult.value;
  const channel: DecodeResult<PlainChannel | DocChannel> = decodeChannel(
    fields.required('ch'),
    fields.path('ch'),
    config
  );
  if (!channel.ok) {
    return channel;
  }
  const presenceId: DecodeResult<string> = presenceIdDecoder(fields.required('id'), fields.path('id'));
  if (!presenceId.ok) {
    return presenceId;
  }
  const presenceVersion: DecodeResult<number> = nonNegativeInteger(fields.required('pv'), fields.path('pv'));
  if (!presenceVersion.ok) {
    return presenceVersion;
  }
  const docKeysPresent: number = DOC_PRESENCE_KEYS.filter((key: DocPresenceKey) => fields.has(key)).length;

  if (channel.value.form === 'plain') {
    if (docKeysPresent > 0) {
      return failure(path, 'unexpected doc presence keys on a plain presence channel');
    }
    const viewer: DecodeResult<ViewerPresence | null> = nullable(viewerPresenceDecoder)(
      fields.required('p'),
      fields.path('p')
    );
    if (!viewer.ok) {
      return viewer;
    }
    const update: ChannelPresenceUpdate = {
      kind: 'channel-presence',
      channel: channel.value,
      presenceId: presenceId.value,
      viewer: viewer.value,
      presenceVersion: presenceVersion.value
    };
    return success(update);
  }

  if (docKeysPresent !== DOC_PRESENCE_KEYS.length) {
    return failure(path, 'missing doc presence keys on a doc presence channel');
  }
  const collection: DecodeResult<AddressedCollection> = decodeCollection(
    fields.optional('c'),
    fields.path('c'),
    config
  );
  if (!collection.ok) {
    return collection;
  }
  if (collection.value.name !== channel.value.collection) {
    return failure(fields.path('c'), 'the collection does not match the channel');
  }
  if (collection.value.protocol.otType !== 'rich-text') {
    return failure(fields.path('c'), 'doc presence is only sent for rich-text docs');
  }
  const docId: DecodeResult<string> = docIdDecoder(fields.optional('d'), fields.path('d'));
  if (!docId.ok) {
    return docId;
  }
  if (docId.value !== channel.value.docId) {
    return failure(fields.path('d'), 'the doc id does not match the channel');
  }
  const version: DecodeResult<number> = nonNegativeInteger(fields.optional('v'), fields.path('v'));
  if (!version.ok) {
    return version;
  }
  const type: DecodeResult<string> = literal(RICH_TEXT_TYPE_URI)(fields.optional('t'), fields.path('t'));
  if (!type.ok) {
    return type;
  }
  const range: DecodeResult<TextRange | null> = nullable(textRangeDecoder)(fields.required('p'), fields.path('p'));
  if (!range.ok) {
    return range;
  }
  const update: DocPresenceUpdate = {
    kind: 'doc-presence',
    collection: collection.value.name,
    docId: docId.value,
    channel: channel.value,
    presenceId: presenceId.value,
    range: range.value,
    presenceVersion: presenceVersion.value,
    version: version.value
  };
  return success(update);
}

type ViewerKey = 'displayName' | 'avatarUrl' | 'cursorColor' | 'activeInEditor';

/** Accepts a plain presence value: `{ viewer: { displayName, avatarUrl, cursorColor, activeInEditor } }`. */
const viewerPresenceDecoder: Decoder<ViewerPresence> = (input: unknown, path: string): DecodeResult<ViewerPresence> => {
  const outer: DecodeResult<Fields<'viewer', never>> = exactFields(input, path, ['viewer']);
  if (!outer.ok) {
    return outer;
  }
  const fieldsResult: DecodeResult<Fields<ViewerKey, never>> = exactFields(
    outer.value.required('viewer'),
    outer.value.path('viewer'),
    ['displayName', 'avatarUrl', 'cursorColor', 'activeInEditor']
  );
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<ViewerKey, never> = fieldsResult.value;
  const viewerText: Decoder<string> = stringValue({ maxLength: MAX_VIEWER_TEXT_LENGTH });
  const displayName: DecodeResult<string> = viewerText(fields.required('displayName'), fields.path('displayName'));
  if (!displayName.ok) {
    return displayName;
  }
  const avatarUrl: DecodeResult<string> = stringValue({ maxLength: MAX_AVATAR_URL_LENGTH })(
    fields.required('avatarUrl'),
    fields.path('avatarUrl')
  );
  if (!avatarUrl.ok) {
    return avatarUrl;
  }
  const cursorColor: DecodeResult<string> = viewerText(fields.required('cursorColor'), fields.path('cursorColor'));
  if (!cursorColor.ok) {
    return cursorColor;
  }
  const activeInEditor: DecodeResult<boolean> = booleanValue(
    fields.required('activeInEditor'),
    fields.path('activeInEditor')
  );
  if (!activeInEditor.ok) {
    return activeInEditor;
  }
  return success({
    displayName: displayName.value,
    avatarUrl: avatarUrl.value,
    cursorColor: cursorColor.value,
    activeInEditor: activeInEditor.value
  });
};

/** Accepts a doc presence value: a Quill range `{ index, length }`. */
const textRangeDecoder: Decoder<TextRange> = (input: unknown, path: string): DecodeResult<TextRange> => {
  const fieldsResult: DecodeResult<Fields<'index' | 'length', never>> = exactFields(input, path, ['index', 'length']);
  if (!fieldsResult.ok) {
    return fieldsResult;
  }
  const fields: Fields<'index' | 'length', never> = fieldsResult.value;
  const index: DecodeResult<number> = nonNegativeInteger(fields.required('index'), fields.path('index'));
  if (!index.ok) {
    return index;
  }
  const length: DecodeResult<number> = nonNegativeInteger(fields.required('length'), fields.path('length'));
  if (!length.ok) {
    return length;
  }
  return success({ index: index.value, length: length.value });
};
