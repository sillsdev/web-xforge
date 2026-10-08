import { JsonObject, JsonValue } from './json';

/**
 * The messages a client may send over the websocket, as the gateway's inbound decoders (inbound-decoders.ts) produce
 * them. These are exactly the messages the application's ShareDB client sends; anything else is a protocol violation.
 * Each type says only what the decoder verified, so code that receives one can rely on every field.
 *
 * Field names describe the meaning rather than repeating ShareDB's one-letter keys. forwarded-messages.ts turns these
 * back into ShareDB's wire format.
 */
export type InboundMessage =
  | HandshakeRequest
  | FetchRequest
  | SubscribeRequest
  | UnsubscribeRequest
  | BulkFetchRequest
  | BulkSubscribeRequest
  | BulkUnsubscribeRequest
  | EditOpRequest
  | CreateOpRequest
  | QueryFetchRequest
  | QuerySubscribeRequest
  | QueryUnsubscribeRequest
  | SnapshotFetchRequest
  | PresenceSubscribeRequest
  | PresenceUnsubscribeRequest
  | PresenceRequestRequest
  | ChannelPresenceUpdate
  | DocPresenceUpdate;

/** The inbound messages that must pass the inbound authorizer before they are forwarded (see authorization.ts). */
export type AuthorizableInboundMessage = Exclude<
  InboundMessage,
  HandshakeRequest | UnsubscribeRequest | BulkUnsubscribeRequest | QueryUnsubscribeRequest | PresenceUnsubscribeRequest
>;

/** A doc, named by the collection (or projection) a client addressed and its id. */
export interface DocRef {
  readonly collection: string;
  readonly docId: string;
}

/**
 * `hs`. `id` is the connection id the client asks to keep (null on a page's first connection). The protocol version
 * is always 1.2, so it is not kept.
 */
export interface HandshakeRequest {
  readonly kind: 'handshake';
  readonly id: string | null;
}

/** `f`: fetch one doc's snapshot, or with a version, the ops since that version. */
export interface FetchRequest extends DocRef {
  readonly kind: 'fetch';
  /** null when the client sent `v: null` or no `v` at all; ShareDB treats both the same way. */
  readonly version: number | null;
}

/** `s`: subscribe to one doc. */
export interface SubscribeRequest extends DocRef {
  readonly kind: 'subscribe';
  /** null when the client sent `v: null` or no `v` at all. */
  readonly version: number | null;
}

/** `u`: unsubscribe from one doc. */
export interface UnsubscribeRequest extends DocRef {
  readonly kind: 'unsubscribe';
}

/**
 * The docs of a bulk fetch or subscribe. The client sends a list of ids for docs it has no version of, and a map of
 * id to version for docs it has. Ids are unique, and there are at least two.
 */
export type BulkDocs =
  | { readonly form: 'ids'; readonly ids: readonly string[] }
  | { readonly form: 'versions'; readonly versions: ReadonlyMap<string, number> };

/** `bf`. */
export interface BulkFetchRequest {
  readonly kind: 'bulk-fetch';
  readonly collection: string;
  readonly docs: BulkDocs;
}

/** `bs`. */
export interface BulkSubscribeRequest {
  readonly kind: 'bulk-subscribe';
  readonly collection: string;
  readonly docs: BulkDocs;
}

/** `bu`. Always a list of at least two unique ids. */
export interface BulkUnsubscribeRequest {
  readonly kind: 'bulk-unsubscribe';
  readonly collection: string;
  readonly ids: readonly string[];
}

/** What an `op` message carries apart from the change itself. */
export interface OpRequestBase extends DocRef {
  /**
   * The connection id the op was first sent under (`src`), or null when the client left it out, which it does on an
   * op's first send. See connection-src.ts for which values the gateway forwards.
   */
  readonly src: string | null;
  /** The client's sequence number for the op. */
  readonly seq: number;
  /** `x.source`, one of the collection's allowed op sources; null when the client sent `x: {}`. */
  readonly source: string | null;
}

/** An `op` that edits an existing doc. */
export interface EditOpRequest extends OpRequestBase {
  readonly kind: 'edit-op';
  /** The doc version the op was made against. */
  readonly version: number;
  /** May be empty: the client can compose ops that cancel out into an empty op. */
  readonly edit: OpEdit;
}

/** An `op` that creates a json0 doc. The OT type is always json0 and is forwarded as its URI. */
export interface CreateOpRequest extends OpRequestBase {
  readonly kind: 'create-op';
  /** null when the client never loaded the doc before creating it. */
  readonly version: number | null;
  readonly data: JsonObject;
}

/** The change an edit op makes, in the OT type of its collection. */
export type OpEdit =
  | { readonly otType: 'json0'; readonly components: readonly Json0Component[] }
  | { readonly otType: 'rich-text'; readonly ops: readonly DeltaOp[] };

/** A path into a json0 doc. Strings are object keys (never FORBIDDEN_KEYS); numbers are list indexes (>= 0). */
export type Json0Path = readonly (string | number)[];

