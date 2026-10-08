import ShareDB from 'sharedb';
import {
  AuthorizableOutboundMessage,
  EgressAuthorizer,
  EgressContext,
  EgressDecision,
  GatewaySession,
  MatchedQuery,
  subscriptionsOf,
  SubscriptionRef
} from '../../common/gateway/authorization';
import { StoredOp, StoredSnapshot } from '../../common/gateway/gateway-data-source';
import { parsePresenceChannel } from '../../common/gateway/inbound-decoders';
import { InboundMessage, Json0Component, PresenceChannel } from '../../common/gateway/inbound-messages';
import {
  OpMessage,
  OutboundSnapshot,
  PresenceMessage,
  ResultSnapshot,
  SnapshotMapEntry
} from '../../common/gateway/outbound-messages';
import { JSON0_TYPE_URI } from '../../common/gateway/protocol-config';
import { hasOwnProp } from '../../common/utils/type-utils';
import { EpochRecordingProjectSource } from './project-access';
import { pickFields, ReadGrant, ReadGrants } from './read-grants';
import { SFAccessContext } from './sf-access-context';
import { CollectionPolicy, decideRead, denied, PolicyDecision } from './sf-collection-policy';
import { SF_COLLECTION_POLICIES } from './sf-collection-policies';
import { SF_GATEWAY_PROTOCOL } from './sf-gateway-protocol';
import { SFGatewayServices } from './sf-inbound-authorizer';

/**
 * Decides which of ShareDB's messages to one connection may reach the client. Every doc a message reveals must be
 * readable by the session under the collection policies (SF_COLLECTION_POLICIES):
 *
 * - A snapshot (in a fetch, subscribe, bulk or query reply, or a query diff insert) is decided on the data it reveals.
 *   For a projection whose read depends on fields of the doc, the stored doc is read instead, because the projected
 *   data may not have those fields.
 * - An op is decided by the doc's cached read decision (see ReadGrants), so that a stream of ops needs no database
 *   reads. Without a current decision, the doc as it was before the op is read and decided on; after an op that changes
 *   a field the decision depends on, the decision is made again. A create op is decided on the data it creates. A
 *   delete op reveals nothing of the doc, and is sent to a connection that was ever allowed to read the doc.
 * - Query `extra` is sent only when the query's registry entry says it is safe. A query diff with any withheld insert
 *   is withheld whole, and the query is ended: the client's results would otherwise be out of step with every later
 *   diff.
 * - `nf` is decided on the past snapshot it reveals and on the doc as stored now.
 * - Presence is decided by the doc its channel names, and a doc presence must name the same doc as its channel.
 *
 * Whatever cannot be decided, including when the database cannot be read, is withheld.
 */
export class SFEgressAuthorizer implements EgressAuthorizer {
  private readonly context: SFAccessContext;

  /** `grants` is the connection's read decisions, shared with its inbound authorizer. */
  constructor(
    session: GatewaySession,
    private readonly services: SFGatewayServices,
    private readonly grants: ReadGrants
  ) {
    this.context = { session: session, projects: services.projects, profiles: services.profiles, data: services.data };
  }

  async authorize(message: AuthorizableOutboundMessage, context: EgressContext): Promise<EgressDecision> {
    try {
      return await this.decide(message, context);
    } catch {
      // Usually the database could not be read. The subscription is left alone, so that once it can be read again the
      // next message is decided as usual; the client fetches what it missed when an op skips a version.
      return withhold('the message could not be checked', []);
    }
  }

