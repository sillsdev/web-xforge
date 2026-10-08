import {
  AuthorizableInboundMessage,
  CreateOpRequest,
  EditOpRequest,
  InboundMessage,
  OpEdit,
  QueryFetchRequest,
  QuerySubscribeRequest,
  ViewerPresence
} from './inbound-messages';
import { JsonObject } from './json';
import { OutboundMessage } from './outbound-messages';

/**
 * The interfaces through which the gateway asks whether something is allowed, and the fail-closed implementation of
 * each. The gateway core (gateway-connection.ts) calls them; applications implement them with their own policies.
 *
 * Every decision fails closed: an implementation that cannot decide must refuse (inbound, writes) or withhold
 * (egress). The core treats a decision it cannot apply, a rejected promise or a thrown exception the same way.
 */

/** Who is on the other end of a gateway connection, from the verified access token. */
export interface GatewaySession {
  readonly userId: string;
  readonly systemRoles: readonly string[];
}

/** What the gateway needs from an application to authorize traffic. */
export interface GatewayPolicies {
  readonly queryRegistry: QueryRegistry;
  readonly writeHook: WriteHook;
  /**
   * Called once for each new connection, so that the authorizers can keep per-connection state, such as read decisions,
   * and share it between the two directions.
   */
  createConnectionAuthorizers(session: GatewaySession): ConnectionAuthorizers;
}

/** The authorizers of one connection. */
export interface ConnectionAuthorizers {
  readonly inbound: InboundAuthorizer;
  readonly egress: EgressAuthorizer;
}

// Inbound

/**
 * A decoded inbound message to authorize. Queries come with the registry entry their query matched; the query
 * registry has already authorized the query itself, and the inbound authorizer decides the rest (such as `r`).
 * `src` is the connection's src at the time, which presence messages carry to other clients.
 */
export type InboundAuthorizationSubject =
  | {
      readonly kind: 'message';
      readonly message: Exclude<AuthorizableInboundMessage, QueryFetchRequest | QuerySubscribeRequest>;
      readonly src: string;
    }
  | {
      readonly kind: 'query';
      readonly message: QueryFetchRequest | QuerySubscribeRequest;
      readonly query: MatchedQuery;
      readonly src: string;
    };

/**
 * Whether an inbound message may be forwarded. `partially-authorized` is only for messages that name several docs
 * (`bf`, `bs`, and the `r` of `qs`). For `bf` and `bs`, the docs in `refusedDocs` (id to reason) get an error reply and
 * the rest is forwarded. For `qs`, every refused doc stays in `r`, with the version `knownResultVersions` gives it in
 * place of the client's; a refused doc without one there refuses the whole query.
 * `authorized-with-viewer` is only for a channel presence update with a viewer: it is forwarded with `viewer` in place
 * of the one the client sent. For any other message, the core treats either of these as a refusal.
 */
export type InboundDecision =
  | { readonly kind: 'authorized' }
  | {
      readonly kind: 'refused';
      readonly reason: string;
      /** See RefusalReply. Absent means `error`. */
      readonly reply?: RefusalReply;
    }
  | {
      readonly kind: 'partially-authorized';
      readonly refusedDocs: ReadonlyMap<string, string>;
      /** The refused docs whose refusal is a `silent-read-rejection` (see RefusalReply). */
      readonly silentlyRefusedDocs?: ReadonlySet<string>;
      /**
       * For the `r` of a `qs`: the version to forward each refused doc with, chosen so that ShareDB sends nothing of
       * the doc the user may not see. Null asks ShareDB for the doc as it is now.
       */
      readonly knownResultVersions?: ReadonlyMap<string, number | null>;
    }
  | { readonly kind: 'authorized-with-viewer'; readonly viewer: ViewerPresence };

/**
 * How a refusal is answered. `error` is the gateway's own refusal error. `silent-read-rejection` is ShareDB's
 * ERR_SNAPSHOT_READ_SILENT_REJECTION, which the ShareDB client takes as "stop wanting this doc" without raising an
 * error. It is for fetches and subscribes the client library sends by itself, such as resubscribing after a reconnect
 * to a doc that was deleted meanwhile, where an error would reach the app as an unhandled one. Other messages always
 * get `error`.
 */
