import ShareDB from 'sharedb';
import { hasFunctionProp, hasOwnProp, isObj } from '../utils/type-utils';
import {
  ConnectionAuthorizers,
  EgressAuthorizer,
  EgressDecision,
  GatewayPolicies,
  GatewaySession,
  InboundAuthorizationSubject,
  InboundAuthorizer,
  InboundDecision,
  MatchedQuery,
  QueryAction,
  QueryAuthorization,
  RefusalReply,
  SubscriptionRef,
  subscriptionsOf
} from './authorization';
import { LegacySrcBindings, SrcAuthority, isLegacyShareDbSrc } from './connection-src';
import { DecodeResult } from './decoder';
import { encodeErrorReply, encodeForShareDB } from './forwarded-messages';
import { ConnectionEventLog, GatewayEventDetails, GatewayEventKind } from './gateway-event-log';
import { decodeInboundMessage } from './inbound-decoders';
import {
  BulkDocs,
  BulkFetchRequest,
  BulkSubscribeRequest,
  BulkUnsubscribeRequest,
  ChannelPresenceUpdate,
  CreateOpRequest,
  EditOpRequest,
  HandshakeRequest,
  InboundMessage,
  PresenceUnsubscribeRequest,
  QueryFetchRequest,
  QueryKnownResult,
  QuerySubscribeRequest,
  QueryUnsubscribeRequest,
  UnsubscribeRequest
} from './inbound-messages';
import { JsonObject } from './json';
import { decodeOutboundMessage } from './outbound-decoders';
import { OutboundMessage, OutboundSnapshot, ResultSnapshot, SnapshotMapEntry } from './outbound-messages';
import { GatewayProtocolConfig, JSON0_TYPE_URI } from './protocol-config';
import { CLOSE_CODE_TRY_AGAIN_LATER, GatewayTransport, OVERFLOW_REASON, TransportHandlers } from './transport';

/** The error code of the gateway's replies to requests it refuses. */
export const GATEWAY_REFUSED_CODE = 'ERR_GATEWAY_REFUSED';
/** The error code of the gateway's reply to a query that no registry entry matches. */
export const GATEWAY_UNSUPPORTED_QUERY_CODE = 'ERR_GATEWAY_UNSUPPORTED_QUERY';
/**
 * ShareDB's error code for a read the server refuses without wanting the client to raise an error: the client stops
 * wanting the doc instead (see RefusalReply).
 */
export const SHAREDB_SILENT_READ_REJECTION_CODE = 'ERR_SNAPSHOT_READ_SILENT_REJECTION';
/**
 * The message of every refusal the gateway sends a client. The detailed reason goes only to the event log, because it
 * can say something about a doc the user may not read (such as whether a note thread is published).
 */
export const PERMISSION_DENIED_MESSAGE = '403: Permission denied';
/** The error code of the reply that replaces a reply the egress authorizer withheld. */
export const GATEWAY_WITHHELD_CODE = 'ERR_GATEWAY_WITHHELD';
const WITHHELD_ERROR: { readonly code: string; readonly message: string } = {
  code: GATEWAY_WITHHELD_CODE,
  message: '403: Withheld.'
};
/**
 * A query the gateway forwarded: the registry entry it matched, and whether the authorization it was forwarded with
 * still holds (see QueryAuthorization).
 */
interface ForwardedQuery {
  readonly matched: MatchedQuery;
  isCurrent: (() => boolean) | undefined;
}

/** Why a reply is withheld when the gateway ended its subscription while the request was in flight. */
const ENDED_WHILE_IN_FLIGHT = 'the subscription was ended while the request was in flight';

/** Websocket close codes the gateway uses. 4000-4999 are reserved for applications. */
export const CLOSE_CODE_POLICY_VIOLATION = 1008;
export const CLOSE_CODE_INTERNAL_ERROR = 1011;
export const CLOSE_CODE_TOKEN_EXPIRED = 4001;

/**
 * How many srcs from before the gateway one connection may claim for its user. A client restores at most a few such
 * ops after an upgrade; the limit keeps one connection from filling the process-wide binding table.
 */
const MAX_LEGACY_SRC_BINDINGS_PER_CONNECTION = 100;

/**
 * How many ended subscriptions of each kind (docs, queries, presence channels) one connection remembers. A client that
 * lost access to many docs at once can reach a few thousand; one that reaches this limit is closed rather than letting
 * the messages still in flight for a forgotten subscription through, and it starts afresh when it reconnects.
 */
export const MAX_ENDED_SUBSCRIPTIONS = 10_000;

/**
 * How many forwarded requests one connection may have waiting for their replies, and how many queries it may have in
 * use. The client has a few dozen requests in flight after a reconnect, and an op in flight for each doc it changed
 * offline; a connection that reaches either limit is closed, and starts afresh when it reconnects.
 */
export const MAX_PENDING_REQUESTS = 10_000;
export const MAX_QUERIES = 10_000;

/**
 * The most components a json0 op may have to be forwarded to ShareDB; an op with more gets an error reply (a close
 * would make the client send it again on every reconnect). The client's largest ops mark what a user has read
 * (`checking-questions.component.ts` `updateElementsRead`): one component for the question, and for each of its answers
 * one for the answer and at most three for its comments, so a question would need about 500 answers to reach this. The
 * client also composes the ops it could not send yet into one, which adds up while it is offline. ShareDB's json0
 * transform of two concurrent ops takes time in proportion to the product of their component counts (about 8 seconds
 * for two ops of this many on a laptop), so the limit is kept near what the client needs.
 */
export const MAX_FORWARDED_JSON0_COMPONENTS = 2_000;

/**
 * How far behind the latest version of a doc this connection knows of a doc presence may be. ShareDB transforms a
 * doc presence by every op since its version, which it reads for each presence message. The client sends its doc's
 * version once nothing of its own is pending, so it is behind only by the ops still on their way to it.
 */
export const MAX_PRESENCE_VERSION_LAG = 1_000;

/** How many docs with presence a connection remembers the latest version of (see knownDocVersions). */
export const MAX_KNOWN_DOC_VERSIONS = 10_000;

/** setTimeout cannot wait longer than this. A longer wait is done in steps. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** What a connection needs from the gateway that accepted it. */
export interface GatewayConnectionServices {
  readonly protocol: GatewayProtocolConfig;
  readonly policies: GatewayPolicies;
  readonly srcAuthority: SrcAuthority;
  readonly legacySrcBindings: LegacySrcBindings;
  readonly now: () => number;
  /** How many ended subscriptions of each kind a connection remembers (see MAX_ENDED_SUBSCRIPTIONS). */
  readonly maxEndedSubscriptions: number;
  /** How many forwarded requests may wait for their replies (see MAX_PENDING_REQUESTS). */
  readonly maxPendingRequests: number;
}

/**
 * A forwarded request waiting for its reply. `echo` is what an error reply from the gateway repeats back to the
 * client: the request as forwarded, except that a query keeps the client's own query rather than the built one.
 */
interface PendingRequest {
  readonly forwarded: InboundMessage;
  readonly echo: InboundMessage;
}

/**
 * A request the gateway has decided to forward to ShareDB. Only this module can make one: the constructor is private
 * and the class is not exported. The static methods are the only ways in, so a message reaches ShareDB only after it
 * was decoded and either needs no authorization or was authorized.
 */
class ForwardableRequest {
  private constructor(readonly message: InboundMessage) {}

