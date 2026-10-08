import {
  GatewaySession,
  InboundAuthorizationSubject,
  InboundAuthorizer,
  InboundDecision
} from '../../common/gateway/authorization';
import { GatewayDataSource, StoredOp, StoredSnapshot } from '../../common/gateway/gateway-data-source';
import {
  BulkDocs,
  ChannelPresenceUpdate,
  PresenceChannel,
  QueryKnownResult,
  ViewerPresence
} from '../../common/gateway/inbound-messages';
import { AuthType, getAuthType } from '../../common/models/user';
import { hasOwnProp } from '../../common/utils/type-utils';
import { PresenceBindingOwner, PresenceBindingResult, PresenceIdBindings } from './presence-bindings';
import { EpochRecordingProjectSource, ProjectAccessCache } from './project-access';
import { pickFields, ReadGrant, ReadGrants } from './read-grants';
import { ALLOWED, CollectionPolicy, decideRead, denied, PolicyDecision } from './sf-collection-policy';
import { SF_COLLECTION_POLICIES } from './sf-collection-policies';
import { SFAccessContext } from './sf-access-context';
import { UserPresenceProfile, UserProfileCache } from './user-profile-cache';

/** The process-wide state Scripture Forge's gateway policies share between connections. */
export interface SFGatewayServices {
  readonly projects: ProjectAccessCache;
  readonly profiles: UserProfileCache;
  readonly data: GatewayDataSource;
  readonly presenceIds: PresenceIdBindings;
}

/**
 * How many presence ids one connection may bind. The client makes one per text view, and a page shows a few at most;
 * a long session can open more over time.
 */
const MAX_PRESENCE_IDS_PER_CONNECTION = 1000;

/** How many docs are read from the database in one go when a request names many. */
const READ_BATCH_SIZE = 1000;

/**
 * Decides which of one connection's requests reach ShareDB, with the collection policies (SF_COLLECTION_POLICIES).
 * Every doc a request names must be readable by the session: as it is now, and, for a request with a version, also
 * without having been created or deleted since that version, because ShareDB then sends the ops since the version and
 * those would span a doc the user saw before it was deleted or re-created. An op needs the right to change the doc
 * (the write hook decides each op in detail). Presence is only for texts the user may read, and a viewer's name and
 * avatar are taken from their own user doc.
 *
 * The reply to a request with a version carries no snapshot, so the read decision made for it here is kept in the
 * connection's ReadGrants, which it shares with the egress authorizer: the ops that follow are then decided as of the
 * doc the decision was made on.
 *
 * Anything that cannot be decided is refused, including when the database cannot be read.
 */
export class SFInboundAuthorizer implements InboundAuthorizer {
  private readonly context: SFAccessContext;
  /** The presence id bindings this connection holds (see PresenceIdBindings). */
  private readonly presenceIdOwner: PresenceBindingOwner;

  constructor(
    session: GatewaySession,
    private readonly services: SFGatewayServices,
    private readonly grants: ReadGrants
  ) {
    this.context = { session: session, projects: services.projects, profiles: services.profiles, data: services.data };
    this.presenceIdOwner = new PresenceBindingOwner(session.userId);
  }

  connectionClosed(): void {
    this.services.presenceIds.release(this.presenceIdOwner);
  }

  async authorize(subject: InboundAuthorizationSubject): Promise<InboundDecision> {
    try {
      return await this.decide(subject);
    } catch {
      return refused('the request could not be checked');
    }
  }

