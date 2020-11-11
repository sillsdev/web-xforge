import ShareDB = require('sharedb');
import ShareDBMingo = require('sharedb-mingo-memory');
import { Doc } from 'sharedb/lib/client';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { ConnectSession } from './connect-session';
import { MetadataDB } from './metadata-db';
import { Migration } from './migration';
import { Project } from './models/project';
import { SystemRole } from './models/system-role';
import { User, USERS_COLLECTION } from './models/user';
import { RealtimeServer, submitMigrationOp } from './realtime-server';
import { SchemaVersionRepository } from './schema-version-repository';
import { ProjectService } from './services/project-service';
import { UserService } from './services/user-service';
import { Json0OpBuilder } from './utils/json0-op-builder';
import { docFetch, docSubmitOp } from './utils/sharedb-utils';
import { allowAll, clientConnect, createDoc, fetchDoc, submitJson0Op, submitOp } from './utils/test-utils';

const PROJECTS_COLLECTION = 'projects';

describe('RealtimeServer', () => {
  it('migrates docs when schema version does not exist', async () => {
    const env = new TestEnvironment();
    await env.createData();
    when(env.mockedUserService.schemaVersion).thenReturn(1);
    const mockedMigration = mock<Migration>();
    when(env.mockedUserService.getMigration(1)).thenReturn(instance(mockedMigration));
    when(mockedMigration.migrateDoc(anything())).thenCall((doc: Doc) => submitMigrationOp(1, doc, []));

    await env.server.migrateIfNecessary();

    verify(mockedMigration.migrateDoc(anything())).twice();
    verify(env.mockedSchemaVersionRepository.set(USERS_COLLECTION, 1)).once();
    const ops = env.db.ops[USERS_COLLECTION]['user01'];
    expect(ops[1].m.migration).toEqual(1);
  });

  it('migrates docs when schema version exists', async () => {
    const env = new TestEnvironment();
    await env.createData();
    when(env.mockedProjectService.schemaVersion).thenReturn(2);
    const mockedMigration = mock<Migration>();
    when(env.mockedProjectService.getMigration(2)).thenReturn(instance(mockedMigration));
    when(mockedMigration.migrateDoc(anything())).thenCall((doc: Doc) => submitMigrationOp(2, doc, []));

    await env.server.migrateIfNecessary();

    verify(mockedMigration.migrateDoc(anything())).once();
    verify(env.mockedSchemaVersionRepository.set(PROJECTS_COLLECTION, 2)).once();
    const ops = env.db.ops[PROJECTS_COLLECTION]['project01'];
    expect(ops[1].m.migration).toEqual(2);
  });

  it('migrates op', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const userConn = clientConnect(env.server, 'user01');
    const userDoc = await fetchDoc(userConn, USERS_COLLECTION, 'user01');
    await env.migrateDoc(USERS_COLLECTION, 'user01', 1);
    const mockedMigration = mock<Migration>();
    when(env.mockedUserService.getMigration(1)).thenReturn(instance(mockedMigration));

    await docSubmitOp(userDoc, []);

    verify(mockedMigration.migrateOp(anything())).once();
    const ops = env.db.ops[USERS_COLLECTION]['user01'];
    expect(ops.length).toEqual(3);
  });

  it('gets correct project role', async () => {
    const env = new TestEnvironment();
    await env.createData();
    let session: ConnectSession;
    env.server.use('submit', (context, callback) => {
      session = context.agent.connectSession as ConnectSession;
      callback();
    });

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, PROJECTS_COLLECTION, 'project01', []);
    expect(session!.userId).toEqual('user01');
    expect(env.server.getUserProjectRole(session!, 'project01')).resolves.toEqual('admin');
  });

  it('gets correct project role when new project added', async () => {
    const env = new TestEnvironment();
    await env.createData();
    let session: ConnectSession;
    env.server.use('submit', (context, callback) => {
      session = context.agent.connectSession;
      callback();
    });

    const userConn = clientConnect(env.server, 'user01');
    await env.createDoc<Project>(PROJECTS_COLLECTION, 'project02', {
      name: 'Project 02',
      userRoles: {
        user01: 'user'
      }
    });
    await submitOp(userConn, PROJECTS_COLLECTION, 'project02', []);
    expect(session!.userId).toEqual('user01');
    expect(env.server.getUserProjectRole(session!, 'project02')).resolves.toEqual('user');
  });

  it('gets correct project role when role changed', async () => {
    const env = new TestEnvironment();
    await env.createData();
    let session: ConnectSession;
    env.server.use('submit', (context, callback) => {
      session = context.agent.connectSession as ConnectSession;
      callback();
    });

    const userConn = clientConnect(env.server, 'user01');
    await env.submitJson0Op<Project>(PROJECTS_COLLECTION, 'project01', ops =>
      ops.set<string>(p => p.userRoles['user01'], 'user')
    );
    await submitOp(userConn, PROJECTS_COLLECTION, 'project01', []);
    expect(session!.userId).toEqual('user01');
    expect(env.server.getUserProjectRole(session!, 'project01')).resolves.toEqual('user');
  });

  it('gets correct resource access permission', async () => {
    const env = new TestEnvironment();
    await env.createData();
    let session: ConnectSession;
    env.server.use('submit', (context, callback) => {
      session = context.agent.connectSession as ConnectSession;
      callback();
    });

    const userConn = clientConnect(env.server, 'user02');
    await submitOp(userConn, PROJECTS_COLLECTION, 'project01', []);
    expect(session!.userId).toEqual('user02');
    expect(env.server.canUserAccessResource(session!, 'resource01')).resolves.toEqual(true);
  });

  it('gets correct resource access denied permission', async () => {
    const env = new TestEnvironment();
    await env.createData();
    let session: ConnectSession;
    env.server.use('submit', (context, callback) => {
      session = context.agent.connectSession as ConnectSession;
      callback();
    });

    const userConn = clientConnect(env.server, 'user01');
    await submitOp(userConn, PROJECTS_COLLECTION, 'project01', []);
    expect(session!.userId).toEqual('user01');
    expect(env.server.canUserAccessResource(session!, 'resource01')).resolves.toEqual(false);
  });
});