  private async decide(message: AuthorizableOutboundMessage, context: EgressContext): Promise<EgressDecision> {
    switch (message.kind) {
      case 'unsubscribe-reply':
      case 'bulk-unsubscribe-reply':
      case 'query-unsubscribe-reply':
      case 'presence-subscribe-reply':
      case 'presence-unsubscribe-reply':
      case 'presence-request-reply':
      case 'error-reply':
      // Replies to bulk requests with versions only echo the versions; the ops since them were decided one by one.
      case 'bulk-fetch-versions-reply':
      case 'bulk-subscribe-versions-reply':
        return SEND;
      case 'fetch-reply':
      case 'subscribe-reply': {
        if (message.snapshot == null) {
          // A reply to a request with a version: the ops since it were decided one by one.
          return SEND;
        }
        const refused: ReadonlyMap<string, string> = await this.decideSnapshots(message.collection, [
          [message.docId, message.snapshot]
        ]);
        return refused.size === 0 ? SEND : withhold(firstReason(refused), subscriptionsOf(message));
      }
      case 'bulk-fetch-reply':
      case 'bulk-subscribe-reply': {
        const refused: ReadonlyMap<string, string> = await this.decideSnapshots(
          message.collection,
          snapshotsOfMap(message.snapshots)
        );
        if (refused.size === 0) {
          return SEND;
        }
        return {
          kind: 'withhold-docs',
          reason: firstReason(refused),
          docIds: new Set(refused.keys()),
          end: Array.from(refused.keys(), (docId: string) => docSubscription(message.collection, docId))
        };
      }
      case 'query-fetch-reply':
      case 'query-subscribe-reply':
        return this.decideQueryReply(message, context.query);
      case 'query-diff': {
        const end: SubscriptionRef[] = subscriptionsOf(message);
        if (context.query == null) {
          return withhold('the query is not known', end);
        }
        const inserted: ResultSnapshot[] = [];
        for (const diff of message.diff) {
          if (diff.kind === 'insert') {
            inserted.push(...diff.values);
          }
        }
        const refused: ReadonlyMap<string, string> = await this.decideSnapshots(
          context.query.collection,
          inserted.map((result: ResultSnapshot): [string, OutboundSnapshot] => [result.docId, result])
        );
        return refused.size === 0 ? SEND : withhold(firstReason(refused), end);
      }
      case 'query-extra':
        if (context.query == null) {
          return withhold('the query is not known', subscriptionsOf(message));
        }
        return message.hasExtra && !context.query.extraIsSafe
          ? withhold('the query result count may reveal docs', subscriptionsOf(message))
          : SEND;
      case 'op':
        return this.decideOp(message, context.request);
      case 'snapshot-fetch-reply':
        return this.decideSnapshotFetch(message.snapshot, context.request);
      case 'presence':
        return this.decidePresence(message);
      case 'presence-request-relay':
        return toEgress(await this.decideChannel(message.channel), subscriptionsOf(message));
      case 'presence-error':
        // Scripture Forge's server does not forward presence errors to clients, so this is not expected.
        return withhold('presence errors are not sent', []);
    }
  }

  private async decideQueryReply(
    message: Extract<AuthorizableOutboundMessage, { kind: 'query-fetch-reply' | 'query-subscribe-reply' }>,
    query: MatchedQuery | null
  ): Promise<EgressDecision> {
    const end: SubscriptionRef[] = subscriptionsOf(message);
    if (query == null) {
      return withhold('the query is not known', end);
    }
    if (message.hasExtra && !query.extraIsSafe) {
      return withhold('the query result count may reveal docs', end);
    }
    let snapshots: [string, OutboundSnapshot][];
    if (message.kind === 'query-fetch-reply') {
      snapshots = message.results.map((result: ResultSnapshot): [string, OutboundSnapshot] => [result.docId, result]);
    } else if (message.data.form === 'results') {
      snapshots = message.data.results.map((result: ResultSnapshot): [string, OutboundSnapshot] => [
        result.docId,
        result
      ]);
    } else if (message.data.form === 'snapshot-map') {
      snapshots = snapshotsOfMap(message.data.snapshots);
    } else {
      snapshots = [];
    }
    const refused: ReadonlyMap<string, string> = await this.decideSnapshots(query.collection, snapshots);
    return refused.size === 0 ? SEND : withhold(firstReason(refused), end);
  }

  // Ops