export type RefusalReply = 'error' | 'silent-read-rejection';

/** Decides whether one connection's requests may reach ShareDB. One instance per connection. */
export interface InboundAuthorizer {
  authorize(subject: InboundAuthorizationSubject): Promise<InboundDecision>;
  /** Called once, when the connection has closed, so that the authorizer can let go of what it holds for it. */
  connectionClosed?(): void;
}

// Queries

/** The query actions a registry entry can be used with. */
export type QueryAction = 'query-fetch' | 'query-subscribe';

/**
 * Whether a matched query may run. `isCurrent` says whether what an authorization was decided on (such as the user's
 * project membership) still holds; once it does not, the gateway authorizes the query again before it sends the
 * client more of its results, and ends the query if it is refused. Without `isCurrent`, the authorization holds for as
 * long as the query runs, as when it depends only on the session.
 */
export type QueryAuthorization =
  | { readonly kind: 'authorized'; readonly isCurrent?: () => boolean }
  | { readonly kind: 'refused'; readonly reason: string };

/**
 * One query shape the application's client sends. `match` accepts exactly that shape and extracts its arguments;
 * `authorize` decides whether the session may run it; `build` makes the query the gateway forwards in place of the
 * client's, including any filter the session's role needs.
 */
export interface QueryRegistryEntry<Args> {
  /** A short name for logs, such as `questions-by-project`. */
  readonly name: string;
  /** The collection or projection the query is sent to. */
  readonly collection: string;
  readonly actions: readonly QueryAction[];
  /**
   * Whether `extra` (a `$count` result) may be sent to the client. Only true when the built query restricts its
   * results to docs the session may read, so that the count reveals nothing more than the results would.
   */
  readonly extraIsSafe: boolean;
  match(query: JsonObject): Args | undefined;
  authorize(args: Args, session: GatewaySession): Promise<QueryAuthorization>;
  build(args: Args, session: GatewaySession): Promise<JsonObject>;
}

/**
 * A query that matched a registry entry, with its arguments bound, so that code holding it does not need to know the
 * entry's argument type.
 */
export interface MatchedQuery {
  readonly entryName: string;
  /** The collection or projection the query is sent to. */
  readonly collection: string;
  readonly extraIsSafe: boolean;
  authorize(session: GatewaySession): Promise<QueryAuthorization>;
  build(session: GatewaySession): Promise<JsonObject>;
}

/** Finds the registry entry for a query the client sent. */
export interface QueryRegistry {
  /** The entry whose shape the query has exactly, or undefined when none has (or more than one has). */
  match(action: QueryAction, collection: string, query: JsonObject): MatchedQuery | undefined;
}

/** A registry entry with its argument type hidden, so that entries with different argument types fit in one list. */
export interface RegisteredQuery {
  readonly name: string;
  readonly collection: string;
  readonly actions: readonly QueryAction[];
  match(query: JsonObject): MatchedQuery | undefined;
}

/** Wraps a registry entry for ListQueryRegistry. */
export function registerQuery<Args>(entry: QueryRegistryEntry<Args>): RegisteredQuery {
  return {
    name: entry.name,
    collection: entry.collection,
    actions: entry.actions,
    match: (query: JsonObject): MatchedQuery | undefined => {
      const args: Args | undefined = entry.match(query);
      if (args === undefined) {
        return undefined;
      }
      return {
        entryName: entry.name,
        collection: entry.collection,
        extraIsSafe: entry.extraIsSafe,
        authorize: (session: GatewaySession): Promise<QueryAuthorization> => entry.authorize(args, session),
        build: (session: GatewaySession): Promise<JsonObject> => entry.build(args, session)
      };
    }
  };
}

/** A query registry made of a list of entries. A query that matches more than one entry is not supported. */
export class ListQueryRegistry implements QueryRegistry {
  constructor(private readonly entries: readonly RegisteredQuery[]) {}

