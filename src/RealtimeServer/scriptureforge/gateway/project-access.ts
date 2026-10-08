import ShareDB from 'sharedb';
import { GatewayDataSource, StoredSnapshot } from '../../common/gateway/gateway-data-source';
import { Operation } from '../../common/models/project-rights';
import { hasOwnProp, isPlainObject } from '../../common/utils/type-utils';
import { SF_PROJECTS_COLLECTION } from '../models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from '../models/sf-project-rights';
import { SFProjectRole } from '../models/sf-project-role';

/**
 * Who may do what in a project, for the gateway's policies: membership, role, rights and per-chapter text permissions,
 * read from the project's `sf_projects` doc. Unlike ProjectRights.hasRight, every right here requires membership: a
 * user without a known role in `userRoles` has no rights at all, whatever `userPermissions` or `rolePermissions` say.
 */

/** The project roles a member can have. Any other value in `userRoles` is not membership. */
export const PROJECT_MEMBER_ROLES: readonly SFProjectRole[] = [
  SFProjectRole.ParatextAdministrator,
  SFProjectRole.ParatextTranslator,
  SFProjectRole.ParatextConsultant,
  SFProjectRole.ParatextObserver,
  SFProjectRole.CommunityChecker,
  SFProjectRole.Commenter,
  SFProjectRole.Viewer
];

/** The top-level fields of a project doc that ProjectAccess reads. A change to any of them changes access. */
export const PROJECT_ACCESS_FIELDS: readonly string[] = ['userRoles', 'userPermissions', 'rolePermissions', 'texts'];
/**
 * The fields among PROJECT_ACCESS_FIELDS that decide who may read the project's docs. `texts` holds only the Paratext
 * chapter permissions, which decide edits but not reads, and changes with every sync.
 */
export const PROJECT_READ_ACCESS_FIELDS: readonly string[] = ['userRoles', 'userPermissions', 'rolePermissions'];

/** One book's text permissions, by user id, and its chapters' permissions by chapter number. */
interface BookAccess {
  readonly permissions: ReadonlyMap<string, string>;
  readonly chapters: ReadonlyMap<number, ReadonlyMap<string, string>>;
}

/** The access-relevant facts of one project. */
export class ProjectAccess {
  private constructor(
    readonly projectId: string,
    private readonly userRoles: ReadonlyMap<string, SFProjectRole>,
    private readonly userPermissions: ReadonlyMap<string, ReadonlySet<string>>,
    private readonly rolePermissions: ReadonlyMap<string, ReadonlySet<string>>,
    private readonly books: ReadonlyMap<number, BookAccess>
  ) {}

  /**
   * Reads a project doc's data. Entries that do not have the expected form are left out, which can only take rights
   * away: a malformed role is not membership, and a malformed permission grants nothing.
   */
  static fromData(projectId: string, data: unknown): ProjectAccess {
    const project: Readonly<Record<string, unknown>> = isPlainObject(data) ? data : {};
    const userRoles = new Map<string, SFProjectRole>();
    for (const [userId, role] of ownEntries(project, 'userRoles')) {
      const memberRole: SFProjectRole | undefined = PROJECT_MEMBER_ROLES.find(known => known === role);
      if (memberRole != null) {
        userRoles.set(userId, memberRole);
      }
    }
    const books = new Map<number, BookAccess>();
    const texts: unknown = hasOwnProp(project, 'texts') ? project.texts : undefined;
    if (Array.isArray(texts)) {
      for (const text of texts) {
        const book: { bookNum: number; access: BookAccess } | undefined = readBookAccess(text);
        // A book listed twice is ambiguous, so neither entry counts.
        if (book != null) {
          if (books.has(book.bookNum)) {
            books.set(book.bookNum, { permissions: new Map(), chapters: new Map() });
          } else {
            books.set(book.bookNum, book.access);
          }
        }
      }
    }
    return new ProjectAccess(
      projectId,
      userRoles,
      readPermissionSets(project, 'userPermissions'),
      readPermissionSets(project, 'rolePermissions'),
      books
    );
  }

  /** The user's role in the project, or undefined when the user is not a member. */
  roleOf(userId: string): SFProjectRole | undefined {
    return this.userRoles.get(userId);
  }

  isMember(userId: string): boolean {
    return this.userRoles.has(userId);
  }

