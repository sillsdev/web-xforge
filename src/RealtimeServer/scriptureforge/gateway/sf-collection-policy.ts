import { StoredSnapshot } from '../../common/gateway/gateway-data-source';
import { OpEdit } from '../../common/gateway/inbound-messages';
import { JsonObject } from '../../common/gateway/json';
import { SFAccessContext } from './sf-access-context';

/**
 * The access policy of one collection or projection the Scripture Forge client addresses. The gateway's inbound
 * authorizer, write hook and query registry decide with these, and so can the egress authorizer: everything that
 * reveals a doc must pass `read` (or `readById` for a doc that does not exist).
 *
 * Every method fails closed: what it cannot decide, it refuses. Clients never delete docs, so there is no delete
 * policy; the write hook refuses every client delete.
 */
export interface CollectionPolicy {
  /** The collection or projection name clients address. */
  readonly name: string;
  /** The collection the docs are stored in: `name` itself, or the collection behind a projection. */
  readonly storedIn: string;
  /**
   * The top-level fields of a doc that `read` looks at. An op that changes one of these (or replaces the whole doc,
   * or creates or deletes it) can change whether the doc may be read, so a cached read decision must then be made
   * again. Changes to project membership and rights are signalled separately, by the project's read epoch in
   * ProjectAccessCache.
   */
  readonly readDependsOn: readonly string[];
  /** Whether the session may read whatever doc would be at this id, when no doc is there (never was, or deleted). */
  readById(docId: string, context: SFAccessContext): Promise<PolicyDecision>;
  /** Whether the session may read this existing doc, whose stored data is `data`. */
  read(docId: string, data: unknown, context: SFAccessContext): Promise<PolicyDecision>;
  /**
   * Whether the session may submit edits to the doc at all, decided from the id. The write hook decides each edit
   * against the doc (see `edit`); this lets the inbound authorizer refuse early what can never be allowed.
   */
  mayEdit(docId: string, context: SFAccessContext): Promise<PolicyDecision>;
  /** Whether the session may create the doc with this data. */
  create(docId: string, data: JsonObject, context: SFAccessContext): Promise<PolicyDecision>;
  /**
   * Whether the session may apply `edit` to the doc whose data, at the version the edit applies to, is `data`. The
   * edit is the op as ShareDB transformed it to that version, and may be empty (the write hook then also asks
   * `mayEdit`), so this must check the doc itself, such as whether the user may read it, and not only the edit's parts.
   */
  edit(docId: string, data: unknown, edit: OpEdit, context: SFAccessContext): Promise<PolicyDecision>;
}

/** The outcome of a policy check. A refusal says why, for the log and the error reply. */
export type PolicyDecision = { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

export const ALLOWED: PolicyDecision = { allowed: true };

export function denied(reason: string): PolicyDecision {
  return { allowed: false, reason: reason };
}

/** Whether the session may read what is stored at an id: the doc if there is one, otherwise by its id. */
export function decideRead(
  policy: CollectionPolicy,
  docId: string,
  snapshot: StoredSnapshot,
  context: SFAccessContext
): Promise<PolicyDecision> {
  return snapshot.type == null ? policy.readById(docId, context) : policy.read(docId, snapshot.data, context);
}

/** The first refusal among the decisions, or ALLOWED when there is none. */
export function allOf(...decisions: PolicyDecision[]): PolicyDecision {
  return decisions.find((decision: PolicyDecision) => !decision.allowed) ?? ALLOWED;
}