  match(action: QueryAction, collection: string, query: JsonObject): MatchedQuery | undefined {
    let found: MatchedQuery | undefined;
    for (const entry of this.entries) {
      if (entry.collection !== collection || !entry.actions.includes(action)) {
        continue;
      }
      const matched: MatchedQuery | undefined = entry.match(query);
      if (matched == null) {
        continue;
      }
      if (found != null) {
        // Two entries claim the same query, so it is not clear which authorization and build apply.
        return undefined;
      }
      found = matched;
    }
    return found;
  }
}

// Egress

/** A server-side subscription the gateway can end without the client asking. */
export type SubscriptionRef =
  | { readonly kind: 'doc'; readonly collection: string; readonly docId: string }
  | { readonly kind: 'query'; readonly queryId: number }
  | { readonly kind: 'presence'; readonly channel: string };

/**
 * Whether an outbound message may be sent. A withheld message is dropped, and the subscriptions in `end` are ended
 * on the server and ignored from then on. The connection stays open.
 *
 * `withhold-docs` is only for the replies to `bf` and `bs`: the docs in `docIds` are answered with an error, and the
 * rest of the reply is sent. For any other message, the core treats it as withholding the whole message.
 */
export type EgressDecision =
  | { readonly kind: 'send' }
  | { readonly kind: 'withhold'; readonly reason: string; readonly end: readonly SubscriptionRef[] }
  | {
      readonly kind: 'withhold-docs';
      readonly reason: string;
      readonly docIds: ReadonlySet<string>;
      readonly end: readonly SubscriptionRef[];
    };

/** The outbound messages an egress authorizer sees. The core handles `init` and the handshake reply itself. */
export type AuthorizableOutboundMessage = Exclude<OutboundMessage, { readonly kind: 'init' | 'handshake-reply' }>;

/** What the core knows about an outbound message beyond its content. */
export interface EgressContext {
  /**
   * The request, as forwarded, that this message answers; null for messages ShareDB pushes on its own (op pushes,
   * query updates, presence relays). For an op message, a non-null request means the message is that op's ack.
   */
  readonly request: InboundMessage | null;
  /** For messages about a query (replies, diffs, extra), the registry entry the query matched. */
  readonly query: MatchedQuery | null;
}

/** Decides whether ShareDB's messages to one connection may reach the client. One instance per connection. */
export interface EgressAuthorizer {
  authorize(message: AuthorizableOutboundMessage, context: EgressContext): Promise<EgressDecision>;
}

// Writes

/** The change a submitted op makes, as seen by the write hook after ShareDB transformed it. */
export type GatewayWriteChange =
  | { readonly kind: 'create'; readonly type: string; readonly data: JsonObject }
  | { readonly kind: 'edit'; readonly edit: OpEdit }
  | { readonly kind: 'delete' };

/**
 * An op about to be applied, as the `apply` middleware sees it: transformed to the current version, with the
 * snapshot at that same version (before the op is applied).
 */
export interface GatewayWrite {
  /** The collection the doc is stored in (for a projection, the collection behind it). */
  readonly collection: string;
  /** The collection or projection name the client addressed the op to. */
  readonly addressedAs: string;
  readonly docId: string;
  readonly change: GatewayWriteChange;
  /** The doc before the op. `type` is null when the doc does not exist. */
  readonly snapshot: { readonly version: number; readonly type: string | null; readonly data: unknown };
}

/** Whether an op may be applied. */
export type WriteDecision = { readonly kind: 'allowed' } | { readonly kind: 'refused'; readonly reason: string };

/**
 * Decides whether an op from a gateway connection may be applied. ShareDB can run `apply` more than once for the same
 * op when a commit has to be retried, so a decision must not depend on having been asked before.
 */
export interface WriteHook {
  authorize(write: GatewayWrite, session: GatewaySession): Promise<WriteDecision>;
}

// Fail-closed implementations

const FAIL_CLOSED_REASON = 'No access policy allows this.';

/** Refuses every inbound message that needs authorization. */
export class FailClosedInboundAuthorizer implements InboundAuthorizer {
  async authorize(_subject: InboundAuthorizationSubject): Promise<InboundDecision> {
    return { kind: 'refused', reason: FAIL_CLOSED_REASON };
  }
}

