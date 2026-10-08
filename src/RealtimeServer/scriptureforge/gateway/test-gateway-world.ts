import { GatewaySession } from '../../common/gateway/authorization';
import {
  GatewayDataSource,
  MAX_REPLAYED_OPS,
  StoredOp,
  StoredSnapshot,
  TooManyOpsToReplayError
} from '../../common/gateway/gateway-data-source';
import { JSON0_TYPE_URI, RICH_TEXT_TYPE_URI } from '../../common/gateway/protocol-config';
import { SystemRole } from '../../common/models/system-role';
import { SF_PROJECTS_COLLECTION } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import { TEXTS_COLLECTION } from '../models/text-data';
import { ProjectAccessCache } from './project-access';
import { SFAccessContext } from './sf-access-context';
import { UserProfileCache } from './user-profile-cache';

/**
 * A small in-memory world for unit tests of the gateway's policies, query registry and authorizers: a data source
 * holding docs and their ops, with a project in which there is one user of each role. Only spec files use it.
 */

/** Ids are hex, as the policies require of project and user ids. */
export const PROJECT_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
export const OTHER_PROJECT_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';

/** One user of each project role, plus users with no role and system roles. */
export const USERS = {
  admin: 'a00000000000000000000001',
  translator: 'a00000000000000000000002',
  consultant: 'a00000000000000000000003',
  ptObserver: 'a00000000000000000000004',
  checker: 'a00000000000000000000005',
  commenter: 'a00000000000000000000006',
  sfObserver: 'a00000000000000000000007',
  nonMember: 'a00000000000000000000008',
  systemAdmin: 'a00000000000000000000009',
  servalAdmin: 'a0000000000000000000000a'
} as const;

export type TestUserName = keyof typeof USERS;

/** The role of each member of PROJECT_ID. */
export const MEMBER_ROLES: ReadonlyMap<string, SFProjectRole> = new Map([
  [USERS.admin, SFProjectRole.ParatextAdministrator],
  [USERS.translator, SFProjectRole.ParatextTranslator],
  [USERS.consultant, SFProjectRole.ParatextConsultant],
  [USERS.ptObserver, SFProjectRole.ParatextObserver],
  [USERS.checker, SFProjectRole.CommunityChecker],
  [USERS.commenter, SFProjectRole.Commenter],
  [USERS.sfObserver, SFProjectRole.Viewer]
]);

/** A session for a test user. System roles follow the user's name. */
export function sessionFor(user: TestUserName): GatewaySession {
  const systemRoles: string[] = [SystemRole.User];
  if (user === 'systemAdmin') {
    systemRoles.push(SystemRole.SystemAdmin);
  }
  if (user === 'servalAdmin') {
    systemRoles.push(SystemRole.ServalAdmin);
  }
  return { userId: USERS[user], systemRoles: systemRoles };
}

/**
 * The data of PROJECT_ID's `sf_projects` doc: every member's role, Matthew (book 40) with chapters 1 and 2 where the
 * administrator and translator may write (chapter 2 only the administrator; the translator has read there).
 */
export function testProjectData(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const userRoles: Record<string, string> = {};
  for (const [userId, role] of MEMBER_ROLES) {
    userRoles[userId] = role;
  }
  return {
    name: 'Test project',
    shortName: 'TST',
    paratextId: 'pt01',
    userRoles: userRoles,
    userPermissions: {},
    rolePermissions: {},
    texts: [
      {
        bookNum: 40,
        hasSource: false,
        permissions: { [USERS.admin]: 'write', [USERS.translator]: 'write', [USERS.consultant]: 'read' },
        chapters: [
          { number: 1, lastVerse: 25, isValid: true, permissions: {} },
          { number: 2, lastVerse: 23, isValid: true, permissions: { [USERS.translator]: 'read' } }
        ]
      }
    ],
    ...overrides
  };
}

interface StoredDoc {
  version: number;
  type: string | null;
  data: unknown;
  createdAtVersion: number | null;
  ops: StoredOp[];
  /** The data the doc had at versions before an `editData`, by version. */
  pastData: Map<number, unknown>;
}

/** An in-memory GatewayDataSource. */
export class MemoryDataSource implements GatewayDataSource {
  readonly reads: string[] = [];
  /** The past versions asked for, as `collection/docId@version`. */
  readonly versionReads: string[] = [];
  /** The ops asked for, as `collection/docId@from..to` (`to` empty for up to the current version). */
  readonly opReads: string[] = [];
  private readonly docs = new Map<string, StoredDoc>();
  private failing = false;

  /** Stores a json0 doc created at version 0 and edited `edits` times. */
  put(collection: string, docId: string, data: unknown, { edits = 0, type = JSON0_TYPE_URI } = {}): void {
    const ops: StoredOp[] = [CREATE_OP];
    for (let i = 0; i < edits; i++) {
      ops.push(UNKNOWN_EDIT_OP);
    }
    this.docs.set(key(collection, docId), {
      version: ops.length,
      type: type,
      data: jsonCopy(data),
      createdAtVersion: 0,
      ops: ops,
      pastData: new Map()
    });
  }

  /** Records an edit op that leaves the doc with `data`, keeping the data it had before for getSnapshotAtVersion. */
  editData(collection: string, docId: string, data: unknown): void {
    const doc: StoredDoc | undefined = this.docs.get(key(collection, docId));
    if (doc != null) {
      doc.pastData.set(doc.version, doc.data);
      doc.ops.push(UNKNOWN_EDIT_OP);
      doc.version++;
      doc.data = jsonCopy(data);
    }
  }