  private async decideOp(message: OpMessage, request: InboundMessage | null): Promise<EgressDecision> {
    const end: SubscriptionRef[] = subscriptionsOf(message);
    const policy: CollectionPolicy | undefined = SF_COLLECTION_POLICIES.get(message.collection);
    if (policy == null) {
      return withhold('no policy for the collection', end);
    }
    if (message.content.kind === 'none' && request != null) {
      if (request.kind === 'edit-op' || request.kind === 'create-op') {
        // The ack of the client's own op, which ShareDB does not push back to it.
        this.noteOwnOp(policy, message, request);
        return SEND;
      }
      return withhold('an op answers a request that is not an op', end);
    }
    switch (message.content.kind) {
      case 'create': {
        // The doc did not exist before this op, so what it reveals is the doc as created.
        const created: unknown = message.content.data;
        const decided: Decided = await this.decideWith((context: SFAccessContext) =>
          policy.read(message.docId, created, context)
        );
        this.grants.set(
          message.collection,
          message.docId,
          toGrantDecision(decided.decision),
          message.version + 1,
          decided.epochs,
          pickFields(created, policy.readDependsOn)
        );
        return toEgress(decided.decision, end);
      }
      case 'delete': {
        // A delete carries nothing of the doc. A connection that was allowed to read the doc gets it even when the
        // decision no longer holds, such as when the user was removed from the project or the project was deleted
        // (which deletes the user's docs in it): the client then drops the doc. Others get it if they may read now.
        const decision: PolicyDecision = this.grants.wasReadable(message.collection, message.docId)
          ? ALLOWED_DECISION
          : await this.mayReadAt(policy, message.collection, message.docId, message.version);
        // Whatever comes next starts a new doc, which is decided when it is created.
        this.grants.forgetDeleted(message.collection, message.docId);
        return toEgress(decision, end);
      }
      case 'edit':
      case 'none':
        return this.decideEdit(policy, message, end);
    }
  }

  /**
   * An edit (or no-op) pushed to the client. An op is an op of the doc as it was before it, so a decision that holds at
   * the op's version decides it, without reading the database; without one, the doc as it was before the op is read
   * and decided on (see decideBeforeOp). That way an op that takes away the user's access still reaches them: the
   * client relies on seeing the op that removes a user from a project. If the op changes a field the decision depends
   * on, the decision is made again on the fields as the op leaves them; when the user may not read the doc after the
   * op, the op is sent only if it changes nothing but those fields, so that it carries nothing of the doc the user may
   * not see.
   */
  private async decideEdit(
    policy: CollectionPolicy,
    message: OpMessage,
    end: readonly SubscriptionRef[]
  ): Promise<EgressDecision> {
    const op: unknown = message.content.kind === 'edit' ? message.content.op : [];
    const changesRead: boolean = opMayChangeFields(op, policy.readDependsOn);
    let grant: ReadGrant | undefined = this.grants.current(message.collection, message.docId);
    if (grant == null || message.version > grant.version) {
      grant = await this.decideBeforeOp(policy, message, changesRead);
      if (grant == null) {
        // The decision went stale while it was made, such as when the user's membership changed meanwhile.
        return withhold('the doc could not be decided as it was before the op', end);
      }
    }
    const before: PolicyDecision = grant.allowed ? ALLOWED_DECISION : denied(grant.reason);
    if (message.version < grant.version) {
      // An op from before the decision, such as the same op arriving again through a query.
      return toEgress(before, end);
    }
    if (!changesRead) {
      if (before.allowed) {
        this.grants.advance(message.collection, message.docId, message.version);
      }
      return toEgress(before, end);
    }
    const after: PolicyDecision | null = await this.decideAfterOp(policy, message, grant, op);
    if (!before.allowed) {
      return toEgress(before, end);
    }
    if ((after == null || !after.allowed) && !opChangesOnlyFields(op, policy.readDependsOn)) {
      return withhold(after == null ? 'the op could not be decided' : after.reason, end);
    }
    return SEND;
  }

