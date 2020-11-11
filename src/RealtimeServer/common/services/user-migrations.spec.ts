import ShareDB = require('sharedb');
import ShareDBMingo = require('sharedb-mingo-memory');
import { instance, mock, when } from 'ts-mockito';
import { USERS_COLLECTION } from '../../common/models/user';
import { MetadataDB } from '../metadata-db';
import { SystemRole } from '../models/system-role';
import { RealtimeServer } from '../realtime-server';
import { SchemaVersionRepository } from '../schema-version-repository';
import { createDoc, fetchDoc } from '../utils/test-utils';
import { UserService } from './user-service';

describe('UserMigrations', () => {
  describe('version 1', () => {
    it('migrates docs', async () => {
      const env = new TestEnvironment(0);
      const conn = env.server.connect();
      await createDoc(conn, USERS_COLLECTION, 'user01', {
        name: 'User 01',
        email: 'user01@example.com',
        role: SystemRole.SystemAdmin,
        isDisplayNameConfirmed: true,
        authId: 'auth01',
        displayName: 'User 01',
        avatarUrl: '',
        sites: {
          TEST: {
            projects: []
          }
        }
      });
      await env.server.migrateIfNecessary();

      const userDoc = await fetchDoc(conn, USERS_COLLECTION, 'user01');
      expect(userDoc.data.sites['TEST'].projects.length).toBe(0);
      expect(userDoc.data.sites['TEST'].resources.length).toBe(0);
    });
  });
});

class TestEnvironment {
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);
  readonly server: RealtimeServer;

  constructor(version: number) {
    const ShareDBMingoType = MetadataDB(ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB));
    this.db = new ShareDBMingoType();
    when(this.mockedSchemaVersionRepository.getAll()).thenResolve([
      { _id: USERS_COLLECTION, collection: USERS_COLLECTION, version }
    ]);
    this.server = new RealtimeServer(
      'TEST',
      [new UserService()],
      USERS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
  }
}