  /** For messages that only need a valid shape: unsubscribes. */
  static withoutAuthorization(
    message: UnsubscribeRequest | BulkUnsubscribeRequest | QueryUnsubscribeRequest | PresenceUnsubscribeRequest
  ): ForwardableRequest {
    return new ForwardableRequest(message);
  }

  /** For the handshake, once the gateway has put the connection's src into it. */
  static handshake(message: HandshakeRequest & { readonly id: string }): ForwardableRequest {
    return new ForwardableRequest(message);
  }

  /**
   * For a message the policies authorized: the inbound authorizer, and for a query also the query registry. The
   * message may be narrowed from the one authorized (docs left out, the built query in place of the client's).
   */
  static authorized(message: InboundMessage, _decision: { readonly kind: 'authorized' }): ForwardableRequest {
    return new ForwardableRequest(message);
  }
}

/**
 * One client's websocket connection through the gateway. Every message the client sends is decoded, checked and
 * rebuilt before ShareDB sees it, and every message ShareDB sends is decoded and authorized before the client sees it
 * (see the README for the order). The transport runs both directions one message at a time, so this class never
 * handles two inbound or two outbound messages at once.
 */
export class GatewayConnection implements TransportHandlers {
  /** The src this connection's ops and presence carry. Minted for the connection; replaced by a verified hs id. */
  private src: string;
  private handshakeDone = false;
  private agent: ShareDB.Agent | undefined;
  private transport: GatewayTransport | undefined;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private closedByGateway = false;
  private readonly inboundAuthorizer: InboundAuthorizer;
  private readonly egressAuthorizer: EgressAuthorizer;
  /** Forwarded requests still waiting for their reply, by reply key (see requestReplyKey), oldest first. */
  private readonly pendingReplies = new Map<string, PendingRequest[]>();
  /** How many requests pendingReplies holds, over all keys. */
  private pendingCount = 0;
  /** How many srcs from before the gateway this connection has bound to its user. */
  private legacySrcBindingCount = 0;
  /** Each forwarded query, by query id, for authorizing its replies and updates. */
  private readonly queryEntries = new Map<number, ForwardedQuery>();
  /**
   * Subscriptions the egress authorizer ended. Messages already in flight for them are dropped. Each set holds a
   * bounded number of entries (see rememberEnded).
   */
  private readonly revokedDocs = new Set<string>();
  private readonly revokedQueries = new Set<number>();
  private readonly revokedChannels = new Set<string>();
  /**
   * For docs in collections with presence, the latest version this connection has named in a request or been sent, in
   * least recently noted order. A doc presence must name a version the client can know of, and not far behind it.
   */
  private readonly knownDocVersions = new Map<string, number>();

  constructor(
    private readonly services: GatewayConnectionServices,
    readonly session: GatewaySession,
    private readonly expiresAtMs: number,
    private readonly log: ConnectionEventLog
  ) {
    this.src = services.srcAuthority.mint(session.userId);
    this.log.setSrc(this.src);
    const authorizers: ConnectionAuthorizers = services.policies.createConnectionAuthorizers(session);
    this.inboundAuthorizer = authorizers.inbound;
    this.egressAuthorizer = authorizers.egress;
  }

  /**
   * Starts the connection: `transport` carries the socket, and `listen` hands the transport's stream to ShareDB and
   * returns the agent ShareDB made for it. ShareDB writes its first message (init) before `listen` returns.
   */
  start(transport: GatewayTransport, listen: () => ShareDB.Agent): void {
    this.transport = transport;
    this.agent = listen();
    this.scheduleExpiry();
  }

  // TransportHandlers

  async handleInbound(raw: Readonly<Record<string, unknown>>): Promise<void> {
    const decoded: DecodeResult<InboundMessage> = decodeInboundMessage(raw, this.services.protocol);
    if (!decoded.ok) {
      this.closeForViolation('protocol-violation', `${decoded.path}: ${decoded.message}`, {
        action: actionOf(raw)
      });
      return;
    }
    const message: InboundMessage = decoded.value;
    if (!this.handshakeDone && message.kind !== 'handshake') {
      // The client sends its handshake as soon as the socket opens, before anything else. Until then ShareDB's agent
      // has no src, and would use (and reveal) its own id for the connection.
      this.closeForViolation('protocol-violation', 'the first message was not a handshake', describeInbound(message));
      return;
    }
    if (this.pendingCount >= this.services.maxPendingRequests && message.kind !== 'handshake') {
      this.closeForOverflow('too many requests are waiting for a reply');
      return;
    }
    switch (message.kind) {
      case 'handshake':
        this.handleHandshake(message);
        return;
      case 'unsubscribe':
      case 'bulk-unsubscribe':
      case 'query-unsubscribe':
      case 'presence-unsubscribe':
        this.forward(ForwardableRequest.withoutAuthorization(message));
        return;
      case 'edit-op':
      case 'create-op':
        await this.handleOp(message);
        return;
      case 'query-fetch':
      case 'query-subscribe':
        await this.handleQuery(message);
        return;
      case 'doc-presence': {
        const problem: string | null = this.docPresenceVersionProblem(
          message.collection,
          message.docId,
          message.version
        );
        if (problem != null) {
          this.refuse(message, problem);
          return;
        }
        await this.authorizeAndForward({ kind: 'message', message: message, src: this.src });
        return;
      }
      default:
        await this.authorizeAndForward({ kind: 'message', message: message, src: this.src });
        return;
    }
  }

  async handleOutbound(json: string): Promise<readonly string[]> {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      this.closeForUnexpectedOutbound('not JSON', undefined);
      return [];
    }
    const decoded: DecodeResult<OutboundMessage> = decodeOutboundMessage(raw);
    if (!decoded.ok) {
      this.closeForUnexpectedOutbound(`${decoded.path}: ${decoded.message}`, actionOf(raw));
      return [];
    }
    const message: OutboundMessage = decoded.value;
    if (message.kind === 'init') {
      // ShareDB announces its own id for the connection; the client must only ever learn the gateway's src. ShareDB uses
      // its own id in other messages only until the handshake gives the agent a src, and the handshake comes first.
      return [JSON.stringify({ a: 'init', protocol: 1, protocolMinor: 2, id: this.src, type: JSON0_TYPE_URI })];
    }
    if (message.kind === 'handshake-reply') {
      this.takePending(replyKey('hs'));
      if (message.id !== this.src) {
        this.closeForUnexpectedOutbound('handshake reply carries a different id', 'hs');
        return [];
      }
      return [json];
    }