class TestEnvironment {
  readonly mockedUserService = mock(UserService);
  readonly mockedProjectService = mock(ProjectService);
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);
  readonly server: RealtimeServer;

  constructor() {
    const ShareDBMingoType = MetadataDB(ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB));
    this.db = new ShareDBMingoType();
    when(this.mockedSchemaVersionRepository.getAll()).thenResolve([
      { _id: PROJECTS_COLLECTION, collection: PROJECTS_COLLECTION, version: 1 }
    ]);
    when(this.mockedUserService.collection).thenReturn(USERS_COLLECTION);
    when(this.mockedProjectService.collection).thenReturn(PROJECTS_COLLECTION);
    this.server = new RealtimeServer(
      'TEST',
      [instance(this.mockedUserService), instance(this.mockedProjectService)],
      PROJECTS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
    allowAll(this.server, USERS_COLLECTION);
    allowAll(this.server, PROJECTS_COLLECTION);
  }

  async createData(): Promise<void> {
    const conn = this.server.connect();
    await createDoc<User>(conn, USERS_COLLECTION, 'user01', {
      name: 'User 01',
      email: 'user01@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth01',
      displayName: 'User 01',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<User>(conn, USERS_COLLECTION, 'user02', {
      name: 'User 02',
      email: 'user02@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth02',
      displayName: 'User 02',
      avatarUrl: '',
      sites: {
        TEST: {
          projects: [],
          resources: ['resource01']
        }
      }
    });

    await createDoc<Project>(conn, PROJECTS_COLLECTION, 'project01', {
      name: 'Project 01',
      userRoles: {
        user01: 'admin'
      }
    });
  }

  async migrateDoc(collection: string, id: string, version: number): Promise<void> {
    const conn = this.server.connect();
    const doc = conn.get(collection, id);
    await docFetch(doc);
    await submitMigrationOp(version, doc, []);
  }

  createDoc<T>(collection: string, id: string, data: T): Promise<void> {
    const conn = this.server.connect();
    return createDoc(conn, collection, id, data);
  }

  async submitJson0Op<T>(collection: string, id: string, build: (op: Json0OpBuilder<T>) => void): Promise<boolean> {
    const conn = this.server.connect();
    return submitJson0Op(conn, collection, id, build);
  }
}