/**
 * One component of a json0 op, of the kinds the client's op builder produces (and that composing such ops
 * produces). Names follow json0: `li` list insert, `ld` list delete, `oi` object insert, `od` object delete.
 * `list-replace` (`li` with `ld`) is never sent by the client; it is in this type only because transforming a client's
 * op on the server can produce it, and the write hook decodes transformed ops (see op-content-decoders.ts).
 */
export type Json0Component =
  | { readonly kind: 'list-insert'; readonly path: Json0Path; readonly inserted: JsonValue }
  | { readonly kind: 'list-delete'; readonly path: Json0Path; readonly deleted: JsonValue }
  | {
      readonly kind: 'list-replace';
      readonly path: Json0Path;
      readonly inserted: JsonValue;
      readonly deleted: JsonValue;
    }
  | { readonly kind: 'object-insert'; readonly path: Json0Path; readonly inserted: JsonValue }
  | { readonly kind: 'object-delete'; readonly path: Json0Path; readonly deleted: JsonValue }
  | {
      readonly kind: 'object-replace';
      readonly path: Json0Path;
      readonly inserted: JsonValue;
      readonly deleted: JsonValue;
    };

/** One op of a rich-text (Quill delta) change. `attributes` is null when the op has none. */
export type DeltaOp =
  | { readonly kind: 'insert-text'; readonly text: string; readonly attributes: JsonObject | null }
  | { readonly kind: 'insert-embed'; readonly embed: JsonObject; readonly attributes: JsonObject | null }
  | { readonly kind: 'retain'; readonly length: number; readonly attributes: JsonObject | null }
  | { readonly kind: 'delete'; readonly length: number };

/** `qf`. The client's `o` is always `{}` and is never forwarded. */
export interface QueryFetchRequest {
  readonly kind: 'query-fetch';
  readonly queryId: number;
  readonly collection: string;
  /** The query as the client sent it. Only the query registry looks at it; the gateway forwards a built query. */
  readonly query: JsonObject;
}

/** `qs`. */
export interface QuerySubscribeRequest {
  readonly kind: 'query-subscribe';
  readonly queryId: number;
  readonly collection: string;
  /** The query as the client sent it (see QueryFetchRequest.query). */
  readonly query: JsonObject;
  /**
   * `r`: the results the client already holds, as doc id and version (null for a doc it created offline). null when
   * the client sent no `r`, which is not the same as an empty list.
   */
  readonly knownResults: readonly QueryKnownResult[] | null;
}

/** One entry of a query subscribe's `r`. */
export interface QueryKnownResult {
  readonly docId: string;
  readonly version: number | null;
}

/** `qu`. */
export interface QueryUnsubscribeRequest {
  readonly kind: 'query-unsubscribe';
  readonly queryId: number;
}

/** `nf`: fetch a doc's snapshot at a past version. */
export interface SnapshotFetchRequest extends DocRef {
  readonly kind: 'snapshot-fetch';
  readonly requestId: number;
  readonly version: number;
}

/**
 * A presence channel the client uses for a doc: `<collection>:<id>` for plain presence (who is viewing) and
 * `<collection>.<id>` for doc presence (where their cursor is). `name` is the channel as sent.
 */
export interface PresenceChannel extends DocRef {
  readonly form: 'plain' | 'doc';
  readonly name: string;
}

/** `ps`. */
export interface PresenceSubscribeRequest {
  readonly kind: 'presence-subscribe';
  readonly channel: PresenceChannel;
  readonly seq: number;
}

/** `pu`. */
export interface PresenceUnsubscribeRequest {
  readonly kind: 'presence-unsubscribe';
  readonly channel: PresenceChannel;
  readonly seq: number;
}

/** `pr`: ask everyone on a doc presence channel to send their presence again. Only sent on doc presence channels. */
export interface PresenceRequestRequest {
  readonly kind: 'presence-request';
  readonly channel: PresenceChannel & { readonly form: 'doc' };
}

/** What the client says about a viewer on a plain presence channel. */
export interface ViewerPresence {
  readonly displayName: string;
  readonly avatarUrl: string;
  readonly cursorColor: string;
  readonly activeInEditor: boolean;
}

/** `p` on a plain presence channel: `{ viewer }`, or null when the viewer leaves. */
export interface ChannelPresenceUpdate {
  readonly kind: 'channel-presence';
  readonly channel: PresenceChannel & { readonly form: 'plain' };
  /** The client's id for this presence (24 lowercase hex characters). */
  readonly presenceId: string;
  readonly viewer: ViewerPresence | null;
  /** `pv`, the presence's own version counter. */
  readonly presenceVersion: number;
}

/** A selection in a rich-text doc. */
export interface TextRange {
  readonly index: number;
  readonly length: number;
}

/**
 * `p` on a doc presence channel. The channel names the same doc as `collection` and `docId`. The OT type is always
 * rich-text, so it is not kept.
 */
export interface DocPresenceUpdate extends DocRef {
  readonly kind: 'doc-presence';
  readonly channel: PresenceChannel & { readonly form: 'doc' };
  readonly presenceId: string;
  /** The selection, or null when there is none. */
  readonly range: TextRange | null;
  readonly presenceVersion: number;
  /** The doc version the selection refers to. */
  readonly version: number;
}