    const key: string | null = outboundReplyKey(message, this.src);
    const pending: PendingRequest | null = key == null ? null : this.takePending(key);
    const request: InboundMessage | null = pending?.forwarded ?? null;
    if (request == null && this.isRevoked(message)) {
      this.log.log('withheld', { reason: 'subscription was ended', ...describeOutbound(message) });
      return [];
    }
    const forwardedQuery: ForwardedQuery | null = this.queryEntryFor(message);
    const query: MatchedQuery | null = forwardedQuery?.matched ?? null;
    // Whether the user may still run the query is known before anything more of its results is sent.
    const queryRefusal: string | null =
      forwardedQuery == null || message.kind === 'query-unsubscribe-reply'
        ? null
        : await this.reauthorizeIfStale(forwardedQuery);
    if (message.kind === 'query-fetch-reply' || message.kind === 'query-unsubscribe-reply') {
      this.queryEntries.delete(message.queryId);
    } else if (
      message.kind === 'error-reply' &&
      (message.action === 'qf' || message.action === 'qs') &&
      typeof message.id === 'number'
    ) {
      // A query that failed has no subscription to follow.
      this.queryEntries.delete(message.id);
    }
    // A reply about a subscription the gateway ended after forwarding the request would let the client think it is
    // subscribed when the server is no longer sending it anything.
    const endedSinceForwarded: ReadonlySet<string> | 'all' | null =
      pending == null ? null : this.endedTargetsOf(message);
    let decision: EgressDecision;
    if (queryRefusal != null) {
      decision = {
        kind: 'withhold',
        reason: `the query is no longer authorized: ${queryRefusal}`,
        end: subscriptionsOf(message)
      };
    } else if (endedSinceForwarded === 'all') {
      // Ending it again also ends a stream ShareDB registered for this request after the gateway ended the old one.
      decision = { kind: 'withhold', reason: ENDED_WHILE_IN_FLIGHT, end: subscriptionsOf(message) };
    } else {
      decision = await this.egressAuthorizer.authorize(message, {
        request: request,
        query: query
      });
      if (endedSinceForwarded != null && endedSinceForwarded.size > 0 && isBulkReply(message)) {
        decision = withAlsoWithheldDocs(decision, message.collection, endedSinceForwarded);
      }
    }
    if (decision.kind === 'send') {
      this.noteRevealed(message, query);
      this.noteSentVersions(message, query);
      return [json];
    }
    for (const subscription of decision.end) {
      this.endSubscription(subscription);
    }
    this.log.log('withheld', { reason: decision.reason, ...describeOutbound(message) });
    if (decision.kind === 'withhold-docs' && pending != null) {
      const partial: readonly string[] | null = this.partialBulkReply(message, raw, pending, decision.docIds);
      if (partial != null) {
        return partial;
      }
    }
    if (pending != null && message.kind !== 'error-reply' && !isPresenceMessage(pending.forwarded)) {
      // The client is waiting for this reply. An error lets it stop waiting without revealing what was withheld.
      // Presence gets no reply, as when it is refused.
      return [JSON.stringify(encodeErrorReply(pending.echo, WITHHELD_ERROR))];
    }
    return [];
  }

  /**
   * The replacement for a bulk reply some of whose docs are withheld: the reply without those docs, and an error
   * reply for them. Null when the message is not a bulk reply, so that it is withheld as a whole.
   */
  private partialBulkReply(
    message: OutboundMessage,
    raw: unknown,
    pending: PendingRequest,
    withheldDocIds: ReadonlySet<string>
  ): readonly string[] | null {
    const echo: InboundMessage = pending.echo;
    if (echo.kind !== 'bulk-fetch' && echo.kind !== 'bulk-subscribe') {
      return null;
    }
    switch (message.kind) {
      case 'bulk-fetch-reply':
      case 'bulk-subscribe-reply': {
        // A snapshot map can carry an error per doc (as ShareDB's own refusals do), so the reply stays one message.
        const data: unknown = hasOwnProp(raw, 'data') ? raw.data : undefined;
        if (!isObj(data)) {
          return null;
        }
        const rebuilt: Record<string, unknown> = {};
        for (const docId of message.snapshots.keys()) {
          if (withheldDocIds.has(docId)) {
            rebuilt[docId] = { error: WITHHELD_ERROR };
          } else if (hasOwnProp(data, docId)) {
            rebuilt[docId] = data[docId];
          } else {
            return null;
          }
        }
        return [JSON.stringify({ a: actionOfBulkReply(message.kind), c: message.collection, data: rebuilt })];
      }
      case 'bulk-fetch-versions-reply':
      case 'bulk-subscribe-versions-reply': {
        // An echo of a versions map answers every doc in it alike, so the withheld docs get their own error reply.
        const withheld: ReadonlyMap<string, string> = new Map(
          Array.from(withheldDocIds, (docId: string): [string, string] => [docId, 'withheld'])
        );
        const split: { allowed: BulkDocs | null; refused: BulkDocs | null } = splitBulkDocs(echo.docs, withheld);
        const texts: string[] = [];
        if (split.refused != null) {
          texts.push(JSON.stringify(encodeErrorReply(withBulkDocs(echo, split.refused), WITHHELD_ERROR)));
        }
        const allowed: Record<string, number> = {};
        for (const [docId, version] of message.versions) {
          if (!withheldDocIds.has(docId)) {
            allowed[docId] = version;
          }
        }
        if (Object.keys(allowed).length > 0) {
          texts.push(JSON.stringify({ a: actionOfBulkReply(message.kind), c: message.collection, b: allowed }));
        }
        return texts;
      }
      default:
        return null;
    }
  }

  /**
   * Logs the write hook's refusal of one of this connection's ops (`refused`), or its failure to check one
   * (`internal-error`). The client only learns that the op was refused.
   */
  logWriteDecision(kind: 'refused' | 'internal-error', reason: string, collection: string, docId: string): void {
    this.log.log(kind, { reason: reason, action: 'apply', collection: collection, docId: docId });
  }

  handleViolation(reason: string): void {
    this.closedByGateway = true;
    this.log.log('protocol-violation', { reason: reason });
  }

  handleOverflow(reason: string): void {
    this.closedByGateway = true;
    this.log.log('overflow', { reason: reason });
  }

  handleInternalError(error: unknown): void {
    this.closedByGateway = true;
    this.log.log('internal-error', { reason: describeError(error) });
  }

  handleClosed(code: number, reason: string): void {
    if (this.expiryTimer != null) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = undefined;
    }
    if (this.closedByGateway) {
      this.log.log('closed', { reason: `${code} ${reason}` });
    }
    this.pendingReplies.clear();
    this.pendingCount = 0;
    this.queryEntries.clear();
    this.inboundAuthorizer.connectionClosed?.();
  }

  // Inbound

  private handleHandshake(message: HandshakeRequest): void {
    if (message.id != null && this.services.srcAuthority.verify(message.id, this.session.userId)) {
      if (this.handshakeDone && message.id !== this.src) {
        // A client sends the same id in every handshake on one socket, so a second, different id is not our client.
        this.closeForViolation('protocol-violation', 'handshake asked for a different connection id', {
          action: 'hs'
        });
        return;
      }
      this.src = message.id;
      this.log.setSrc(this.src);
    }
    // Any other id (none, one from before the gateway, or one that does not verify for this user) is answered with
    // the connection's current src, so that both handshakes on a socket get the same answer.
    this.handshakeDone = true;
    this.forward(ForwardableRequest.handshake({ kind: 'handshake', id: this.src }));
  }

  private async handleOp(message: EditOpRequest | CreateOpRequest): Promise<void> {
    if (
      message.kind === 'edit-op' &&
      message.edit.otType === 'json0' &&
      message.edit.components.length > MAX_FORWARDED_JSON0_COMPONENTS
    ) {
      this.refuse(message, `the op has more than ${MAX_FORWARDED_JSON0_COMPONENTS} components`);
      return;
    }
    const resolution: { src: string; isLegacy: boolean } | null = this.resolveOpSrc(message.src);
    if (resolution == null) {
      this.refuse(message, 'op carries a connection id that does not belong to this user');
      return;
    }
    // The src is always forwarded, so that ShareDB never falls back to an id the gateway did not issue.
    const resolved: EditOpRequest | CreateOpRequest =
      message.kind === 'edit-op' ? { ...message, src: resolution.src } : { ...message, src: resolution.src };
    const decision: InboundDecision = await this.inboundAuthorizer.authorize({
      kind: 'message',
      message: resolved,
      src: this.src
    });
    if (decision.kind !== 'authorized') {
      this.refuse(
        resolved,
        decision.kind === 'refused' ? decision.reason : `${decision.kind} is not a decision for an op`
      );
      return;
    }
    // A src from before the gateway is bound to this user only once an op carrying it is allowed, so that refused
    // ops cannot be used to fill the binding table.
    if (resolution.isLegacy && !this.bindLegacySrc(resolution.src)) {
      this.refuse(resolved, 'op carries a connection id that does not belong to this user');
      return;
    }
    this.forward(ForwardableRequest.authorized(resolved, decision));
  }

  /**
   * The src to forward with an op, or null when the op may not carry the src it has: the connection's own src, a src
   * minted for the same user, or a ShareDB id from before the gateway that no other user has used (`isLegacy`).
   */
  private resolveOpSrc(src: string | null): { src: string; isLegacy: boolean } | null {
    if (src == null || src === this.src) {
      return { src: this.src, isLegacy: false };
    }
    if (this.services.srcAuthority.verify(src, this.session.userId)) {
      return { src: src, isLegacy: false };
    }
    if (isLegacyShareDbSrc(src) && this.services.legacySrcBindings.isAvailableTo(src, this.session.userId)) {
      return { src: src, isLegacy: true };
    }
    return null;
  }

  /** Binds a src from before the gateway to this connection's user. False if it cannot be bound. */
  private bindLegacySrc(src: string): boolean {
    const bindings: LegacySrcBindings = this.services.legacySrcBindings;
    if (bindings.isBoundTo(src, this.session.userId)) {
      return bindings.bindOrCheck(src, this.session.userId);
    }
    if (this.legacySrcBindingCount >= MAX_LEGACY_SRC_BINDINGS_PER_CONNECTION) {
      return false;
    }
    if (!bindings.bindOrCheck(src, this.session.userId)) {
      return false;
    }
    this.legacySrcBindingCount++;
    return true;
  }

  private async handleQuery(message: QueryFetchRequest | QuerySubscribeRequest): Promise<void> {
    if (this.queryEntries.size >= MAX_QUERIES) {
      this.closeForOverflow('too many queries are in use');
      return;
    }
    if (this.queryEntries.has(message.queryId) || this.isQueryPending(message.queryId)) {
      // Our client numbers its queries with a counter, so it never reuses the id of a query still in use.
      this.closeForViolation('protocol-violation', 'query id is already in use', describeInbound(message));
      return;
    }
    const action: QueryAction = message.kind;
    const matched: MatchedQuery | undefined = this.services.policies.queryRegistry.match(
      action,
      message.collection,
      message.query
    );
    if (matched == null) {
      this.log.log('unsupported-query', { reason: 'no registry entry matches', ...describeInbound(message) });
      this.sendErrorReply(message, GATEWAY_UNSUPPORTED_QUERY_CODE, 'Unsupported query.');
      return;
    }
    const queryAuthorization: QueryAuthorization = await matched.authorize(this.session);
    if (queryAuthorization.kind !== 'authorized') {
      this.refuse(message, queryAuthorization.reason);
      return;
    }
    const decision: InboundDecision = await this.inboundAuthorizer.authorize({
      kind: 'query',
      message: message,
      query: matched,
      src: this.src
    });
    let authorized: QueryFetchRequest | QuerySubscribeRequest;
    if (decision.kind === 'authorized') {
      authorized = message;
    } else if (decision.kind === 'partially-authorized' && message.kind === 'query-subscribe') {
      const replaced: QuerySubscribeRequest | null = withRefusedKnownResultsReplaced(
        message,
        decision.refusedDocs,
        decision.knownResultVersions ?? new Map()
      );
      if (replaced == null) {
        this.refuse(message, 'a refused known result has no version to forward it with');
        return;
      }
      authorized = replaced;
    } else {
      this.refuse(
        message,
        decision.kind === 'refused' ? decision.reason : `${decision.kind} is not a decision for this query`
      );
      return;
    }
    // The client's query is never forwarded; the registry builds the one ShareDB runs.
    const builtQuery: JsonObject = await matched.build(this.session);
    this.queryEntries.set(message.queryId, { matched: matched, isCurrent: queryAuthorization.isCurrent });
    const forwarded: QueryFetchRequest | QuerySubscribeRequest = { ...authorized, query: builtQuery };
    this.forward(ForwardableRequest.authorized(forwarded, { kind: 'authorized' }), authorized);
  }

  private async authorizeAndForward(subject: InboundAuthorizationSubject): Promise<void> {
    const message: InboundMessage = subject.message;
    const decision: InboundDecision = await this.inboundAuthorizer.authorize(subject);
    switch (decision.kind) {
      case 'authorized':
        this.forward(ForwardableRequest.authorized(message, decision));
        return;
      case 'refused':
        this.refuse(message, decision.reason, decision.reply ?? 'error');
        return;
      case 'partially-authorized':
        if (message.kind === 'bulk-fetch' || message.kind === 'bulk-subscribe') {
          this.forwardBulkPartially(message, decision.refusedDocs, decision.silentlyRefusedDocs ?? new Set());
        } else {
          this.refuse(message, 'partial refusal of a message that names one doc');
        }
        return;
      case 'authorized-with-viewer':
        if (message.kind === 'channel-presence' && message.viewer != null) {
          const rebuilt: ChannelPresenceUpdate = { ...message, viewer: decision.viewer };
          this.forward(ForwardableRequest.authorized(rebuilt, { kind: 'authorized' }));
        } else {
          this.refuse(message, 'a viewer was given for a message that has none');
        }
        return;
    }
  }

  /**
   * Answers the refused docs of a bulk request with error replies (one for those refused silently, one for the rest),
   * and forwards the rest.
   */
  private forwardBulkPartially(
    message: BulkFetchRequest | BulkSubscribeRequest,
    refusedDocs: ReadonlyMap<string, string>,
    silentlyRefusedDocs: ReadonlySet<string>
  ): void {
    const split: { allowed: BulkDocs | null; refused: BulkDocs | null } = splitBulkDocs(message.docs, refusedDocs);
    if (split.refused != null) {
      const silent = new Map<string, string>();
      const loud = new Map<string, string>();
      for (const [docId, reason] of refusedDocs) {
        (silentlyRefusedDocs.has(docId) ? silent : loud).set(docId, reason);
      }
      this.refuseBulkGroup(message, split.refused, silent, 'silent-read-rejection');
      this.refuseBulkGroup(message, split.refused, loud, 'error');
    }
    if (split.allowed != null) {
      this.forward(ForwardableRequest.authorized(withBulkDocs(message, split.allowed), { kind: 'authorized' }));
    }
  }

  /** Answers the docs of `group` among the refused docs of a bulk request with one error reply, if there are any. */
  private refuseBulkGroup(
    message: BulkFetchRequest | BulkSubscribeRequest,
    refused: BulkDocs,
    group: ReadonlyMap<string, string>,
    reply: RefusalReply
  ): void {
    const groupDocs: BulkDocs | null = splitBulkDocs(refused, group).refused;
    if (groupDocs != null) {
      const firstReason: string = group.values().next().value ?? 'refused';
      this.refuse(withBulkDocs(message, groupDocs), firstReason, reply);
    }
  }

  /** Forwards a request. `echo` is what an error reply would repeat, if not the forwarded request (see PendingRequest). */
  private forward(request: ForwardableRequest, echo?: InboundMessage): void {
    const transport: GatewayTransport | undefined = this.transport;
    if (transport == null) {
      return;
    }
    const message: InboundMessage = request.message;
    this.addPending({ forwarded: message, echo: echo ?? message });
    this.clearRevocation(message);
    this.noteRequestedVersions(message);
    transport.pushToShareDB(encodeForShareDB(message));
  }

  private refuse(message: InboundMessage, reason: string, reply: RefusalReply = 'error'): void {
    this.log.log('refused', { reason: reason, ...describeInbound(message) });
    if (isPresenceMessage(message)) {
      // The client throws on an error reply to presence (TextComponent), so a refused presence message is dropped
      // without one. It reveals nothing either way.
      return;
    }
    if (reply === 'silent-read-rejection' && isDocReadRequest(message)) {
      this.sendErrorReply(message, SHAREDB_SILENT_READ_REJECTION_CODE, PERMISSION_DENIED_MESSAGE);
      return;
    }
    this.sendErrorReply(message, GATEWAY_REFUSED_CODE, PERMISSION_DENIED_MESSAGE);
  }

  private sendErrorReply(message: InboundMessage, code: string, errorMessage: string): void {
    this.transport?.sendFromGateway(JSON.stringify(encodeErrorReply(message, { code: code, message: errorMessage })));
  }

  private closeForViolation(
    kind: GatewayEventKind,
    reason: string,
    details: Omit<GatewayEventDetails, 'reason'>
  ): void {
    this.closedByGateway = true;
    this.log.log(kind, { reason: reason, ...details });
    this.transport?.close(CLOSE_CODE_POLICY_VIOLATION, 'protocol violation');
  }

  /** Closes a connection that holds more of something than the gateway keeps for one connection. */
  private closeForOverflow(reason: string): void {
    this.closedByGateway = true;
    this.log.log('overflow', { reason: reason });
    this.transport?.close(CLOSE_CODE_TRY_AGAIN_LATER, OVERFLOW_REASON);
  }

  private closeForUnexpectedOutbound(reason: string, action: string | undefined): void {
    this.closedByGateway = true;
    this.log.log('unexpected-outbound', { reason: reason, action: action });
    this.transport?.close(CLOSE_CODE_INTERNAL_ERROR, 'unexpected server message');
  }

  private scheduleExpiry(): void {
    const remainingMs: number = this.expiresAtMs - this.services.now();
    if (remainingMs <= 0) {
      this.closedByGateway = true;
      this.log.log('token-expired', { reason: 'access token expired' });
      this.transport?.close(CLOSE_CODE_TOKEN_EXPIRED, 'token expired');
      return;
    }
    this.expiryTimer = setTimeout(
      () => {
        this.expiryTimer = undefined;
        this.scheduleExpiry();
      },
      Math.min(remainingMs, MAX_TIMER_DELAY_MS)
    );
  }

  // Doc versions, for bounding doc presence

  /** Why a doc presence's version is refused, or null when it is within what the connection knows of the doc. */
  private docPresenceVersionProblem(collection: string, docId: string, version: number): string | null {
    const known: number | undefined = this.knownDocVersions.get(docKey(collection, docId));
    if (known == null) {
      return 'presence names a doc whose version the connection has not been given';
    }
    if (version > known) {
      return 'presence names a version of the doc the connection has not been given';
    }
    if (known - version > MAX_PRESENCE_VERSION_LAG) {
      return 'presence names a version of the doc far behind the one the connection has';
    }
    return null;
  }

  /** Notes the doc versions a forwarded request names, which the client has. */
  private noteRequestedVersions(message: InboundMessage): void {
    switch (message.kind) {
      case 'fetch':
      case 'subscribe':
      case 'edit-op':
      case 'create-op':
        if (message.version != null) {
          this.noteDocVersion(message.collection, message.docId, message.version);
        }
        return;
      case 'bulk-fetch':
      case 'bulk-subscribe':
        if (message.docs.form === 'versions') {
          for (const [docId, version] of message.docs.versions) {
            this.noteDocVersion(message.collection, docId, version);
          }
        }
        return;
      case 'query-subscribe':
        for (const result of message.knownResults ?? []) {
          if (result.version != null) {
            this.noteDocVersion(message.collection, result.docId, result.version);
          }
        }
        return;
      default:
        return;
    }
  }

  /** Notes the doc versions a message about to be sent gives the client. */
  private noteSentVersions(message: OutboundMessage, query: MatchedQuery | null): void {
    const noteAll = (collection: string, snapshots: Iterable<readonly [string, OutboundSnapshot]>): void => {
      for (const [docId, snapshot] of snapshots) {
        this.noteDocVersion(collection, docId, snapshot.version);
      }
    };
    const results = (values: readonly ResultSnapshot[]): [string, OutboundSnapshot][] =>
      values.map((value: ResultSnapshot): [string, OutboundSnapshot] => [value.docId, value]);
    const mapEntries = (map: ReadonlyMap<string, SnapshotMapEntry>): [string, OutboundSnapshot][] =>
      Array.from(map).flatMap(([docId, entry]: [string, SnapshotMapEntry]): [string, OutboundSnapshot][] =>
        entry.kind === 'snapshot' ? [[docId, entry.snapshot]] : []
      );
    switch (message.kind) {
      case 'fetch-reply':
      case 'subscribe-reply':
        if (message.snapshot != null) {
          this.noteDocVersion(message.collection, message.docId, message.snapshot.version);
        }
        return;
      case 'bulk-fetch-reply':
      case 'bulk-subscribe-reply':
        noteAll(message.collection, mapEntries(message.snapshots));
        return;
      case 'bulk-fetch-versions-reply':
      case 'bulk-subscribe-versions-reply':
        for (const [docId, version] of message.versions) {
          this.noteDocVersion(message.collection, docId, version);
        }
        return;
      case 'op':
        // The doc is at the next version once the client has applied the op.
        this.noteDocVersion(message.collection, message.docId, message.version + 1);
        return;
      case 'query-fetch-reply':
        if (query != null) {
          noteAll(query.collection, results(message.results));
        }
        return;
      case 'query-subscribe-reply':
        if (query != null && message.data.form === 'results') {
          noteAll(query.collection, results(message.data.results));
        } else if (query != null && message.data.form === 'snapshot-map') {
          noteAll(query.collection, mapEntries(message.data.snapshots));
        }
        return;
      case 'query-diff':
        if (query != null) {
          for (const diff of message.diff) {
            if (diff.kind === 'insert') {
              noteAll(query.collection, results(diff.values));
            }
          }
        }
        return;
      default:
        return;
    }
  }

  /** Notes a version of a doc, if its collection has presence, keeping the latest. */
  private noteDocVersion(collection: string, docId: string, version: number): void {
    if (this.services.protocol.collections.get(collection)?.presence !== true) {
      return;
    }
    const key: string = docKey(collection, docId);
    const known: number | undefined = this.knownDocVersions.get(key);
    this.knownDocVersions.delete(key);
    this.knownDocVersions.set(key, Math.max(known ?? version, version));
    if (this.knownDocVersions.size > MAX_KNOWN_DOC_VERSIONS) {
      const leastRecent: string | undefined = this.knownDocVersions.keys().next().value;
      if (leastRecent != null) {
        this.knownDocVersions.delete(leastRecent);
      }
    }
  }

  // Bookkeeping

  private addPending(request: PendingRequest): void {
    this.pendingCount++;
    const key: string = requestReplyKey(request.forwarded);
    const pending: PendingRequest[] | undefined = this.pendingReplies.get(key);
    if (pending == null) {
      this.pendingReplies.set(key, [request]);
    } else {
      pending.push(request);
    }
  }

  private takePending(key: string): PendingRequest | null {
    const pending: PendingRequest[] | undefined = this.pendingReplies.get(key);
    if (pending == null) {
      return null;
    }
    const request: PendingRequest | undefined = pending.shift();
    if (request != null) {
      this.pendingCount--;
    }
    if (pending.length === 0) {
      this.pendingReplies.delete(key);
    }
    return request ?? null;
  }

  private isQueryPending(queryId: number): boolean {
    return this.pendingReplies.has(replyKey('qf', queryId)) || this.pendingReplies.has(replyKey('qs', queryId));
  }

  /**
   * Authorizes a forwarded query again if what its authorization was decided on may have changed. Resolves to the
   * reason it is refused now, or null when it may still run.
   */
  private async reauthorizeIfStale(query: ForwardedQuery): Promise<string | null> {
    if (query.isCurrent == null || query.isCurrent()) {
      return null;
    }
    const authorization: QueryAuthorization = await query.matched.authorize(this.session);
    if (authorization.kind !== 'authorized') {
      return authorization.reason;
    }
    query.isCurrent = authorization.isCurrent;
    return null;
  }

  private queryEntryFor(message: OutboundMessage): ForwardedQuery | null {
    switch (message.kind) {
      case 'query-fetch-reply':
      case 'query-subscribe-reply':
      case 'query-unsubscribe-reply':
      case 'query-diff':
      case 'query-extra':
        return this.queryEntries.get(message.queryId) ?? null;
      default:
        return null;
    }
  }

  /**
   * A new request starts afresh: what was ended before is not ended for it. This covers every request whose answer
   * includes op pushes (fetches and subscribes with versions, and the catch-up ops of a submitted op), so that the
   * ops it asked for are not dropped as leftovers of an ended subscription.
   */
  private clearRevocation(message: InboundMessage): void {
    switch (message.kind) {
      case 'fetch':
      case 'subscribe':
      case 'edit-op':
      case 'create-op':
        this.revokedDocs.delete(docKey(message.collection, message.docId));
        return;
      case 'bulk-fetch':
      case 'bulk-subscribe':
        for (const docId of bulkDocIds(message.docs)) {
          this.revokedDocs.delete(docKey(message.collection, docId));
        }
        return;
      case 'query-subscribe':
        this.revokedQueries.delete(message.queryId);
        for (const result of message.knownResults ?? []) {
          this.revokedDocs.delete(docKey(message.collection, result.docId));
        }
        return;
      case 'presence-subscribe':
        this.revokedChannels.delete(message.channel.name);
        return;
      default:
        return;
    }
  }

  /**
   * For a reply to a forwarded request that reads docs or a query: what of it the gateway has ended since the request
   * was forwarded (forwarding clears what was ended before). `all` when the reply is about one thing and that was
   * ended; for a bulk reply, the ids of its docs that were ended; null when nothing was.
   */
  private endedTargetsOf(message: OutboundMessage): ReadonlySet<string> | 'all' | null {
    switch (message.kind) {
      case 'fetch-reply':
      case 'subscribe-reply':
        return this.revokedDocs.has(docKey(message.collection, message.docId)) ? 'all' : null;
      case 'bulk-fetch-reply':
      case 'bulk-subscribe-reply':
        return this.revokedAmong(message.collection, message.snapshots.keys());
      case 'bulk-fetch-versions-reply':
      case 'bulk-subscribe-versions-reply':
        return this.revokedAmong(message.collection, message.versions.keys());
      case 'query-fetch-reply':
      case 'query-subscribe-reply':
        return this.revokedQueries.has(message.queryId) ? 'all' : null;
      default:
        return null;
    }
  }

  private revokedAmong(collection: string, docIds: Iterable<string>): ReadonlySet<string> | null {
    const revoked = new Set<string>();
    for (const docId of docIds) {
      if (this.revokedDocs.has(docKey(collection, docId))) {
        revoked.add(docId);
      }
    }
    return revoked.size > 0 ? revoked : null;
  }

  /**
   * A doc whose snapshot a query has just sent the client is followed again, even if its earlier subscription was
   * ended: the query's ops for it are decided by the egress authorizer from now on.
   */
  private noteRevealed(message: OutboundMessage, query: MatchedQuery | null): void {
    if (query == null) {
      return;
    }
    const docIds: string[] = [];
    if (message.kind === 'query-fetch-reply') {
      docIds.push(...message.results.map(result => result.docId));
    } else if (message.kind === 'query-subscribe-reply') {
      if (message.data.form === 'results') {
        docIds.push(...message.data.results.map(result => result.docId));
      } else if (message.data.form === 'snapshot-map') {
        docIds.push(...message.data.snapshots.keys());
      }
    } else if (message.kind === 'query-diff') {
      for (const diff of message.diff) {
        if (diff.kind === 'insert') {
          docIds.push(...diff.values.map(value => value.docId));
        }
      }
    }
    for (const docId of docIds) {
      this.revokedDocs.delete(docKey(query.collection, docId));
    }
  }

  /** Whether a message ShareDB pushed on its own belongs to a subscription the gateway ended. */
  private isRevoked(message: OutboundMessage): boolean {
    switch (message.kind) {
      case 'op':
        return this.revokedDocs.has(docKey(message.collection, message.docId));
      case 'query-diff':
      case 'query-extra':
        return this.revokedQueries.has(message.queryId);
      case 'presence':
      case 'presence-error':
      case 'presence-request-relay':
        return this.revokedChannels.has(message.channel);
      default:
        return false;
    }
  }

  /**
   * Adds an ended subscription to one of the sets of them. When the set is full, the connection is closed instead: a
   * subscription that could not be remembered as ended would let the messages still in flight for it through.
   */
  private rememberEnded<T>(ended: Set<T>, key: T): void {
    if (ended.has(key)) {
      return;
    }
    if (ended.size >= this.services.maxEndedSubscriptions) {
      this.closedByGateway = true;
      this.transport?.close(CLOSE_CODE_INTERNAL_ERROR, 'too many ended subscriptions');
      return;
    }
    ended.add(key);
  }

  /** Ends a server-side subscription the way ShareDB's own unsubscribe handlers do, and remembers it as ended. */
  private endSubscription(subscription: SubscriptionRef): void {
    const agent: ShareDB.Agent | undefined = this.agent;
    switch (subscription.kind) {
      case 'doc': {
        this.rememberEnded(this.revokedDocs, docKey(subscription.collection, subscription.docId));
        const docs: Record<string, unknown> | undefined =
          agent != null && hasOwnProp(agent.subscribedDocs, subscription.collection)
            ? agent.subscribedDocs[subscription.collection]
            : undefined;
        if (docs != null && hasOwnProp(docs, subscription.docId)) {
          destroyStream(docs[subscription.docId]);
        }
        return;
      }
      case 'query': {
        this.rememberEnded(this.revokedQueries, subscription.queryId);
        this.queryEntries.delete(subscription.queryId);
        const queryKey: string = String(subscription.queryId);
        if (agent != null && hasOwnProp(agent.subscribedQueries, queryKey)) {
          destroyStream(agent.subscribedQueries[queryKey]);
          delete agent.subscribedQueries[queryKey];
        }
        return;
      }
      case 'presence':
        this.rememberEnded(this.revokedChannels, subscription.channel);
        if (agent != null && hasOwnProp(agent.subscribedPresences, subscription.channel)) {
          destroyStream(agent.subscribedPresences[subscription.channel]);
          delete agent.subscribedPresences[subscription.channel];
        }
        return;
    }
  }
}