/** Matches no query, so every query gets an `unsupported-query` error reply. */
export class EmptyQueryRegistry implements QueryRegistry {
  match(_action: QueryAction, _collection: string, _query: JsonObject): MatchedQuery | undefined {
    return undefined;
  }
}

/** Refuses every write. */
export class FailClosedWriteHook implements WriteHook {
  async authorize(_write: GatewayWrite, _session: GatewaySession): Promise<WriteDecision> {
    return { kind: 'refused', reason: FAIL_CLOSED_REASON };
  }
}

/**
 * Sends only messages that reveal no doc data: replies to unsubscribes, op acks, error replies, and the reply to the
 * client's own presence request. Everything else is withheld, and its subscriptions are ended.
 */
export class FailClosedEgressAuthorizer implements EgressAuthorizer {
  async authorize(message: AuthorizableOutboundMessage, context: EgressContext): Promise<EgressDecision> {
    switch (message.kind) {
      case 'unsubscribe-reply':
      case 'bulk-unsubscribe-reply':
      case 'query-unsubscribe-reply':
      case 'presence-unsubscribe-reply':
      case 'presence-request-reply':
      case 'error-reply':
        return { kind: 'send' };
      case 'op':
        if (isAckOf(message.content.kind, context.request)) {
          return { kind: 'send' };
        }
        return withhold(subscriptionsOf(message));
      default:
        return withhold(subscriptionsOf(message));
    }
  }
}

/** The fail-closed policies: no query is supported and nothing that needs authorization is allowed. */
export class FailClosedGatewayPolicies implements GatewayPolicies {
  readonly queryRegistry: QueryRegistry = new EmptyQueryRegistry();
  readonly writeHook: WriteHook = new FailClosedWriteHook();

  createConnectionAuthorizers(_session: GatewaySession): ConnectionAuthorizers {
    return { inbound: new FailClosedInboundAuthorizer(), egress: new FailClosedEgressAuthorizer() };
  }
}

/** Whether an op message with this content answers `request` as its ack. Acks carry no op content. */
function isAckOf(contentKind: string, request: InboundMessage | null): request is EditOpRequest | CreateOpRequest {
  return contentKind === 'none' && request != null && (request.kind === 'edit-op' || request.kind === 'create-op');
}

/**
 * The server-side subscriptions through which a message reaches the client, which withholding it should end: the
 * doc subscriptions of the docs it is about, the query it belongs to, or the presence channel it was sent on. None for
 * messages that belong to no subscription.
 */
export function subscriptionsOf(message: AuthorizableOutboundMessage): SubscriptionRef[] {
  switch (message.kind) {
    case 'op':
    case 'fetch-reply':
    case 'subscribe-reply':
      return [{ kind: 'doc', collection: message.collection, docId: message.docId }];
    case 'bulk-fetch-reply':
    case 'bulk-subscribe-reply':
      return docSubscriptions(message.collection, message.snapshots.keys());
    case 'bulk-fetch-versions-reply':
    case 'bulk-subscribe-versions-reply':
      return docSubscriptions(message.collection, message.versions.keys());
    case 'query-fetch-reply':
    case 'query-subscribe-reply':
    case 'query-diff':
    case 'query-extra':
      return [{ kind: 'query', queryId: message.queryId }];
    case 'presence':
    case 'presence-error':
    case 'presence-request-relay':
    case 'presence-subscribe-reply':
      return [{ kind: 'presence', channel: message.channel }];
    case 'unsubscribe-reply':
    case 'bulk-unsubscribe-reply':
    case 'query-unsubscribe-reply':
    case 'presence-unsubscribe-reply':
    case 'presence-request-reply':
    case 'snapshot-fetch-reply':
    case 'error-reply':
      return [];
  }
}

function docSubscriptions(collection: string, docIds: Iterable<string>): SubscriptionRef[] {
  return Array.from(docIds, (docId: string): SubscriptionRef => ({
    kind: 'doc',
    collection: collection,
    docId: docId
  }));
}

function withhold(end: readonly SubscriptionRef[]): EgressDecision {
  return { kind: 'withhold', reason: FAIL_CLOSED_REASON, end: end };
}
