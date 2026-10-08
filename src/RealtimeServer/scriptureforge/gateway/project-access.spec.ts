import { Operation } from '../../common/models/project-rights';
import { SF_PROJECTS_COLLECTION } from '../models/sf-project';
import { SFProjectDomain } from '../models/sf-project-rights';
import { MemoryDataSource, PROJECT_ID, testProjectData, USERS } from './test-gateway-world';
import { opMayChangeAccess, ProjectAccess, ProjectAccessCache } from './project-access';

describe('ProjectAccess', () => {
  it('gives rights only to members, whatever userPermissions and rolePermissions say', () => {
    const access: ProjectAccess = ProjectAccess.fromData(
      PROJECT_ID,
      testProjectData({
        userRoles: { [USERS.checker]: 'sf_community_checker', [USERS.consultant]: 'not_a_role' },
        userPermissions: { [USERS.nonMember]: ['texts.edit'], [USERS.checker]: ['texts.edit'] },
        rolePermissions: { undefined: ['texts.view'], not_a_role: ['texts.view'] }
      })
    );

    expect(access.isMember(USERS.checker)).toBe(true);
    expect(access.isMember(USERS.consultant)).toBe(false);
    expect(access.hasRight(USERS.checker, SFProjectDomain.Texts, Operation.Edit, null)).toBe(true);
    expect(access.hasRight(USERS.nonMember, SFProjectDomain.Texts, Operation.Edit, null)).toBe(false);
    expect(access.hasRight(USERS.nonMember, SFProjectDomain.Texts, Operation.View, null)).toBe(false);
    expect(access.hasRight(USERS.consultant, SFProjectDomain.Texts, Operation.View, null)).toBe(false);
  });

  it('applies _own rights to the owner, and create only for oneself', () => {
    const access: ProjectAccess = ProjectAccess.fromData(PROJECT_ID, testProjectData());

    expect(access.hasRight(USERS.checker, SFProjectDomain.Answers, Operation.Edit, USERS.checker)).toBe(true);
    expect(access.hasRight(USERS.checker, SFProjectDomain.Answers, Operation.Edit, USERS.admin)).toBe(false);
    expect(access.hasRight(USERS.checker, SFProjectDomain.Answers, Operation.Create, USERS.checker)).toBe(true);
    expect(access.hasRight(USERS.checker, SFProjectDomain.Answers, Operation.Create, USERS.admin)).toBe(false);
  });

  it('reads the chapter permission, falling back to the book permission', () => {
    const access: ProjectAccess = ProjectAccess.fromData(PROJECT_ID, testProjectData());

    expect(access.textPermission(USERS.translator, 40, 1)).toEqual('write');
    expect(access.textPermission(USERS.translator, 40, 2)).toEqual('read');
    expect(access.textPermission(USERS.checker, 40, 1)).toBeUndefined();
    expect(access.textPermission(USERS.admin, 40, 3)).toBeUndefined();
    expect(access.textPermission(USERS.admin, 41, 1)).toBeUndefined();
  });

  it('treats a book listed twice as granting nothing', () => {
    const data: Record<string, unknown> = testProjectData();
    const texts: unknown[] = data.texts as unknown[];
    const access: ProjectAccess = ProjectAccess.fromData(PROJECT_ID, { ...data, texts: [...texts, texts[0]] });

    expect(access.textPermission(USERS.admin, 40, 1)).toBeUndefined();
  });

  it('reads malformed data as granting nothing', () => {
    const access: ProjectAccess = ProjectAccess.fromData(PROJECT_ID, { userRoles: 'x', texts: {} });

    expect(access.isMember(USERS.admin)).toBe(false);
    expect(ProjectAccess.fromData(PROJECT_ID, null).isMember(USERS.admin)).toBe(false);
  });
});

describe('ProjectAccessCache', () => {
  it('reads a project once while it is fresh, and again once invalidated', async () => {
    const env = new TestEnvironment();

    await env.cache.get(PROJECT_ID);
    await env.cache.get(PROJECT_ID);
    const epochBefore: number = env.cache.epoch(PROJECT_ID);
    env.cache.invalidate(PROJECT_ID);
    await env.cache.get(PROJECT_ID);

    expect(env.projectReads()).toEqual(2);
    expect(env.cache.epoch(PROJECT_ID)).toEqual(epochBefore + 1);
  });

  it('reads a project again after the time to live', async () => {
    const env = new TestEnvironment();

    await env.cache.get(PROJECT_ID);
    env.nowMs += 60_001;
    await env.cache.get(PROJECT_ID);

    expect(env.projectReads()).toEqual(2);
  });

  it('does not cache a read that an invalidation overtook', async () => {
    const env = new TestEnvironment();

    const reading: Promise<ProjectAccess | null> = env.cache.get(PROJECT_ID);
    env.cache.invalidate(PROJECT_ID);
    await reading;
    await env.cache.get(PROJECT_ID);

    expect(env.projectReads()).toEqual(2);
  });

  it('tells listeners about invalidations', () => {
    const env = new TestEnvironment();
    const invalidated: string[] = [];
    env.cache.onInvalidated(projectId => invalidated.push(projectId));

    env.cache.invalidate(PROJECT_ID);

    expect(invalidated).toEqual([PROJECT_ID]);
  });

  it('gives null for a project that does not exist, and rejects when the database fails', async () => {
    const env = new TestEnvironment();

    expect(await env.cache.get('cccccccccccccccccccccccc')).toBeNull();
    env.data.fail();
    env.cache.invalidate(PROJECT_ID);
    await expect(env.cache.get(PROJECT_ID)).rejects.toThrow();
  });
});

describe('opMayChangeAccess', () => {
  it.each<[string, unknown, boolean]>([
    ['a role change', { op: [{ p: ['userRoles', 'u1'], oi: 'pt_observer' }] }, true],
    ['a permissions change', { op: [{ p: ['userPermissions', 'u1'], oi: [] }] }, true],
    ['a role permissions change', { op: [{ p: ['rolePermissions', 'x'], oi: [] }] }, true],
    ['a chapter permission change', { op: [{ p: ['texts', 0, 'chapters', 1, 'permissions'], oi: {} }] }, true],
    ['a whole doc replacement', { op: [{ p: [], oi: {} }] }, true],
    ['a create', { create: { type: 'json0', data: {} } }, true],
    ['a delete', { del: true }, true],
    ['something unreadable', { op: 'x' }, true],
    ['a sync status change', { op: [{ p: ['sync', 'queuedCount'], oi: 1 }] }, false]
  ])('says %s may change access: %s', (_name: string, op: unknown, expected: boolean) => {
    expect(opMayChangeAccess(op)).toBe(expected);
  });
});

/** A cache over an in-memory data source, with a clock the test moves. */
class TestEnvironment {
  readonly data = new MemoryDataSource();
  nowMs = 1_000_000;
  readonly cache = new ProjectAccessCache(this.data, { now: () => this.nowMs });

  constructor() {
    this.data.put(SF_PROJECTS_COLLECTION, PROJECT_ID, testProjectData());
  }

  projectReads(): number {
    return this.data.reads.filter(read => read === `${SF_PROJECTS_COLLECTION}/${PROJECT_ID}`).length;
  }
}