  /**
   * Whether the user has a right in the project, as ProjectRights.hasRight decides it, except that only members have
   * rights. `ownerRef` is the owner of the entity the right is for, or null when there is no entity (or no owner).
   * Without the right itself, edit, view and delete fall back to their `_own` variants for the entity's owner. A create
   * right, given an owner, applies only when the user is that owner.
   */
  hasRight(userId: string, domain: SFProjectDomain, operation: Operation, ownerRef: string | null): boolean {
    const role: SFProjectRole | undefined = this.userRoles.get(userId);
    if (role == null) {
      return false;
    }
    const has = (op: Operation): boolean => {
      const right: string = SF_PROJECT_RIGHTS.joinRight(domain, op);
      return (
        SF_PROJECT_RIGHTS.roleHasRight(role, domain, op) ||
        (this.userPermissions.get(userId)?.has(right) ?? false) ||
        (this.rolePermissions.get(role)?.has(right) ?? false)
      );
    };
    if (has(operation)) {
      return operation === Operation.Create && ownerRef != null ? ownerRef === userId : true;
    }
    const ownOperation: Operation | undefined = OWN_OPERATIONS.get(operation);
    return ownOperation != null && ownerRef != null && ownerRef === userId && has(ownOperation);
  }

  /**
   * The user's Paratext permission for a chapter, as the client reads it: the chapter's permission for the user, or
   * else the book's. Undefined when the project does not list the chapter or neither gives the user a permission.
   */
  textPermission(userId: string, bookNum: number, chapterNum: number): string | undefined {
    const book: BookAccess | undefined = this.books.get(bookNum);
    const chapter: ReadonlyMap<string, string> | undefined = book?.chapters.get(chapterNum);
    if (book == null || chapter == null) {
      return undefined;
    }
    return chapter.get(userId) ?? book.permissions.get(userId);
  }
}

const OWN_OPERATIONS: ReadonlyMap<Operation, Operation> = new Map([
  [Operation.Edit, Operation.EditOwn],
  [Operation.View, Operation.ViewOwn],
  [Operation.Delete, Operation.DeleteOwn]
]);

/** The own entries of an object-valued field, as [key, value] pairs. None when the field is not a plain object. */
function ownEntries(record: Readonly<Record<string, unknown>>, field: string): [string, unknown][] {
  const value: unknown = hasOwnProp(record, field) ? record[field] : undefined;
  if (!isPlainObject(value)) {
    return [];
  }
  return Object.keys(value).map((key: string): [string, unknown] => [key, value[key]]);
}

/** Reads `{ [key]: string[] }`, keeping only the strings. */
function readPermissionSets(
  record: Readonly<Record<string, unknown>>,
  field: string
): ReadonlyMap<string, ReadonlySet<string>> {
  const sets = new Map<string, ReadonlySet<string>>();
  for (const [key, value] of ownEntries(record, field)) {
    if (Array.isArray(value)) {
      sets.set(key, new Set(value.filter((right: unknown): right is string => typeof right === 'string')));
    }
  }
  return sets;
}

/** Reads `{ [userId]: permission }`, keeping only string values. */
function readUserPermissionMap(record: Readonly<Record<string, unknown>>): ReadonlyMap<string, string> {
  const permissions = new Map<string, string>();
  for (const [userId, permission] of ownEntries(record, 'permissions')) {
    if (typeof permission === 'string') {
      permissions.set(userId, permission);
    }
  }
  return permissions;
}

function readBookAccess(text: unknown): { bookNum: number; access: BookAccess } | undefined {
  if (!isPlainObject(text) || !hasOwnProp(text, 'bookNum') || typeof text.bookNum !== 'number') {
    return undefined;
  }
  const chapters = new Map<number, ReadonlyMap<string, string>>();
  const rawChapters: unknown = hasOwnProp(text, 'chapters') ? text.chapters : undefined;
  if (Array.isArray(rawChapters)) {
    for (const chapter of rawChapters) {
      if (isPlainObject(chapter) && hasOwnProp(chapter, 'number') && typeof chapter.number === 'number') {
        // As for books, a chapter listed twice is ambiguous and grants nothing.
        chapters.set(chapter.number, chapters.has(chapter.number) ? new Map() : readUserPermissionMap(chapter));
      }
    }
  }
  return { bookNum: text.bookNum, access: { permissions: readUserPermissionMap(text), chapters: chapters } };
}