  private async decide(subject: InboundAuthorizationSubject): Promise<InboundDecision> {
    if (subject.kind === 'query') {
      const message = subject.message;
      if (message.kind === 'query-fetch' || message.knownResults == null) {
        return { kind: 'authorized' };
      }
      return this.decideKnownResults(message.collection, message.knownResults);
    }
    const message = subject.message;
    switch (message.kind) {
      case 'fetch':
      case 'subscribe':
        return toInbound(await this.decideDocRead(message.collection, message.docId, message.version));
      case 'bulk-fetch':
      case 'bulk-subscribe':
        return this.decideBulk(message.collection, message.docs);
      case 'edit-op': {
        const policy: CollectionPolicy | undefined = SF_COLLECTION_POLICIES.get(message.collection);
        if (policy == null) {
          return refused('no policy for the collection');
        }
        return toInbound(await policy.mayEdit(message.docId, this.context));
      }
      case 'create-op': {
        const policy: CollectionPolicy | undefined = SF_COLLECTION_POLICIES.get(message.collection);
        if (policy == null) {
          return refused('no policy for the collection');
        }
        return toInbound(await policy.create(message.docId, message.data, this.context));
      }
      case 'snapshot-fetch':
        return toInbound(await this.decideSnapshotFetch(message.collection, message.docId, message.version));
      case 'presence-subscribe':
      case 'presence-request':
        return toInbound(await this.decideChannelRead(message.channel));
      case 'doc-presence': {
        if (message.range == null && this.isOwnPresenceId(message.presenceId, subject.src)) {
          return { kind: 'authorized' };
        }
        const read: PolicyDecision = await this.decideChannelRead(message.channel);
        if (!read.allowed) {
          return toInbound(read);
        }
        return toInbound(this.bindPresenceId(message.presenceId, subject.src));
      }
      case 'channel-presence':
        return this.decideChannelPresence(message, subject.src);
    }
  }

  /** Whether the session may read a doc, and for a request with a version, the ops since it. */
  private async decideDocRead(collection: string, docId: string, version: number | null): Promise<ReadDecision> {
    const policy: CollectionPolicy | undefined = SF_COLLECTION_POLICIES.get(collection);
    if (policy == null) {
      return denied('no policy for the collection');
    }
    const snapshot: StoredSnapshot = await this.services.data.getSnapshot(policy.storedIn, docId, policy.readDependsOn);
    return this.decideStoredRead(policy, docId, snapshot, version);
  }

  /**
   * Whether the session may read what is stored at an id now, and for a request with a version, the ops since it.
   * Those ops may span more than the doc as it is now, if it was deleted or created since the version. Then they are
   * allowed only if the session may read any doc at that id (`readById`), which covers every doc that was ever there.
   *
   * A refusal where no doc is stored is silent (see RefusalReply). The client library resubscribes to the docs it holds
   * after every reconnect, and the app checks separately whether they still exist; it also asks for docs that are not
   * there yet, such as a note thread whose create op is still on its way. Before the gateway, these requests got an
   * empty snapshot. So does a refusal because the doc was created or deleted since the version, which also says that
   * the doc may be read now (`readableNow`). A refusal of a doc that is stored is an error, as the server's own rules
   * make it.
   *
   * An allowed request with a version is recorded as the doc's read decision at the stored version (see the class
   * comment).
   */
  private async decideStoredRead(
    policy: CollectionPolicy,
    docId: string,
    snapshot: StoredSnapshot,
    version: number | null
  ): Promise<ReadDecision> {
    const recorder = new EpochRecordingProjectSource(this.services.projects);
    const read: PolicyDecision = await decideRead(policy, docId, snapshot, { ...this.context, projects: recorder });
    if (!read.allowed) {
      return snapshot.type == null ? { ...read, silent: true } : read;
    }
    if (version == null) {
      return read;
    }
    if (await this.lifecycleOpsSince(policy, docId, snapshot, version)) {
      // readById was already the read decision for a doc that is gone.
      const anyDocAtId: PolicyDecision = snapshot.type == null ? read : await policy.readById(docId, this.context);
      if (!anyDocAtId.allowed) {
        return {
          allowed: false,
          reason: 'the doc was created or deleted since that version',
          silent: true,
          readableNow: true
        };
      }
    }
    this.recordGrant(policy, docId, snapshot, recorder.epochs);
    return read;
  }

