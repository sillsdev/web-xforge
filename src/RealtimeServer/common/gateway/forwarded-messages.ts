import { BulkDocs, DocPresenceUpdate, InboundMessage, QueryKnownResult } from './inbound-messages';
import { JsonObject, JsonValue } from './json';
import { encodeOpEdit } from './op-content-decoders';
import { JSON0_TYPE_URI, RICH_TEXT_TYPE_URI } from './protocol-config';

/**
 * Turns decoded inbound messages back into ShareDB's wire format. The gateway forwards only what these functions
 * build from the typed, validated message; the client's original object never reaches ShareDB.
 */

/** The protocol version in a forwarded handshake (ShareDB protocol 1.2). */
const PROTOCOL_MAJOR = 1;
const PROTOCOL_MINOR = 2;

/**
 * The message ShareDB receives for `message`. A query is forwarded with whatever `query` the message holds; the
 * gateway replaces the client's query with the registry's built query before calling this. Query options (`o`) are
 * never forwarded.
 */
export function encodeForShareDB(message: InboundMessage): JsonObject {
  switch (message.kind) {
    case 'handshake':
      return { a: 'hs', id: message.id, protocol: PROTOCOL_MAJOR, protocolMinor: PROTOCOL_MINOR };
    case 'fetch':
    case 'subscribe': {
      const action: string = message.kind === 'fetch' ? 'f' : 's';
      if (message.version == null) {
        return { a: action, c: message.collection, d: message.docId };
      }
      return { a: action, c: message.collection, d: message.docId, v: message.version };
    }
    case 'unsubscribe':
      return { a: 'u', c: message.collection, d: message.docId };
    case 'bulk-fetch':
      return { a: 'bf', c: message.collection, b: encodeBulkDocs(message.docs) };
    case 'bulk-subscribe':
      return { a: 'bs', c: message.collection, b: encodeBulkDocs(message.docs) };
    case 'bulk-unsubscribe':
      return { a: 'bu', c: message.collection, b: [...message.ids] };
    case 'edit-op':
    case 'create-op': {
      const x: JsonObject = message.source == null ? {} : { source: message.source };
      // Keys are added in the order the ShareDB client uses. `src` is left out when the client left it out.
      const op: { [key: string]: JsonValue } = { a: 'op', c: message.collection, d: message.docId, v: message.version };
      if (message.src != null) {
        op.src = message.src;
      }
      op.seq = message.seq;
      op.x = x;
      if (message.kind === 'edit-op') {
        op.op = encodeOpEdit(message.edit);
      } else {
        const create: JsonObject = { type: JSON0_TYPE_URI, data: message.data };
        op.create = create;
      }
      return op;
    }
    case 'query-fetch':
      return { a: 'qf', id: message.queryId, c: message.collection, q: message.query };
    case 'query-subscribe':
      if (message.knownResults == null) {
        return { a: 'qs', id: message.queryId, c: message.collection, q: message.query };
      }
      return {
        a: 'qs',
        id: message.queryId,
        c: message.collection,
        q: message.query,
        r: message.knownResults.map((result: QueryKnownResult): JsonValue => [result.docId, result.version])
      };
    case 'query-unsubscribe':
      return { a: 'qu', id: message.queryId };
    case 'snapshot-fetch':
      return { a: 'nf', id: message.requestId, c: message.collection, d: message.docId, v: message.version };
    case 'presence-subscribe':
      return { a: 'ps', ch: message.channel.name, seq: message.seq };
    case 'presence-unsubscribe':
      return { a: 'pu', ch: message.channel.name, seq: message.seq };
    case 'presence-request':
      return { a: 'pr', ch: message.channel.name };
    case 'channel-presence': {
      const viewer: JsonObject | null =
        message.viewer == null
          ? null
          : {
              viewer: {
                displayName: message.viewer.displayName,
                avatarUrl: message.viewer.avatarUrl,
                cursorColor: message.viewer.cursorColor,
                activeInEditor: message.viewer.activeInEditor
              }
            };
      return { a: 'p', ch: message.channel.name, id: message.presenceId, p: viewer, pv: message.presenceVersion };
    }
    case 'doc-presence':
      return encodeDocPresence(message);
  }
}

/**
 * ShareDB's error reply to `message`: ShareDB answers a request it refuses by sending the request back with an
 * `error` added, so the gateway answers its own refusals the same way.
 */
export function encodeErrorReply(
  message: InboundMessage,
  error: { readonly code: string; readonly message: string }
): JsonObject {
  const replyError: JsonObject = { code: error.code, message: error.message };
  return { ...encodeForShareDB(message), error: replyError };
}

function encodeBulkDocs(docs: BulkDocs): JsonValue {
  switch (docs.form) {
    case 'ids':
      return [...docs.ids];
    case 'versions': {
      const versions: { [docId: string]: JsonValue } = {};
      for (const [docId, version] of docs.versions) {
        // Doc ids were decoded so that none names a property of Object.prototype. defineProperty is used anyway, so
        // that even a name like `__proto__` would become an own property rather than change the object's prototype.
        Object.defineProperty(versions, docId, {
          value: version,
          enumerable: true,
          writable: true,
          configurable: true
        });
      }
      return versions;
    }
  }
}

function encodeDocPresence(message: DocPresenceUpdate): JsonObject {
  const range: JsonObject | null =
    message.range == null ? null : { index: message.range.index, length: message.range.length };
  return {
    a: 'p',
    ch: message.channel.name,
    id: message.presenceId,
    p: range,
    pv: message.presenceVersion,
    c: message.collection,
    d: message.docId,
    v: message.version,
    t: RICH_TEXT_TYPE_URI
  };
}