/**
 * Adds docs to an egress decision about a bulk reply, as withheld. Their subscriptions are ended again, in case ShareDB
 * registered new streams for them after the gateway ended the old ones.
 */
function withAlsoWithheldDocs(
  decision: EgressDecision,
  collection: string,
  docIds: ReadonlySet<string>
): EgressDecision {
  const end: SubscriptionRef[] = Array.from(docIds, (docId: string): SubscriptionRef => ({
    kind: 'doc',
    collection: collection,
    docId: docId
  }));
  switch (decision.kind) {
    case 'send':
      return { kind: 'withhold-docs', reason: ENDED_WHILE_IN_FLIGHT, docIds: docIds, end: end };
    case 'withhold-docs':
      return { ...decision, docIds: new Set([...decision.docIds, ...docIds]), end: [...decision.end, ...end] };
    case 'withhold':
      return decision;
  }
}

function isBulkReply(
  message: OutboundMessage
): message is Extract<
  OutboundMessage,
  { kind: 'bulk-fetch-reply' | 'bulk-subscribe-reply' | 'bulk-fetch-versions-reply' | 'bulk-subscribe-versions-reply' }
> {
  return (
    message.kind === 'bulk-fetch-reply' ||
    message.kind === 'bulk-subscribe-reply' ||
    message.kind === 'bulk-fetch-versions-reply' ||
    message.kind === 'bulk-subscribe-versions-reply'
  );
}