  /** Records that the session may read the stored doc, unless a decision at a later version is already known. */
  private recordGrant(
    policy: CollectionPolicy,
    docId: string,
    snapshot: StoredSnapshot,
    epochs: ReadonlyMap<string, number>
  ): void {
    if (snapshot.type == null) {
      // There is no doc yet; its create op is decided on the data it creates.
      return;
    }
    const known: ReadGrant | undefined = this.grants.current(policy.name, docId);
    if (known == null || known.version <= snapshot.version) {
      this.grants.set(
        policy.name,
        docId,
        { allowed: true, reason: '' },
        snapshot.version,
        epochs,
        pickFields(snapshot.data, policy.readDependsOn)
      );
    }
  }

  /**
   * Whether a create or delete lies among the ops from `version` to now, other than a create at exactly `version`
   * (where the client's copy is "no doc", so the ops are the current doc's whole history). The doc's metadata says
   * when it was created; the stored ops are read only when it does not.
   */
  private async lifecycleOpsSince(
    policy: CollectionPolicy,
    docId: string,
    snapshot: StoredSnapshot,
    version: number
  ): Promise<boolean> {
    if (version >= snapshot.version) {
      // No ops lie between the version and now.
      return false;
    }
    if (snapshot.type == null) {
      // The doc was deleted after the version: the last op since then is that delete.
      return true;
    }
    if (snapshot.createdAtVersion != null) {
      // The create op of the doc as it is now has version createdAtVersion. Any delete since the version would have
      // been followed by a later create.
      return snapshot.createdAtVersion > version;
    }
    const ops: readonly StoredOp[] = await this.services.data.getOps(policy.storedIn, docId, version, null);
    return ops.some((op: StoredOp, index: number) => op.kind === 'delete' || (op.kind === 'create' && index > 0));
  }

  private async decideBulk(collection: string, docs: BulkDocs): Promise<InboundDecision> {
    const requests: { docId: string; version: number | null }[] =
      docs.form === 'ids'
        ? docs.ids.map((docId: string) => ({ docId: docId, version: null }))
        : Array.from(docs.versions, ([docId, version]: [string, number]) => ({ docId: docId, version: version }));
    const decided: ManyDecided | InboundDecision = await this.decideMany(collection, requests);
    if (!isManyDecided(decided)) {
      return decided;
    }
    return decided.refusedDocs.size === 0
      ? { kind: 'authorized' }
      : {
          kind: 'partially-authorized',
          refusedDocs: decided.refusedDocs,
          silentlyRefusedDocs: decided.silentlyRefusedDocs
        };
  }

  /**
   * The known results (`r`) of a query subscribe. A null version asks ShareDB to fetch the doc, and a number asks for
   * the ops since that version: either way, the client names the doc, so it must be readable whether or not the query
   * would return it.
   *
   * A refused doc is not left out: ShareDB works out the query's first diff from the ids in `r`, and the client applies
   * diffs by index into the results it holds, so leaving one out would put every later diff in the wrong place, and the
   * client would never be told to remove the doc. A refused doc is forwarded with its current version instead, so
   * that ShareDB sends neither its snapshot nor any op, and sends a remove when the query does not return it. A doc
   * that may be read now, but not across the create or delete since the client's version, is forwarded with no version,
   * so that ShareDB sends the doc as it is now.
   */
  private async decideKnownResults(
    collection: string,
    knownResults: readonly QueryKnownResult[]
  ): Promise<InboundDecision> {
    const decided: ManyDecided | InboundDecision = await this.decideMany(
      collection,
      knownResults.map((result: QueryKnownResult) => ({ docId: result.docId, version: result.version }))
    );
    if (!isManyDecided(decided)) {
      return decided;
    }
    return decided.refusedDocs.size === 0
      ? { kind: 'authorized' }
      : {
          kind: 'partially-authorized',
          refusedDocs: decided.refusedDocs,
          knownResultVersions: decided.forwardVersions
        };
  }