  /** Stores a text doc (rich-text). */
  putText(docId: string, ops: unknown[] = []): void {
    this.put(TEXTS_COLLECTION, docId, { ops: ops }, { type: RICH_TEXT_TYPE_URI });
  }

  /** Records a delete op on a stored doc. */
  delete(collection: string, docId: string): void {
    const doc: StoredDoc | undefined = this.docs.get(key(collection, docId));
    if (doc != null) {
      doc.ops.push({ kind: 'delete', edit: undefined });
      doc.version++;
      doc.type = null;
      doc.data = undefined;
      doc.createdAtVersion = null;
    }
  }

  /** Records a create op on a deleted doc, as when a doc is deleted and created again. */
  recreate(collection: string, docId: string, data: unknown): void {
    const doc: StoredDoc | undefined = this.docs.get(key(collection, docId));
    if (doc != null) {
      doc.createdAtVersion = doc.version;
      doc.ops.push(CREATE_OP);
      doc.version++;
      doc.type = JSON0_TYPE_URI;
      doc.data = jsonCopy(data);
    }
  }

  /**
   * Records edit ops on a stored doc. `edit` is what each op changes, such as json0 components; when it is not given,
   * the ops are of unknown content.
   */
  edit(collection: string, docId: string, edits: number = 1, edit?: unknown): void {
    const doc: StoredDoc | undefined = this.docs.get(key(collection, docId));
    if (doc != null) {
      for (let i = 0; i < edits; i++) {
        doc.ops.push(edit === undefined ? UNKNOWN_EDIT_OP : { kind: 'edit', edit: jsonCopy(edit) });
        doc.version++;
      }
    }
  }

  /** Forgets when a doc was created, as for docs created before ShareDB recorded it. */
  forgetCreateVersion(collection: string, docId: string): void {
    const doc: StoredDoc | undefined = this.docs.get(key(collection, docId));
    if (doc != null) {
      doc.createdAtVersion = null;
    }
  }

  /** Makes every read reject, as a database outage would. */
  fail(): void {
    this.failing = true;
  }

  async getSnapshot(collection: string, docId: string): Promise<StoredSnapshot> {
    this.reads.push(key(collection, docId));
    if (this.failing) {
      throw new Error('database unavailable');
    }
    const doc: StoredDoc | undefined = this.docs.get(key(collection, docId));
    if (doc == null) {
      return { version: 0, type: null, data: undefined, createdAtVersion: null };
    }
    return {
      version: doc.version,
      type: doc.type,
      data: jsonCopy(doc.data),
      createdAtVersion: doc.createdAtVersion
    };
  }

  async getSnapshots(collection: string, docIds: readonly string[]): Promise<ReadonlyMap<string, StoredSnapshot>> {
    const snapshots = new Map<string, StoredSnapshot>();
    for (const docId of docIds) {
      snapshots.set(docId, await this.getSnapshot(collection, docId));
    }
    return snapshots;
  }

  async getSnapshotAtVersion(collection: string, docId: string, version: number): Promise<StoredSnapshot> {
    this.versionReads.push(`${key(collection, docId)}@${version}`);
    // Past data is known only from before an editData; otherwise tests only ask for versions of docs whose data has
    // not changed since.
    const snapshot: StoredSnapshot = await this.getSnapshot(collection, docId);
    if (version > snapshot.version) {
      throw new Error('version too new');
    }
    // There are no milestones, so a rebuild replays the ops from the first.
    if (version > MAX_REPLAYED_OPS) {
      throw new TooManyOpsToReplayError(collection, docId, version, version);
    }
    const pastData: unknown = this.docs.get(key(collection, docId))?.pastData.get(version);
    return { ...snapshot, version: version, data: pastData === undefined ? snapshot.data : jsonCopy(pastData) };
  }

  async getOps(collection: string, docId: string, from: number, to: number | null): Promise<readonly StoredOp[]> {
    this.opReads.push(`${key(collection, docId)}@${from}..${to ?? ''}`);
    if (this.failing) {
      throw new Error('database unavailable');
    }
    if (to != null && to - from > MAX_REPLAYED_OPS) {
      throw new TooManyOpsToReplayError(collection, docId, to, to - from);
    }
    const doc: StoredDoc | undefined = this.docs.get(key(collection, docId));
    return doc == null ? [] : doc.ops.slice(from, to ?? undefined);
  }
}

/** A data source with PROJECT_ID stored, and an access context for one of its users. */
export class TestWorld {
  readonly data = new MemoryDataSource();
  readonly projects: ProjectAccessCache = new ProjectAccessCache(this.data);
  readonly profiles: UserProfileCache = new UserProfileCache(this.data);

  constructor(projectData: Record<string, unknown> = testProjectData()) {
    this.data.put(SF_PROJECTS_COLLECTION, PROJECT_ID, projectData);
  }

  contextFor(user: TestUserName): SFAccessContext {
    return { session: sessionFor(user), projects: this.projects, profiles: this.profiles, data: this.data };
  }
}

const CREATE_OP: StoredOp = { kind: 'create', edit: undefined };
/** An edit whose content a test did not give. Anything deciding on it must assume it may change anything. */
const UNKNOWN_EDIT_OP: StoredOp = { kind: 'edit', edit: undefined };

function key(collection: string, docId: string): string {
  return `${collection}/${docId}`;
}

/**
 * A deep copy made the way the database would return data. structuredClone is not used, because under jest it makes
 * objects whose prototype is from another realm, which the gateway's plain-object checks rightly refuse.
 */
function jsonCopy(value: unknown): unknown {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