function actionOfBulkReply(
  kind: 'bulk-fetch-reply' | 'bulk-subscribe-reply' | 'bulk-fetch-versions-reply' | 'bulk-subscribe-versions-reply'
): 'bf' | 'bs' {
  return kind === 'bulk-fetch-reply' || kind === 'bulk-fetch-versions-reply' ? 'bf' : 'bs';
}

/** Whether a message asks for docs' snapshots or ops: the requests a silent read rejection can answer. */
function isDocReadRequest(message: InboundMessage): boolean {
  switch (message.kind) {
    case 'fetch':
    case 'subscribe':
    case 'bulk-fetch':
    case 'bulk-subscribe':
      return true;
    default:
      return false;
  }
}

/** Whether a message is about presence, whose refusals get no error reply. */
function isPresenceMessage(message: InboundMessage): boolean {
  switch (message.kind) {
    case 'presence-subscribe':
    case 'presence-unsubscribe':
    case 'presence-request':
    case 'channel-presence':
    case 'doc-presence':
      return true;
    default:
      return false;
  }
}

/** Calls `destroy` on one of ShareDB's stream or emitter objects. */
function destroyStream(stream: unknown): void {
  // These are ShareDB's own objects, whose destroy method is inherited from their class, so `in` is the right check.
  if (isObj(stream) && hasFunctionProp(stream, 'destroy')) {
    stream.destroy.call(stream);
  }
}

