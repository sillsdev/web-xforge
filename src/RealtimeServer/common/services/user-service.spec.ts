import ShareDB = require('sharedb');
import ShareDBMingo = require('sharedb-mingo-memory');
import { instance, mock } from 'ts-mockito';
import { SystemRole } from '../models/system-role';
import { User, USER_PROFILES_COLLECTION, USERS_COLLECTION } from '../models/user';
import { RealtimeServer } from '../realtime-server';
import { SchemaVersionRepository } from '../schema-version-repository';
import { clientConnect, createDoc, fetchDoc, submitJson0Op, submitOp } from '../utils/test-utils';
import { UserService } from './user-service';

describe('UserService', () => {
  it('allows system admin to view others', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'user01', SystemRole.SystemAdmin);
    await expect(fetchDoc(conn, USERS_COLLECTION, 'user02')).resolves.not.toThrow();
  });

  it('allows system admin to edit others', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'user01', SystemRole.SystemAdmin);
    await expect(submitOp(conn, USERS_COLLECTION, 'user02', [])).resolves.not.toThrow();
  });

  it('allows user to view itself', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'user02', SystemRole.User);
    await expect(fetchDoc(conn, USERS_COLLECTION, 'user02')).resolves.not.toThrow();
  });

  it('allows user to edit itself', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'user02', SystemRole.User);
    await expect(submitOp(conn, USERS_COLLECTION, 'user02', [])).resolves.not.toThrow();
  });

  it('does not allow user to view others', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'user02', SystemRole.User);
    await expect(fetchDoc(conn, USERS_COLLECTION, 'user01')).rejects.toThrow();
  });

  it('does not allow user to edit others', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'user02', SystemRole.User);
    await expect(submitOp(conn, USERS_COLLECTION, 'user01', [])).rejects.toThrow();
  });

  it('allows user to view other user profiles', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'user02', SystemRole.User);
    await expect(fetchDoc(conn, USER_PROFILES_COLLECTION, 'user01')).resolves.not.toThrow();
  });

  it('allows system admin to edit immutable properties', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'user01', SystemRole.SystemAdmin);
    await expect(
      submitJson0Op<User>(conn, USERS_COLLECTION, 'user02', ops => ops.set<string>(u => u.role, SystemRole.SystemAdmin))
    ).resolves.not.toThrow();
  });

  it('does not allow user to edit immutable properties', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'user02', SystemRole.User);
    await expect(
      submitJson0Op<User>(conn, USERS_COLLECTION, 'user02', ops => ops.set<string>(u => u.role, SystemRole.SystemAdmin))
    ).rejects.toThrow();
  });
});

class TestEnvironment {
  readonly service: UserService;
  readonly server: RealtimeServer;
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);

  constructor() {
    this.service = new UserService();
    const ShareDBMingoType = ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB);
    this.db = new ShareDBMingoType();
    this.server = new RealtimeServer(
      'TEST',
      [this.service],
      'projects',
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
  }

  async createData(): Promise<void> {
    const conn = this.server.connect();
    await createDoc<User>(conn, USERS_COLLECTION, 'user01', {
      name: 'User 01',
      email: 'user01@example.com',
      role: SystemRole.SystemAdmin,
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
      sites: {}
    });
  }
}
