import { CollectionInfo, Db, ListCollectionsCursor } from 'mongodb';
import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { anything, instance, mock, objectContaining, verify, when } from 'ts-mockito';
import { SystemRole } from '../models/system-role';
import { User, USER_PROFILES_COLLECTION, USERS_COLLECTION } from '../models/user';
import { createTestUser } from '../models/user-test-data';
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
      submitJson0Op<User>(conn, USERS_COLLECTION, 'user02', ops =>
        ops.set<string[]>(u => u.roles, [SystemRole.SystemAdmin])
      )
    ).resolves.not.toThrow();
  });

  it('does not allow user to edit immutable properties', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'user02', SystemRole.User);
    await expect(
      submitJson0Op<User>(conn, USERS_COLLECTION, 'user02', ops =>
        ops.set<string[]>(u => u.roles, [SystemRole.SystemAdmin])
      )
    ).rejects.toThrow();
  });

  it('adds the validation schema to an existing collection', async () => {
    const env = new TestEnvironment(true);
    await env.service.addValidationSchema(instance(env.mongo));

    verify(
      env.mongo.command(
        objectContaining({
          validator: {
            $jsonSchema: env.service.validationSchema
          }
        })
      )
    ).once();
    verify(env.mongo.createCollection(env.service.collection)).never();
  });

  it('adds the validation schema and creates the collection if it is missing', async () => {
    const env = new TestEnvironment();
    await env.service.addValidationSchema(instance(env.mongo));

    verify(
      env.mongo.command(
        objectContaining({
          validator: {
            $jsonSchema: env.service.validationSchema
          }
        })
      )
    ).once();
    verify(env.mongo.createCollection(env.service.collection)).once();
  });
});

class TestEnvironment {
  readonly service: UserService;
  readonly server: RealtimeServer;
  readonly db: ShareDBMingo;
  readonly mongo = mock(Db);
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);

  constructor(collectionExists = false) {
    this.service = new UserService();
    const ShareDBMingoType = ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB);
    this.db = new ShareDBMingoType();
    this.server = new RealtimeServer(
      'TEST',
      false,
      false,
      [this.service],
      'projects',
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
    // This is used by addValidationSchema()
    const cursor: ListCollectionsCursor<CollectionInfo> = mock(ListCollectionsCursor);
    when(cursor.hasNext()).thenResolve(collectionExists);
    when(this.mongo.listCollections(anything())).thenReturn(instance(cursor));
  }

  async createData(): Promise<void> {
    const conn = this.server.connect();
    await createDoc<User>(
      conn,
      USERS_COLLECTION,
      'user01',
      createTestUser(
        {
          roles: [SystemRole.SystemAdmin]
        },
        1
      )
    );

    await createDoc<User>(conn, USERS_COLLECTION, 'user02', createTestUser({}, 2));
  }
}