/** A collision-free key for a list of parts. */
function replyKey(...parts: readonly (string | number)[]): string {
  return JSON.stringify(parts);
}

/**
 * The key of a bulk request and its reply. It includes the doc ids, which every bulk reply names, because one client
 * reconnect can send two bulk requests of the same action and collection (one with ids, one with versions), and
 * ShareDB can answer them in either order.
 */
function bulkReplyKey(action: string, collection: string, docIds: readonly string[]): string {
  return replyKey(action, collection, ...[...docIds].sort());
}

function docKey(collection: string, docId: string): string {
  return replyKey(collection, docId);
}

/** The key under which the reply to a forwarded request will be found (see outboundReplyKey). */
function requestReplyKey(message: InboundMessage): string {
  switch (message.kind) {
    case 'handshake':
      return replyKey('hs');
    case 'fetch':
      return replyKey('f', message.collection, message.docId);
    case 'subscribe':
      return replyKey('s', message.collection, message.docId);
    case 'unsubscribe':
      return replyKey('u', message.collection, message.docId);
    case 'bulk-fetch':
      return bulkReplyKey('bf', message.collection, bulkDocIds(message.docs));
    case 'bulk-subscribe':
      return bulkReplyKey('bs', message.collection, bulkDocIds(message.docs));
    case 'bulk-unsubscribe':
      return bulkReplyKey('bu', message.collection, message.ids);
    case 'edit-op':
    case 'create-op':
      // Forwarded ops always carry their src (see handleOp).
      return replyKey('op', message.src ?? '', message.seq);
    case 'query-fetch':
      return replyKey('qf', message.queryId);
    case 'query-subscribe':
      return replyKey('qs', message.queryId);
    case 'query-unsubscribe':
      return replyKey('qu', message.queryId);
    case 'snapshot-fetch':
      return replyKey('nf', message.requestId);
    case 'presence-subscribe':
      return replyKey('ps', message.channel.name, message.seq);
    case 'presence-unsubscribe':
      return replyKey('pu', message.channel.name, message.seq);
    case 'presence-request':
      return replyKey('pr');
    case 'channel-presence':
    case 'doc-presence':
      return replyKey('p', message.channel.name, message.presenceId);
  }
}

