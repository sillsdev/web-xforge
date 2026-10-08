import { hasOwnProp, isPlainObject } from '../../common/utils/type-utils';
import { epochsAreCurrent, ProjectAccessCache } from './project-access';

/**
 * One connection's cached read decisions, one per doc, so that the egress authorizer can decide most messages (above
 * all the stream of ops while someone types) without reading the database.
 *
 * A decision stops being used when any project it was decided with has moved to a new epoch in ProjectAccessCache
 * (membership or permissions may have changed), or, if it read a project, when it expires, in case such a change was
 * missed. The egress authorizer also decides again after an op that changes a field the decision depends on, and when
 * an op shows that the doc changed in ways the connection did not see.
 */

/** How long a read decision is used before the doc is read and decided again. */
export const READ_GRANT_TTL_MS = 60_000;
/** The most docs one connection keeps decisions for. The least recently used are dropped first. */
export const MAX_READ_GRANTS = 10_000;

/** A read decision about one doc. */
export interface ReadGrant {
  readonly allowed: boolean;
  /** Why the doc may not be read, for the log. Empty when it may. */
  readonly reason: string;
  /**
   * The doc version the decision was made at. Ops below this version are the doc's history before the decision (which
   * may be from before a change to a field the decision depends on); they are sent on this decision, as ops the client
   * asked for again. The op at this version is the next one, after which the version moves on (see `advance`). An op
   * above it means the doc changed in ways this connection did not see, so the decision is made again.
   */
  readonly version: number;
  /** The epoch of each project the decision was made with. */
  readonly epochs: ReadonlyMap<string, number>;
  /**
   * The doc's fields the decision depends on (the policy's `readDependsOn`), as they were at `version`, so that an op
   * changing them can be decided again without reading the database. Null when they are not known.
   */
  readonly fields: Readonly<Record<string, unknown>> | null;
  readonly decidedAtMs: number;
}

export interface ReadGrantsOptions {
  readonly ttlMs?: number;
  readonly maxGrants?: number;
  readonly now?: () => number;
}

export class ReadGrants {
  private readonly grants = new Map<string, ReadGrant>();
  /**
   * The docs some decision allowed this connection to read, whether or not that decision still holds, in least recently
   * used order. A doc's delete reveals nothing of it, so it is sent to a connection that was allowed to read the doc,
   * even after a change of the project's membership made the decision stale.
   */
  private readonly onceReadable = new Set<string>();
  private readonly ttlMs: number;
  private readonly maxGrants: number;
  private readonly now: () => number;

  constructor(
    private readonly projects: ProjectAccessCache,
    options: ReadGrantsOptions = {}
  ) {
    this.ttlMs = options.ttlMs ?? READ_GRANT_TTL_MS;
    this.maxGrants = options.maxGrants ?? MAX_READ_GRANTS;
    this.now = options.now ?? Date.now;
  }

  /** The doc's read decision, if there is one that is still current. */
  current(collection: string, docId: string): ReadGrant | undefined {
    const key: string = grantKey(collection, docId);
    const grant: ReadGrant | undefined = this.grants.get(key);
    if (grant == null) {
      return undefined;
    }
    // A decision that read no project depends only on the session and the doc, whose every change arrives as an op of
    // the doc (see `version`), so it does not expire.
    const expired: boolean = grant.epochs.size > 0 && this.now() - grant.decidedAtMs >= this.ttlMs;
    if (expired || !epochsAreCurrent(this.projects, grant.epochs)) {
      this.grants.delete(key);
      return undefined;
    }
    // Reinserting keeps the map in least recently used order.
    this.grants.delete(key);
    this.grants.set(key, grant);
    return grant;
  }

  /** Records a decision just made about the doc at `version`. */
  set(
    collection: string,
    docId: string,
    decision: { readonly allowed: boolean; readonly reason: string },
    version: number,
    epochs: ReadonlyMap<string, number>,
    fields: Readonly<Record<string, unknown>> | null
  ): void {
    const key: string = grantKey(collection, docId);
    this.grants.delete(key);
    this.grants.set(key, {
      allowed: decision.allowed,
      reason: decision.reason,
      version: version,
      epochs: epochs,
      fields: fields,
      decidedAtMs: this.now()
    });
    dropOldest(this.grants, this.maxGrants);
    if (decision.allowed) {
      this.onceReadable.delete(key);
      this.onceReadable.add(key);
      dropOldest(this.onceReadable, this.maxGrants);
    }
  }

  /** Whether some decision allowed this connection to read the doc, current or not (see `onceReadable`). */
  wasReadable(collection: string, docId: string): boolean {
    return this.onceReadable.has(grantKey(collection, docId));
  }

  /**
   * Notes that the op at `opVersion`, which changes nothing the decision depends on, was applied: if the decision was
   * at that version, it now holds at the next one.
   */
  advance(collection: string, docId: string, opVersion: number): void {
    const key: string = grantKey(collection, docId);
    const grant: ReadGrant | undefined = this.grants.get(key);
    if (grant != null && grant.version === opVersion) {
      this.grants.set(key, { ...grant, version: opVersion + 1 });
    }
  }

  /** Drops the doc's decision, so that the next message about the doc is decided again. */
  forget(collection: string, docId: string): void {
    this.grants.delete(grantKey(collection, docId));
  }

  /** Drops everything known about a doc that was deleted: whatever is created at its id next is a new doc. */
  forgetDeleted(collection: string, docId: string): void {
    const key: string = grantKey(collection, docId);
    this.grants.delete(key);
    this.onceReadable.delete(key);
  }

  get size(): number {
    return this.grants.size;
  }
}

function grantKey(collection: string, docId: string): string {
  return JSON.stringify([collection, docId]);
}

/** Drops the oldest entries of a map or set kept in least recently used order until it has at most `max`. */
function dropOldest(entries: Map<string, unknown> | Set<string>, max: number): void {
  while (entries.size > max) {
    const oldest: string | undefined = entries.keys().next().value;
    if (oldest == null) {
      break;
    }
    entries.delete(oldest);
  }
}

/** The top-level `fields` of a doc's data, copied, as a ReadGrant keeps them. Null when the data is not an object. */
export function pickFields(data: unknown, fields: readonly string[]): Readonly<Record<string, unknown>> | null {
  if (!isPlainObject(data)) {
    return null;
  }
  const picked: Record<string, unknown> = {};
  for (const field of fields) {
    if (hasOwnProp(data, field) && data[field] !== undefined) {
      picked[field] = JSON.parse(JSON.stringify(data[field]));
    }
  }
  return picked;
}