  /**
   * Decides about the doc as it was just before an op, for which no decision holds, and keeps that as the doc's
   * decision at the op's version. The stored doc is decided on when it has the fields reading depends on as they were
   * before the op (see storedHasFieldsBefore); otherwise the doc is rebuilt as it was at the op's version, which is
   * refused when it would replay too many ops. A database error or a refused rebuild rejects.
   */
  private async decideBeforeOp(
    policy: CollectionPolicy,
    message: OpMessage,
    changesRead: boolean
  ): Promise<ReadGrant | undefined> {
    let before: StoredSnapshot = await this.services.data.getSnapshot(
      policy.storedIn,
      message.docId,
      policy.readDependsOn
    );
    if (!(await this.storedHasFieldsBefore(policy, message, before, changesRead))) {
      before = await this.services.data.getSnapshotAtVersion(policy.storedIn, message.docId, message.version);
    }
    const recorder: EpochRecordingProjectSource = this.newRecorder();
    const decision: PolicyDecision = await decideRead(policy, message.docId, before, {
      ...this.context,
      projects: recorder
    });
    this.grants.set(
      message.collection,
      message.docId,
      toGrantDecision(decision),
      message.version,
      recorder.epochs,
      before.type == null ? null : pickFields(before.data, policy.readDependsOn)
    );
    return this.grants.current(message.collection, message.docId);
  }

  /**
   * Whether the stored doc has the fields its reading depends on as they were just before the op: when reading depends
   * on no field, or when neither the op nor any op stored after it may change those fields or create or delete the doc.
   * The ops after it are read only when there are some; that rejects when there are too many.
   */
  private async storedHasFieldsBefore(
    policy: CollectionPolicy,
    message: OpMessage,
    stored: StoredSnapshot,
    changesRead: boolean
  ): Promise<boolean> {
    if (policy.readDependsOn.length === 0) {
      return true;
    }
    if (changesRead || stored.type == null || stored.version <= message.version) {
      return false;
    }
    if (stored.version === message.version + 1) {
      return true;
    }
    const later: readonly StoredOp[] = await this.services.data.getOps(
      policy.storedIn,
      message.docId,
      message.version + 1,
      stored.version
    );
    return later.every((op: StoredOp) => op.kind === 'edit' && !opMayChangeFields(op.edit, policy.readDependsOn));
  }

  /**
   * Applies an op to the fields a doc's read decision depends on, decides on the result, and keeps that as the doc's
   * decision at the next version. Null, with the decision forgotten, when the fields are not known or the op does not
   * apply to them.
   */
  private async decideAfterOp(
    policy: CollectionPolicy,
    message: OpMessage,
    grant: ReadGrant,
    op: unknown
  ): Promise<PolicyDecision | null> {
    const fields: Readonly<Record<string, unknown>> | null =
      grant.fields == null ? null : applyToFields(grant.fields, op, policy.readDependsOn);
    if (fields == null) {
      this.grants.forget(message.collection, message.docId);
      return null;
    }
    const decided: Decided = await this.decideWith((context: SFAccessContext) =>
      policy.read(message.docId, fields, context)
    );
    this.grants.set(
      message.collection,
      message.docId,
      toGrantDecision(decided.decision),
      message.version + 1,
      decided.epochs,
      fields
    );
    return decided.decision;
  }

  /** Keeps the doc's read decision in step with an op this connection submitted, which it is never sent. */
  private noteOwnOp(policy: CollectionPolicy, ack: OpMessage, request: InboundMessage): void {
    if (request.kind === 'edit-op' && !editMayChangeFields(request.edit, policy.readDependsOn)) {
      this.grants.advance(ack.collection, ack.docId, ack.version);
    } else {
      this.grants.forget(ack.collection, ack.docId);
    }
  }

  // Snapshots

