import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock, when } from 'ts-mockito';
import { MetadataDB } from '../../common/metadata-db';
import { SystemRole } from '../../common/models/system-role';
import { USERS_COLLECTION } from '../../common/models/user';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { createDoc, fetchDoc } from '../../common/utils/test-utils';
import { UserService } from './user-service';

describe('SFProjectMigrations', () => {
  describe('version 1', () => {
    it('migrates users with a role', async () => {
      const env = new TestEnvironment(0);
      const conn = env.server.connect();
      await createDoc(conn, USERS_COLLECTION, 'user01', {
        roles: [SystemRole.SystemAdmin]
      });
      await env.server.migrateIfNecessary();

      const projectDoc = await fetchDoc(conn, USERS_COLLECTION, 'user01');
      expect(projectDoc.data.roles[0]).toBe(SystemRole.SystemAdmin);
      expect(projectDoc.data.role).toBeUndefined();
    });
    it('migrates users without a role', async () => {
      const env = new TestEnvironment(0);
      const conn = env.server.connect();
      await createDoc(conn, USERS_COLLECTION, 'user01', {});
      await env.server.migrateIfNecessary();

      const projectDoc = await fetchDoc(conn, USERS_COLLECTION, 'user01');
      expect(projectDoc.data.roles.length).toBe(0);
      expect(projectDoc.data.role).toBeUndefined();
    });
  });
});

class TestEnvironment {
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);
  readonly server: RealtimeServer;

  /**
   * @param version The version the document is currently at (so migrations prior to this version will not be run
   * on the document)
   */
  constructor(version: number) {
    const ShareDBMingoType = MetadataDB(ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB));
    this.db = new ShareDBMingoType();
    when(this.mockedSchemaVersionRepository.getAll()).thenResolve([
      { _id: USERS_COLLECTION, collection: USERS_COLLECTION, version }
    ]);
    this.server = new RealtimeServer(
      'TEST',
      false,
      true,
      [new UserService()],
      USERS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
  }
}