  /**
   * Decides each of many docs. For each refused doc, the result says why, and the version to forward the doc with in
   * place of the client's when it cannot be left out (see decideKnownResults).
   */
  private async decideMany(
    collection: string,
    requests: readonly { readonly docId: string; readonly version: number | null }[]
  ): Promise<ManyDecided | InboundDecision> {
    const refusedDocs = new Map<string, string>();
    const silentlyRefusedDocs = new Set<string>();
    const forwardVersions = new Map<string, number | null>();
    if (requests.length === 0) {
      return { refusedDocs: refusedDocs, silentlyRefusedDocs: silentlyRefusedDocs, forwardVersions: forwardVersions };
    }
    const policy: CollectionPolicy | undefined = SF_COLLECTION_POLICIES.get(collection);
    if (policy == null) {
      return refused('no policy for the collection');
    }
    for (let start = 0; start < requests.length; start += READ_BATCH_SIZE) {
      const batch: readonly { readonly docId: string; readonly version: number | null }[] = requests.slice(
        start,
        start + READ_BATCH_SIZE
      );
      const docIds: string[] = Array.from(new Set(batch.map(request => request.docId)));
      const snapshots: ReadonlyMap<string, StoredSnapshot> = await this.services.data.getSnapshots(
        policy.storedIn,
        docIds,
        policy.readDependsOn
      );
      for (const request of batch) {
        const snapshot: StoredSnapshot | undefined = snapshots.get(request.docId);
        if (snapshot == null) {
          // Without the stored doc, there is no version to forward it with either.
          refusedDocs.set(request.docId, 'the doc could not be read');
          continue;
        }
        const decision: ReadDecision = await this.decideStoredRead(policy, request.docId, snapshot, request.version);
        if (!decision.allowed) {
          refusedDocs.set(request.docId, decision.reason);
          if (isSilent(decision)) {
            silentlyRefusedDocs.add(request.docId);
          }
          forwardVersions.set(request.docId, isReadableNow(decision) ? null : snapshot.version);
        }
      }
    }
    return { refusedDocs: refusedDocs, silentlyRefusedDocs: silentlyRefusedDocs, forwardVersions: forwardVersions };
  }

  /**
   * `nf`, a doc as it was at a past version: the user must be allowed to read it both as it was then and as it is now,
   * so that losing access to a doc also loses access to its past.
   */
  private async decideSnapshotFetch(collection: string, docId: string, version: number): Promise<PolicyDecision> {
    const policy: CollectionPolicy | undefined = SF_COLLECTION_POLICIES.get(collection);
    if (policy == null) {
      return denied('no policy for the collection');
    }
    const now: PolicyDecision = await this.decideDocRead(collection, docId, null);
    if (!now.allowed) {
      return now;
    }
    let past: StoredSnapshot;
    try {
      past = await this.services.data.getSnapshotAtVersion(policy.storedIn, docId, version);
    } catch {
      return denied('the doc has no such version');
    }
    return decideRead(policy, docId, past, this.context);
  }

  /**
   * Whether the session may read the doc a presence channel is for. The client sends presence with every edit and
   * caret move, so where reading does not depend on the doc's data (as for texts, the only collection with presence),
   * the id decides, without reading the doc.
   */
  private decideChannelRead(channel: PresenceChannel): Promise<PolicyDecision> {
    const policy: CollectionPolicy | undefined = SF_COLLECTION_POLICIES.get(channel.collection);
    if (policy != null && policy.readDependsOn.length === 0 && policy.storedIn === policy.name) {
      return policy.readById(channel.docId, this.context);
    }
    return this.decideDocRead(channel.collection, channel.docId, null);
  }

  /**
   * Whether the presence id is already bound to this connection's src. Such a connection may always clear its presence
   * under that id, even after it lost access to the text: clearing removes what it sent before and reveals nothing,
   * and without it the other viewers would keep showing its cursor and name.
   */
  private isOwnPresenceId(presenceId: string, src: string): boolean {
    return this.services.presenceIds.isBoundTo(presenceId, src);
  }