  /**
   * Decides each revealed snapshot. Returns the refused docs, with the reason for each. A doc whose snapshot is
   * allowed gets a read decision at the snapshot's version, unless a newer one is known.
   */
  private async decideSnapshots(
    collection: string,
    snapshots: readonly (readonly [string, OutboundSnapshot])[]
  ): Promise<ReadonlyMap<string, string>> {
    const refused = new Map<string, string>();
    if (snapshots.length === 0) {
      return refused;
    }
    const policy: CollectionPolicy | undefined = SF_COLLECTION_POLICIES.get(collection);
    if (policy == null) {
      for (const [docId] of snapshots) {
        refused.set(docId, 'no policy for the collection');
      }
      return refused;
    }
    const decideStored: boolean = policy.storedIn !== policy.name && policy.readDependsOn.length > 0;
    const stored: { docId: string; version: number }[] = [];
    for (const [docId, snapshot] of snapshots) {
      if (decideStored && snapshot.exists) {
        stored.push({ docId: docId, version: snapshot.version });
        continue;
      }
      const decided: Decided = await this.decideWith((context: SFAccessContext) =>
        snapshot.exists ? policy.read(docId, snapshot.data, context) : policy.readById(docId, context)
      );
      if (!decided.decision.allowed) {
        refused.set(docId, decided.decision.reason);
      } else if (snapshot.exists) {
        const known: ReadGrant | undefined = this.grants.current(collection, docId);
        if (known == null || known.version <= snapshot.version) {
          this.grants.set(
            collection,
            docId,
            toGrantDecision(decided.decision),
            snapshot.version,
            decided.epochs,
            pickFields(snapshot.data, policy.readDependsOn)
          );
        }
      }
    }
    for (const [docId, decision] of await this.mayReadManyAt(policy, collection, stored)) {
      if (!decision.allowed) {
        refused.set(docId, decision.reason);
      }
    }
    return refused;
  }

  /** `nf`: the past snapshot it reveals, and the doc as stored now, must both be readable. */
  private async decideSnapshotFetch(
    snapshot: OutboundSnapshot,
    request: InboundMessage | null
  ): Promise<EgressDecision> {
    if (request == null || request.kind !== 'snapshot-fetch') {
      return withhold('a past snapshot answers no request for one', []);
    }
    const policy: CollectionPolicy | undefined = SF_COLLECTION_POLICIES.get(request.collection);
    if (policy == null || policy.storedIn !== policy.name) {
      return withhold('past snapshots of the collection are not sent', []);
    }
    const past: Decided = await this.decideWith((context: SFAccessContext) =>
      snapshot.exists ? policy.read(request.docId, snapshot.data, context) : policy.readById(request.docId, context)
    );
    if (!past.decision.allowed) {
      return withhold(past.decision.reason, []);
    }
    // Past snapshots are rare, so the doc is always read again rather than trusting a cached decision.
    this.grants.forget(request.collection, request.docId);
    return toEgress(await this.mayReadAt(policy, request.collection, request.docId, null), []);
  }

  // Presence

  private async decidePresence(message: PresenceMessage): Promise<EgressDecision> {
    const end: SubscriptionRef[] = subscriptionsOf(message);
    const channel: PresenceChannel | undefined = parsePresenceChannel(message.channel, SF_GATEWAY_PROTOCOL);
    if (channel == null) {
      return withhold('not a presence channel', end);
    }
    if (
      message.doc != null &&
      (channel.form !== 'doc' || message.doc.collection !== channel.collection || message.doc.docId !== channel.docId)
    ) {
      return withhold('the presence names another doc than its channel', end);
    }
    return toEgress(await this.decideChannelRead(channel), end);
  }

  private async decideChannel(channelName: string): Promise<PolicyDecision> {
    const channel: PresenceChannel | undefined = parsePresenceChannel(channelName, SF_GATEWAY_PROTOCOL);
    return channel == null ? denied('not a presence channel') : this.decideChannelRead(channel);
  }

