/**
 * The messages ShareDB sends to a client, as the gateway's outbound decoders (outbound-decoders.ts) produce them
 * from the JSON that will go on the wire. These are exactly the messages ShareDB 5.2.2's Agent produces for the
 * requests the gateway forwards; anything else is a server-side surprise, which the gateway withholds before closing
 * the connection.
 *
 * Doc contents (`data`, op contents) stay `unknown`: decoding them is not needed to decide whether the message may be
 * sent, only to know which doc they belong to.
 */
export type OutboundMessage =
  | InitMessage
  | HandshakeReply
  | DocReply
  | UnsubscribeReply
  | BulkSnapshotsReply
  | BulkVersionsReply
  | BulkUnsubscribeReply
  | QueryFetchReply
  | QuerySubscribeReply
  | QueryUnsubscribeReply
  | QueryDiffMessage
  | QueryExtraMessage
  | OpMessage
  | SnapshotFetchReply
  | PresenceMessage
  | PresenceErrorMessage
  | PresenceRequestRelay
  | PresenceRequestReply
  | PresenceSubscriptionReply
  | ErrorReply;

/** An error as ShareDB sends it. `code` and `message` are absent when the error had none. */
export interface OutboundError {
  readonly code: string | number | null;
  readonly message: string | null;
}

/**
 * A doc snapshot in a reply. A doc that does not exist (or was deleted) has no type and no data. `type` is the OT
 * type URI; ShareDB leaves it out for json0 docs, and the decoder fills in the json0 URI.
 */
export type OutboundSnapshot =
  | { readonly exists: false; readonly version: number }
  | { readonly exists: true; readonly version: number; readonly type: string; readonly data: unknown };

/** A snapshot in a query's results, which also names its doc. */
export type ResultSnapshot = OutboundSnapshot & { readonly docId: string };

/** One doc's entry in a bulk or query reply's snapshot map: its snapshot, or why it could not be read. */
export type SnapshotMapEntry =
  | { readonly kind: 'snapshot'; readonly snapshot: OutboundSnapshot }
  | { readonly kind: 'error'; readonly error: OutboundError };

/** `init`, sent by ShareDB as soon as the connection opens. The gateway rewrites `id` to the connection's src. */
export interface InitMessage {
  readonly kind: 'init';
  readonly id: string;
}

/** The reply to `hs`. `id` is the src the connection's ops and presence will carry. */
export interface HandshakeReply {
  readonly kind: 'handshake-reply';
  readonly id: string;
}

/**
 * The reply to `f` or `s`. `snapshot` is null when the request had a version, in which case the ops since that
 * version were sent as op messages before this reply.
 */
export interface DocReply {
  readonly kind: 'fetch-reply' | 'subscribe-reply';
  readonly collection: string;
  readonly docId: string;
  readonly snapshot: OutboundSnapshot | null;
}

/** The reply to `u`. */
export interface UnsubscribeReply {
  readonly kind: 'unsubscribe-reply';
  readonly collection: string;
  readonly docId: string;
}

/** The reply to `bf` or `bs` with a list of ids: a snapshot (or error) per doc. */
export interface BulkSnapshotsReply {
  readonly kind: 'bulk-fetch-reply' | 'bulk-subscribe-reply';
  readonly collection: string;
  readonly snapshots: ReadonlyMap<string, SnapshotMapEntry>;
}

/**
 * The reply to `bf` or `bs` with a map of versions. It echoes the map; the ops since each version were sent as op
 * messages before it.
 */
export interface BulkVersionsReply {
  readonly kind: 'bulk-fetch-versions-reply' | 'bulk-subscribe-versions-reply';
  readonly collection: string;
  readonly versions: ReadonlyMap<string, number>;
}

/** The reply to `bu`, echoing its ids. */
export interface BulkUnsubscribeReply {
  readonly kind: 'bulk-unsubscribe-reply';
  readonly collection: string;
  readonly ids: readonly string[];
}

/** The reply to `qf`. `hasExtra` says whether it carries `extra` (such as a `$count` result). */
export interface QueryFetchReply {
  readonly kind: 'query-fetch-reply';
  readonly queryId: number;
  readonly results: readonly ResultSnapshot[];
  readonly hasExtra: boolean;
  readonly extra: unknown;
}

/**
 * The reply to `qs`, in one of three forms: the results of a fresh subscribe; a snapshot map of the docs the client
 * listed with a null version in `r`; or nothing, when the client listed only docs with versions.
 */
export interface QuerySubscribeReply {
  readonly kind: 'query-subscribe-reply';
  readonly queryId: number;
  readonly data:
    | { readonly form: 'results'; readonly results: readonly ResultSnapshot[] }
    | { readonly form: 'snapshot-map'; readonly snapshots: ReadonlyMap<string, SnapshotMapEntry> }
    | { readonly form: 'none' };
  readonly hasExtra: boolean;
  readonly extra: unknown;
}