  /**
   * Binds the presence id to the connection's src, held by this connection (see PresenceIdBindings), or takes over a
   * binding of the same src from an earlier connection. One connection may hold only so many ids, so that it cannot
   * fill the table.
   */
  private bindPresenceId(presenceId: string, src: string): PolicyDecision {
    const bindings: PresenceIdBindings = this.services.presenceIds;
    if (!this.presenceIdOwner.ids.has(presenceId) && this.presenceIdOwner.ids.size >= MAX_PRESENCE_IDS_PER_CONNECTION) {
      return denied('the connection has used too many presence ids');
    }
    const result: PresenceBindingResult = bindings.bind(presenceId, src, this.presenceIdOwner);
    switch (result) {
      case 'taken':
        return denied('the presence id belongs to another connection');
      case 'full':
        return denied('no more presence ids can be bound');
      case 'bound':
      case 'already-bound':
        return ALLOWED;
    }
  }

  /**
   * A viewer's presence on a text. The name and avatar the client sends come from the user's own doc
   * (TextComponent.submitLocalPresenceChannel), so they are rebuilt from there; the cursor color and whether the
   * viewer is in the editor are the client's own and are kept.
   */
  private async decideChannelPresence(message: ChannelPresenceUpdate, src: string): Promise<InboundDecision> {
    if (message.viewer == null && this.isOwnPresenceId(message.presenceId, src)) {
      return { kind: 'authorized' };
    }
    const read: PolicyDecision = await this.decideChannelRead(message.channel);
    if (!read.allowed) {
      return toInbound(read);
    }
    const bound: PolicyDecision = this.bindPresenceId(message.presenceId, src);
    if (!bound.allowed || message.viewer == null) {
      return toInbound(bound);
    }
    const profile: UserPresenceProfile | null = await this.services.profiles.get(this.context.session.userId);
    if (profile == null) {
      return refused('the user has no user doc');
    }
    const viewer: ViewerPresence = {
      // Never the client's own value. When the user has no display name, the client sends a translated "Anonymous",
      // which is not known here; an empty name is sent instead.
      displayName: profile.displayName,
      // As the client does, the avatar is left out when the kind of account the user signs in with is not known.
      avatarUrl: getAuthType(profile.authId) === AuthType.Unknown ? '' : profile.avatarUrl,
      cursorColor: message.viewer.cursorColor,
      activeInEditor: message.viewer.activeInEditor
    };
    return { kind: 'authorized-with-viewer', viewer: viewer };
  }
}

function refused(reason: string): InboundDecision {
  return { kind: 'refused', reason: reason };
}

function toInbound(decision: ReadDecision): InboundDecision {
  if (decision.allowed) {
    return { kind: 'authorized' };
  }
  return {
    kind: 'refused',
    reason: decision.reason,
    reply: isSilent(decision) ? 'silent-read-rejection' : 'error'
  };
}

function isSilent(decision: ReadDecision): boolean {
  return hasOwnProp(decision, 'silent') && decision.silent === true;
}

function isReadableNow(decision: ReadDecision): boolean {
  return hasOwnProp(decision, 'readableNow') && decision.readableNow === true;
}

/**
 * A policy decision about reading, which may ask for its refusal to be silent (see RefusalReply). `readableNow` marks a
 * refusal of the ops since a version only: the doc as it is now may be read.
 */
type ReadDecision =
  | PolicyDecision
  | { readonly allowed: false; readonly reason: string; readonly silent: true; readonly readableNow?: true };

/** The outcome of decideMany when it could decide each doc. */
interface ManyDecided {
  readonly refusedDocs: ReadonlyMap<string, string>;
  readonly silentlyRefusedDocs: ReadonlySet<string>;
  /** For each refused doc, its current version, or null when the doc as it is now may be read. */
  readonly forwardVersions: ReadonlyMap<string, number | null>;
}

function isManyDecided(decided: ManyDecided | InboundDecision): decided is ManyDecided {
  return hasOwnProp(decided, 'forwardVersions');
}