/**
 * The key of the forwarded request an outbound message answers, or null for messages ShareDB sends on its own. An op
 * message without content may be an ack or a no-op push; it is an ack only if a matching op is pending.
 */
function outboundReplyKey(message: OutboundMessage, ownSrc: string): string | null {
  switch (message.kind) {
    case 'init':
    case 'query-diff':
    case 'query-extra':
    case 'presence-error':
    case 'presence-request-relay':
      return null;
    case 'handshake-reply':
      return replyKey('hs');
    case 'fetch-reply':
      return replyKey('f', message.collection, message.docId);
    case 'subscribe-reply':
      return replyKey('s', message.collection, message.docId);
    case 'unsubscribe-reply':
      return replyKey('u', message.collection, message.docId);
    case 'bulk-fetch-reply':
      return bulkReplyKey('bf', message.collection, Array.from(message.snapshots.keys()));
    case 'bulk-fetch-versions-reply':
      return bulkReplyKey('bf', message.collection, Array.from(message.versions.keys()));
    case 'bulk-subscribe-reply':
      return bulkReplyKey('bs', message.collection, Array.from(message.snapshots.keys()));
    case 'bulk-subscribe-versions-reply':
      return bulkReplyKey('bs', message.collection, Array.from(message.versions.keys()));
    case 'bulk-unsubscribe-reply':
      return bulkReplyKey('bu', message.collection, message.ids);
    case 'query-fetch-reply':
      return replyKey('qf', message.queryId);
    case 'query-subscribe-reply':
      return replyKey('qs', message.queryId);
    case 'query-unsubscribe-reply':
      return replyKey('qu', message.queryId);
    case 'op':
      return message.content.kind === 'none' && message.src != null && message.seq != null
        ? replyKey('op', message.src, message.seq)
        : null;
    case 'snapshot-fetch-reply':
      return replyKey('nf', message.requestId);
    case 'presence':
      // ShareDB echoes a client's own presence back to it as the reply; everyone else's arrives as a relay.
      return message.src === ownSrc ? replyKey('p', message.channel, message.presenceId) : null;
    case 'presence-subscribe-reply':
      return replyKey('ps', message.channel, message.seq);
    case 'presence-unsubscribe-reply':
      return replyKey('pu', message.channel, message.seq);
    case 'presence-request-reply':
      return replyKey('pr');
    case 'error-reply':
      return errorReplyKey(message);
  }
}