/** The reply to `qu`. */
export interface QueryUnsubscribeReply {
  readonly kind: 'query-unsubscribe-reply';
  readonly queryId: number;
}

/** One change to a subscribed query's results. */
export type QueryDiff =
  | { readonly kind: 'insert'; readonly index: number; readonly values: readonly ResultSnapshot[] }
  | { readonly kind: 'remove'; readonly index: number; readonly howMany: number }
  | { readonly kind: 'move'; readonly from: number; readonly to: number; readonly howMany: number };

/** `q` with a diff of a subscribed query's results. */
export interface QueryDiffMessage {
  readonly kind: 'query-diff';
  readonly queryId: number;
  readonly diff: readonly QueryDiff[];
}

/** `q` with a new `extra` for a subscribed query, or with none (`extra` serialized to nothing). */
export interface QueryExtraMessage {
  readonly kind: 'query-extra';
  readonly queryId: number;
  readonly hasExtra: boolean;
  readonly extra: unknown;
}

/** What an op message carries. `none` is both a no-op push and the shape of an ack. */
export type OutboundOpContent =
  | { readonly kind: 'edit'; readonly op: unknown }
  | { readonly kind: 'create'; readonly type: string; readonly data: unknown }
  | { readonly kind: 'delete' }
  | { readonly kind: 'none' };

/**
 * `op`: an op pushed to the client, or the ack of one the client submitted. An ack has exactly the keys of a no-op
 * push (plus `fixup` if any), so only the gateway, which knows which ops it forwarded, can tell them apart.
 * `src` and `seq` are null for ops stored without them.
 */
export interface OpMessage {
  readonly kind: 'op';
  readonly collection: string;
  readonly docId: string;
  readonly version: number;
  readonly src: string | null;
  readonly seq: number | null;
  readonly content: OutboundOpContent;
  /** `fixup`, which only an ack can carry. Empty when absent. */
  readonly fixup: readonly unknown[];
}

/** The reply to `nf`: the doc's snapshot at the requested version. */
export interface SnapshotFetchReply {
  readonly kind: 'snapshot-fetch-reply';
  readonly requestId: number;
  readonly snapshot: OutboundSnapshot;
}

/**
 * `p`: someone's presence relayed to the channel's other subscribers, or the sender's own presence echoed back to
 * it as the reply. `doc` is present for doc presence.
 */
export interface PresenceMessage {
  readonly kind: 'presence';
  readonly channel: string;
  readonly src: string;
  readonly presenceId: string;
  readonly value: unknown;
  readonly presenceVersion: number;
  readonly doc: {
    readonly collection: string;
    readonly docId: string;
    readonly version: number;
    readonly type: string;
  } | null;
}

/** `p` with an error, which ShareDB sends when relaying a presence failed (and it is configured to say so). */
export interface PresenceErrorMessage {
  readonly kind: 'presence-error';
  readonly channel: string;
  readonly presenceId: string;
  readonly error: OutboundError;
}

/** `pr` relayed to a channel's subscribers: someone subscribed and wants everyone's presence again. */
export interface PresenceRequestRelay {
  readonly kind: 'presence-request-relay';
  readonly channel: string;
}

/** The reply to the client's own `pr`, which carries nothing but the action. */
export interface PresenceRequestReply {
  readonly kind: 'presence-request-reply';
}

/** The reply to `ps` or `pu`. */
export interface PresenceSubscriptionReply {
  readonly kind: 'presence-subscribe-reply' | 'presence-unsubscribe-reply';
  readonly channel: string;
  readonly seq: number;
}

/** The actions whose requests ShareDB can answer with an error reply. */
export type ErrorReplyAction =
  'hs' | 'f' | 's' | 'u' | 'bf' | 'bs' | 'bu' | 'op' | 'qf' | 'qs' | 'qu' | 'nf' | 'ps' | 'pu' | 'pr' | 'p';

/**
 * An error reply: the request as the gateway forwarded it, plus `error`. Only the fields that identify which request
 * it answers are kept; the decoder checks that the other keys are ones the forwarded request had.
 */
export interface ErrorReply {
  readonly kind: 'error-reply';
  readonly action: ErrorReplyAction;
  readonly error: OutboundError;
  /** `c`, for requests that name a collection. */
  readonly collection: string | null;
  /** `d`, for requests that name one doc. */
  readonly docId: string | null;
  /** `b`, the doc ids of a bulk request, from either the list or the map form. */
  readonly bulkIds: readonly string[] | null;
  /** `id` of a query, snapshot request, presence update or handshake. Numbers for queries and `nf`. */
  readonly id: string | number | null;
  /** `src` of an op, if it had one. */
  readonly src: string | null;
  /** `seq` of an op, or of a presence subscribe or unsubscribe. */
  readonly seq: number | null;
  /** `ch` of a presence request. */
  readonly channel: string | null;
}
