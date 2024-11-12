import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock } from 'ts-mockito';
import { Project } from '../models/project';
import { SystemRole } from '../models/system-role';
import { User, USERS_COLLECTION } from '../models/user';
import { createTestUser } from '../models/user-test-data';
import { RealtimeServer } from '../realtime-server';
import { SchemaVersionRepository } from '../schema-version-repository';
import { allowAll, clientConnect, createDoc, fetchDoc, submitJson0Op, submitOp } from '../utils/test-utils';
import { ProjectService } from './project-service';

const PROJECTS_COLLECTION = 'projects';

describe('ProjectService', () => {
  it('allows serval admin to view any project', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'servalAdmin', SystemRole.ServalAdmin);
    await expect(fetchDoc(conn, PROJECTS_COLLECTION, 'project01')).resolves.not.toThrow();
  });

  it('allows system admin to view any project', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'systemAdmin', SystemRole.SystemAdmin);
    await expect(fetchDoc(conn, PROJECTS_COLLECTION, 'project01')).resolves.not.toThrow();
  });

  it('allows system admin to edit any project', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'systemAdmin', SystemRole.SystemAdmin);
    await expect(submitOp(conn, PROJECTS_COLLECTION, 'project01', [])).resolves.not.toThrow();
  });

  it('allows project member to view project', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'user');
    await expect(fetchDoc(conn, PROJECTS_COLLECTION, 'project01')).resolves.not.toThrow();
  });

  it('allows project admin to edit project', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'projectAdmin');
    await expect(submitOp(conn, PROJECTS_COLLECTION, 'project01', [])).resolves.not.toThrow();
  });

  it('does not allow non-admin to edit project', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'user');
    await expect(submitOp(conn, PROJECTS_COLLECTION, 'project01', [])).rejects.toThrow();
  });

  it('does not allow non-member to view project', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'nonmember');
    await expect(fetchDoc(conn, PROJECTS_COLLECTION, 'project01')).rejects.toThrow();
  });

  it('allows system admin to edit immutable properties', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'systemAdmin', SystemRole.SystemAdmin);
    await expect(
      submitJson0Op<Project>(conn, PROJECTS_COLLECTION, 'project01', ops => ops.set<string>(p => p.name, 'New Name'))
    ).resolves.not.toThrow();
  });

  it('does not allow user to edit immutable properties', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'projectAdmin');
    await expect(
      submitJson0Op<Project>(conn, PROJECTS_COLLECTION, 'project01', ops => ops.set<string>(p => p.name, 'New Name'))
    ).rejects.toThrow();
  });
});

class TestProjectService extends ProjectService {
  readonly collection = PROJECTS_COLLECTION;

  protected readonly indexPaths = [];
  protected readonly projectAdminRole = 'admin';

  constructor() {
    super([]);
  }
}

class TestEnvironment {
  readonly service: TestProjectService;
  readonly server: RealtimeServer;
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);

  constructor() {
    this.service = new TestProjectService();
    const ShareDBMingoType = ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB);
    this.db = new ShareDBMingoType();
    this.server = new RealtimeServer(
      'TEST',
      false,
      false,
      [this.service],
      PROJECTS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
    allowAll(this.server, USERS_COLLECTION);
  }

  async createData(): Promise<void> {
    const conn = this.server.connect();
    await createDoc<User>(
      conn,
      USERS_COLLECTION,
      'systemAdmin',
      createTestUser(
        {
          roles: [SystemRole.SystemAdmin]
        },
        1
      )
    );

    await createDoc<User>(conn, USERS_COLLECTION, 'projectAdmin', createTestUser({}, 2));
    await createDoc<User>(conn, USERS_COLLECTION, 'user', createTestUser({}, 3));
    await createDoc<User>(conn, USERS_COLLECTION, 'nonmember', createTestUser({}, 4));

    await createDoc<Project>(conn, PROJECTS_COLLECTION, 'project01', {
      name: 'Project 01',
      userRoles: {
        projectAdmin: 'admin',
        user: 'user'
      },
      rolePermissions: {},
      userPermissions: {}
    });
  }
}