  /**
   * Whether the doc a presence channel names may be read. Presence carries no version of the doc, so any current
   * decision is used. That is exact for texts, the only collection with presence, whose read does not depend on the
   * doc's data.
   */
  private async decideChannelRead(channel: PresenceChannel): Promise<PolicyDecision> {
    const policy: CollectionPolicy | undefined = SF_COLLECTION_POLICIES.get(channel.collection);
    if (policy == null) {
      return denied('no policy for the collection');
    }
    return this.mayReadAt(policy, channel.collection, channel.docId, null);
  }

  // Read decisions

  /**
   * Whether the doc may be read, from its current decision if that holds at `version` (any current decision when
   * `version` is null), and otherwise from the doc as stored now. A database error rejects.
   */
  private async mayReadAt(
    policy: CollectionPolicy,
    collection: string,
    docId: string,
    version: number | null
  ): Promise<PolicyDecision> {
    const decisions: ReadonlyMap<string, PolicyDecision> = await this.mayReadManyAt(policy, collection, [
      { docId: docId, version: version }
    ]);
    return decisions.get(docId) ?? denied('the doc could not be decided');
  }

  /** mayReadAt for many docs, reading the stored docs that need it in one go. */
  private async mayReadManyAt(
    policy: CollectionPolicy,
    collection: string,
    requests: readonly { readonly docId: string; readonly version: number | null }[]
  ): Promise<ReadonlyMap<string, PolicyDecision>> {
    const decisions = new Map<string, PolicyDecision>();
    const recorders = new Map<string, EpochRecordingProjectSource>();
    for (const { docId, version } of requests) {
      const grant: ReadGrant | undefined = this.grants.current(collection, docId);
      if (grant != null && (version == null || version <= grant.version)) {
        decisions.set(docId, grant.allowed ? ALLOWED_DECISION : denied(grant.reason));
      } else if (!recorders.has(docId)) {
        recorders.set(docId, this.newRecorder());
      }
    }
    if (recorders.size === 0) {
      return decisions;
    }
    const snapshots: ReadonlyMap<string, StoredSnapshot> = await this.services.data.getSnapshots(
      policy.storedIn,
      Array.from(recorders.keys()),
      policy.readDependsOn
    );
    for (const [docId, recorder] of recorders) {
      const snapshot: StoredSnapshot | undefined = snapshots.get(docId);
      if (snapshot == null) {
        decisions.set(docId, denied('the doc could not be read'));
        continue;
      }
      const decision: PolicyDecision = await decideRead(policy, docId, snapshot, {
        ...this.context,
        projects: recorder
      });
      this.grants.set(
        collection,
        docId,
        toGrantDecision(decision),
        snapshot.version,
        recorder.epochs,
        snapshot.type == null ? null : pickFields(snapshot.data, policy.readDependsOn)
      );
      decisions.set(docId, decision);
    }
    return decisions;
  }

  /** Makes a decision with a context that records the epochs of the projects it reads. */
  private async decideWith(decide: (context: SFAccessContext) => Promise<PolicyDecision>): Promise<Decided> {
    const recorder: EpochRecordingProjectSource = this.newRecorder();
    const decision: PolicyDecision = await decide({ ...this.context, projects: recorder });
    return { decision: decision, epochs: recorder.epochs };
  }

  /**
   * A recorder for deciding about a doc. Only the projects the decision reads are recorded: a project doc, which
   * decides about itself from its own data, is kept current by its own ops (see `readDependsOn`), and must not be
   * made stale by the very op that removes the user, which the user still has to receive.
   */
  private newRecorder(): EpochRecordingProjectSource {
    return new EpochRecordingProjectSource(this.services.projects);
  }
}

/** A policy decision with the epochs of the projects it was made with. */
interface Decided {
  readonly decision: PolicyDecision;
  readonly epochs: ReadonlyMap<string, number>;
}

const SEND: EgressDecision = { kind: 'send' };
const ALLOWED_DECISION: PolicyDecision = { allowed: true };

function withhold(reason: string, end: readonly SubscriptionRef[]): EgressDecision {
  return { kind: 'withhold', reason: reason, end: end };
}