/** Where policies get a project's access facts from. */
export interface ProjectAccessSource {
  /** The project's access, or null when the project does not exist. Rejects when the project cannot be read. */
  get(projectId: string): Promise<ProjectAccess | null>;
}

/** How long a cached project is used without being read again, in case a change was missed. */
export const PROJECT_ACCESS_TTL_MS = 60_000;
/** The most projects the cache holds. The least recently read are dropped first. */
export const MAX_CACHED_PROJECTS = 10_000;

/** Options for ProjectAccessCache. */
export interface ProjectAccessCacheOptions {
  readonly ttlMs?: number;
  readonly maxEntries?: number;
  readonly now?: () => number;
}

interface CacheEntry {
  readonly access: ProjectAccess;
  readonly fetchedAtMs: number;
}

/**
 * A process-wide cache of ProjectAccess, shared by every gateway connection. Each project has an epoch, a number that
 * increases whenever the project's access may have changed (see observeProjectAccessChanges). Code that caches its own
 * decisions, such as the egress authorizer's read grants, can record the epoch with a decision and treat the decision
 * as stale once the epoch has moved on. Entries also expire after a while, so that a missed change cannot last.
 */
export class ProjectAccessCache implements ProjectAccessSource {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<ProjectAccess | null>>();
  private readonly epochs = new Map<string, number>();
  private readonly readEpochs = new Map<string, number>();
  private readonly listeners = new Set<(projectId: string) => void>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    private readonly data: GatewayDataSource,
    options: ProjectAccessCacheOptions = {}
  ) {
    this.ttlMs = options.ttlMs ?? PROJECT_ACCESS_TTL_MS;
    this.maxEntries = options.maxEntries ?? MAX_CACHED_PROJECTS;
    this.now = options.now ?? Date.now;
  }

  /** The project's access, or null when the project does not exist. Rejects when the project cannot be read. */
  get(projectId: string): Promise<ProjectAccess | null> {
    const entry: CacheEntry | undefined = this.entries.get(projectId);
    if (entry != null && this.now() - entry.fetchedAtMs < this.ttlMs) {
      // Reinserting keeps the map in least recently read order.
      this.entries.delete(projectId);
      this.entries.set(projectId, entry);
      return Promise.resolve(entry.access);
    }
    const pending: Promise<ProjectAccess | null> | undefined = this.pending.get(projectId);
    if (pending != null) {
      return pending;
    }
    const epochAtStart: number = this.epoch(projectId);
    const fetching: Promise<ProjectAccess | null> = this.fetch(projectId).then(
      (access: ProjectAccess | null) => {
        this.forgetPending(projectId, fetching);
        // A change during the read may not be in what was read, so it is not cached; the next call reads again. A
        // project that does not exist is not cached either, so that requests for made-up ids cannot push real
        // projects out of the cache.
        if (access != null && this.epoch(projectId) === epochAtStart) {
          this.store(projectId, { access: access, fetchedAtMs: this.now() });
        }
        return access;
      },
      (error: unknown) => {
        this.forgetPending(projectId, fetching);
        throw error;
      }
    );
    this.pending.set(projectId, fetching);
    return fetching;
  }

  /** A number that increases whenever the project's access may have changed. */
  epoch(projectId: string): number {
    return this.epochs.get(projectId) ?? 0;
  }

  /**
   * A number that increases whenever who may read the project's docs may have changed: like `epoch`, but not moved on
   * by changes that can only change who may edit (see PROJECT_READ_ACCESS_FIELDS).
   */
  readEpoch(projectId: string): number {
    return this.readEpochs.get(projectId) ?? 0;
  }

  /**
   * Forgets what is known about the project's access and moves its epoch on, and its read epoch too unless
   * `readAccessMayChange` is false.
   */
  invalidate(projectId: string, readAccessMayChange: boolean = true): void {
    this.entries.delete(projectId);
    // A read in flight was started before the change, so a later caller must not share its result.
    this.pending.delete(projectId);
    this.epochs.set(projectId, this.epoch(projectId) + 1);
    if (readAccessMayChange) {
      this.readEpochs.set(projectId, this.readEpoch(projectId) + 1);
    }
    for (const listener of this.listeners) {
      try {
        listener(projectId);
      } catch {
        // A listener's failure must not stop the others from hearing about the change.
      }
    }
  }

  /** Calls `listener` with the project id whenever a project's access may have changed. Returns an unsubscriber. */
  onInvalidated(listener: (projectId: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async fetch(projectId: string): Promise<ProjectAccess | null> {
    const snapshot: StoredSnapshot = await this.data.getSnapshot(
      SF_PROJECTS_COLLECTION,
      projectId,
      PROJECT_ACCESS_FIELDS
    );
    return snapshot.type == null ? null : ProjectAccess.fromData(projectId, snapshot.data);
  }

  /** Forgets a finished read, unless an invalidation has already replaced it with a newer one. */
  private forgetPending(projectId: string, fetching: Promise<ProjectAccess | null>): void {
    if (this.pending.get(projectId) === fetching) {
      this.pending.delete(projectId);
    }
  }

  private store(projectId: string, entry: CacheEntry): void {
    this.entries.delete(projectId);
    this.entries.set(projectId, entry);
    while (this.entries.size > this.maxEntries) {
      const oldest: string | undefined = this.entries.keys().next().value;
      if (oldest == null) {
        break;
      }
      this.entries.delete(oldest);
    }
  }
}

/**
 * Registers backend-wide middleware that invalidates a project in the cache whenever an op committed to its
 * `sf_projects` doc may change access: a create or delete, a replacement of the whole doc, or a change under one of
 * PROJECT_ACCESS_FIELDS. It sees ops from every connection, including the backend's, which is where membership and
 * permission changes come from.
 */
export function observeProjectAccessChanges(backend: ShareDB, cache: ProjectAccessCache): void {
  backend.use('afterWrite', (context: ShareDB.middleware.SubmitContext, next: (err?: unknown) => void) => {
    try {
      if (context.collection === SF_PROJECTS_COLLECTION && opMayChangeAccess(context.op)) {
        cache.invalidate(context.id, opMayChangeAccess(context.op, PROJECT_READ_ACCESS_FIELDS));
      }
    } catch {
      // Failing to look at the op must not fail the write; the cache's expiry is the backstop.
    }
    next();
  });
}

/**
 * Whether a committed project op may change who may do what in the project: whether it creates or deletes the
 * project, replaces it, or changes one of `fields`. Anything unrecognized may.
 */
export function opMayChangeAccess(op: unknown, fields: readonly string[] = PROJECT_ACCESS_FIELDS): boolean {
  if (hasOwnProp(op, 'create') && op.create != null) {
    return true;
  }
  if (hasOwnProp(op, 'del') && op.del != null && op.del !== false) {
    return true;
  }
  const components: unknown = hasOwnProp(op, 'op') ? op.op : undefined;
  if (!Array.isArray(components)) {
    return true;
  }
  return components.some((component: unknown): boolean => {
    const path: unknown = hasOwnProp(component, 'p') ? component.p : undefined;
    if (!Array.isArray(path) || path.length === 0) {
      return true;
    }
    const field: unknown = path[0];
    return typeof field !== 'string' || fields.includes(field);
  });
}

/** The project roles that have a right, for code that decides before a project's data is known. */
export function rolesWithRight(domain: SFProjectDomain, operation: Operation): readonly SFProjectRole[] {
  return PROJECT_MEMBER_ROLES.filter((role: SFProjectRole) => SF_PROJECT_RIGHTS.roleHasRight(role, domain, operation));
}

/**
 * Passes reads on to a ProjectAccessCache and records the read epoch (see ProjectAccessCache.readEpoch) of each project
 * read, as it was when first asked for. A decision about reading made with the projects read can then be checked
 * later for whether any of them may have changed since (see epochsAreCurrent). The epoch is recorded before the
 * project is read, so a change during the read also makes it stale.
 */
export class EpochRecordingProjectSource implements ProjectAccessSource {
  private readonly recorded = new Map<string, number>();

  constructor(private readonly cache: ProjectAccessCache) {}

  /** The projects read so far, with their read epochs. */
  get epochs(): ReadonlyMap<string, number> {
    return this.recorded;
  }

  get(projectId: string): Promise<ProjectAccess | null> {
    if (!this.recorded.has(projectId)) {
      this.recorded.set(projectId, this.cache.readEpoch(projectId));
    }
    return this.cache.get(projectId);
  }
}

/** Whether none of the projects has moved past the read epoch recorded for it. */
export function epochsAreCurrent(cache: ProjectAccessCache, epochs: ReadonlyMap<string, number>): boolean {
  for (const [projectId, epoch] of epochs) {
    if (cache.readEpoch(projectId) !== epoch) {
      return false;
    }
  }
  return true;
}