function errorReplyKey(message: Extract<OutboundMessage, { kind: 'error-reply' }>): string | null {
  switch (message.action) {
    case 'hs':
    case 'pr':
      return replyKey(message.action);
    case 'f':
    case 's':
    case 'u':
      return message.collection != null && message.docId != null
        ? replyKey(message.action, message.collection, message.docId)
        : null;
    case 'bf':
    case 'bs':
    case 'bu':
      return message.collection != null && message.bulkIds != null
        ? bulkReplyKey(message.action, message.collection, message.bulkIds)
        : null;
    case 'op':
      return message.src != null && message.seq != null ? replyKey('op', message.src, message.seq) : null;
    case 'qf':
    case 'qs':
    case 'qu':
    case 'nf':
      return typeof message.id === 'number' ? replyKey(message.action, message.id) : null;
    case 'ps':
    case 'pu':
      return message.channel != null && message.seq != null
        ? replyKey(message.action, message.channel, message.seq)
        : null;
    case 'p':
      return message.channel != null && typeof message.id === 'string'
        ? replyKey('p', message.channel, message.id)
        : null;
  }
}

function bulkDocIds(docs: BulkDocs): readonly string[] {
  return docs.form === 'ids' ? docs.ids : Array.from(docs.versions.keys());
}

/** Splits a bulk request's docs into those allowed and those refused. Either side is null when it has no docs. */
function splitBulkDocs(
  docs: BulkDocs,
  refusedDocs: ReadonlyMap<string, string>
): { allowed: BulkDocs | null; refused: BulkDocs | null } {
  if (docs.form === 'ids') {
    const allowed: string[] = docs.ids.filter(id => !refusedDocs.has(id));
    const refused: string[] = docs.ids.filter(id => refusedDocs.has(id));
    return {
      allowed: allowed.length > 0 ? { form: 'ids', ids: allowed } : null,
      refused: refused.length > 0 ? { form: 'ids', ids: refused } : null
    };
  }
  const allowed = new Map<string, number>();
  const refused = new Map<string, number>();
  for (const [id, version] of docs.versions) {
    (refusedDocs.has(id) ? refused : allowed).set(id, version);
  }
  return {
    allowed: allowed.size > 0 ? { form: 'versions', versions: allowed } : null,
    refused: refused.size > 0 ? { form: 'versions', versions: refused } : null
  };
}

function withBulkDocs(
  message: BulkFetchRequest | BulkSubscribeRequest,
  docs: BulkDocs
): BulkFetchRequest | BulkSubscribeRequest {
  if (message.kind === 'bulk-fetch') {
    const narrowed: BulkFetchRequest = { kind: 'bulk-fetch', collection: message.collection, docs: docs };
    return narrowed;
  }
  const narrowed: BulkSubscribeRequest = { kind: 'bulk-subscribe', collection: message.collection, docs: docs };
  return narrowed;
}

/**
 * A query subscribe whose refused known results carry the version the inbound authorizer gave them in place of the
 * client's. They are never left out: ShareDB works out the query's diffs against the ids in `r`, and the client applies
 * them by index into the results it holds. Null when a refused known result has no version to forward it with.
 */
function withRefusedKnownResultsReplaced(
  message: QuerySubscribeRequest,
  refusedDocs: ReadonlyMap<string, string>,
  forwardVersions: ReadonlyMap<string, number | null>
): QuerySubscribeRequest | null {
  if (message.knownResults == null) {
    return message;
  }
  const knownResults: QueryKnownResult[] = [];
  for (const result of message.knownResults) {
    if (!refusedDocs.has(result.docId)) {
      knownResults.push(result);
      continue;
    }
    const version: number | null | undefined = forwardVersions.get(result.docId);
    if (version === undefined) {
      return null;
    }
    knownResults.push({ docId: result.docId, version: version });
  }
  return { ...message, knownResults: knownResults };
}

/** The `a` of a raw message, for logs, if it is a short string. */
function actionOf(raw: unknown): string | undefined {
  if (isObj(raw) && hasOwnProp(raw, 'a') && typeof raw.a === 'string') {
    return raw.a.slice(0, 16);
  }
  return undefined;
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

/** What identifies an inbound message, for logs. */
function describeInbound(message: InboundMessage): Omit<GatewayEventDetails, 'reason'> {
  switch (message.kind) {
    case 'handshake':
      return { action: 'hs' };
    case 'fetch':
    case 'subscribe':
    case 'unsubscribe':
    case 'edit-op':
    case 'create-op':
    case 'snapshot-fetch':
      return { action: message.kind, collection: message.collection, docId: message.docId };
    case 'bulk-fetch':
    case 'bulk-subscribe':
    case 'bulk-unsubscribe':
      return { action: message.kind, collection: message.collection };
    case 'query-fetch':
    case 'query-subscribe':
      return { action: message.kind, collection: message.collection, queryId: message.queryId };
    case 'query-unsubscribe':
      return { action: message.kind, queryId: message.queryId };
    case 'presence-subscribe':
    case 'presence-unsubscribe':
    case 'presence-request':
    case 'channel-presence':
    case 'doc-presence':
      return {
        action: message.kind,
        collection: message.channel.collection,
        docId: message.channel.docId,
        channel: message.channel.name
      };
  }
}

/** What identifies an outbound message, for logs. */
function describeOutbound(message: OutboundMessage): Omit<GatewayEventDetails, 'reason'> {
  switch (message.kind) {
    case 'fetch-reply':
    case 'subscribe-reply':
    case 'unsubscribe-reply':
    case 'op':
      return { action: message.kind, collection: message.collection, docId: message.docId };
    case 'bulk-fetch-reply':
    case 'bulk-subscribe-reply':
    case 'bulk-fetch-versions-reply':
    case 'bulk-subscribe-versions-reply':
    case 'bulk-unsubscribe-reply':
      return { action: message.kind, collection: message.collection };
    case 'query-fetch-reply':
    case 'query-subscribe-reply':
    case 'query-unsubscribe-reply':
    case 'query-diff':
    case 'query-extra':
      return { action: message.kind, queryId: message.queryId };
    case 'presence':
    case 'presence-error':
    case 'presence-request-relay':
    case 'presence-subscribe-reply':
    case 'presence-unsubscribe-reply':
      return { action: message.kind, channel: message.channel };
    case 'error-reply':
      return {
        action: `error-reply:${message.action}`,
        collection: message.collection ?? undefined,
        docId: message.docId ?? undefined
      };
    default:
      return { action: message.kind };
  }
}