function toEgress(decision: PolicyDecision, end: readonly SubscriptionRef[]): EgressDecision {
  return decision.allowed ? SEND : withhold(decision.reason, end);
}

function toGrantDecision(decision: PolicyDecision): { allowed: boolean; reason: string } {
  return decision.allowed ? { allowed: true, reason: '' } : { allowed: false, reason: decision.reason };
}

function docSubscription(collection: string, docId: string): SubscriptionRef {
  return { kind: 'doc', collection: collection, docId: docId };
}

function firstReason(refused: ReadonlyMap<string, string>): string {
  return refused.values().next().value ?? 'withheld';
}

/** The snapshots in a snapshot map. Entries that are errors reveal no doc. */
function snapshotsOfMap(map: ReadonlyMap<string, SnapshotMapEntry>): [string, OutboundSnapshot][] {
  const snapshots: [string, OutboundSnapshot][] = [];
  for (const [docId, entry] of map) {
    if (entry.kind === 'snapshot') {
      snapshots.push([docId, entry.snapshot]);
    }
  }
  return snapshots;
}

/**
 * Whether a pushed op's content may change one of the top-level `fields` of a json0 doc: a component whose path
 * starts at one of them or replaces the whole doc. Anything that does not have the form of json0 components may.
 */
function opMayChangeFields(op: unknown, fields: readonly string[]): boolean {
  if (fields.length === 0) {
    return false;
  }
  if (!Array.isArray(op)) {
    return true;
  }
  return op.some((component: unknown): boolean => {
    const path: unknown = hasOwnProp(component, 'p') ? component.p : undefined;
    return !Array.isArray(path) || pathMayChangeFields(path, fields);
  });
}

/** opMayChangeFields for an edit the client submitted, which the gateway has already decoded. */
function editMayChangeFields(
  edit: Extract<InboundMessage, { kind: 'edit-op' }>['edit'],
  fields: readonly string[]
): boolean {
  if (fields.length === 0) {
    return false;
  }
  if (edit.otType !== 'json0') {
    return true;
  }
  return edit.components.some((component: Json0Component) => pathMayChangeFields(component.path, fields));
}

function pathMayChangeFields(path: readonly unknown[], fields: readonly string[]): boolean {
  if (path.length === 0) {
    return true;
  }
  const field: unknown = path[0];
  return typeof field !== 'string' || fields.includes(field);
}

/**
 * The top-level `fields` after a json0 op: the op's components on those fields (or on the whole doc) applied to a
 * copy of them. Null when the op is not json0 components or does not apply.
 */
function applyToFields(
  before: Readonly<Record<string, unknown>>,
  op: unknown,
  fields: readonly string[]
): Readonly<Record<string, unknown>> | null {
  if (!Array.isArray(op)) {
    return null;
  }
  const components: unknown[] = op.filter((component: unknown): boolean => {
    const path: unknown = hasOwnProp(component, 'p') ? component.p : undefined;
    return !Array.isArray(path) || pathMayChangeFields(path, fields);
  });
  const json0: unknown = ShareDB.types.map[JSON0_TYPE_URI];
  const apply: unknown = hasOwnProp(json0, 'apply') ? json0.apply : undefined;
  if (typeof apply !== 'function') {
    return null;
  }
  try {
    const after: unknown = apply.call(json0, jsonCopy(before), jsonCopy(components));
    return pickFields(after, fields);
  } catch {
    return null;
  }
}

/** Whether every component of a json0 op is on one of the top-level `fields` (and none replaces the whole doc). */
function opChangesOnlyFields(op: unknown, fields: readonly string[]): boolean {
  if (!Array.isArray(op)) {
    return false;
  }
  return op.every((component: unknown): boolean => {
    const path: unknown = hasOwnProp(component, 'p') ? component.p : undefined;
    return Array.isArray(path) && path.length > 0 && typeof path[0] === 'string' && fields.includes(path[0]);
  });
}

function jsonCopy(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
