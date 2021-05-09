import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock, when } from 'ts-mockito';
import { MetadataDB } from '../../common/metadata-db';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { createDoc, fetchDoc } from '../../common/utils/test-utils';
import { SF_PROJECT_USER_CONFIGS_COLLECTION } from '../models/sf-project-user-config';
import { SFProjectUserConfigService } from './sf-project-user-config-service';

describe('SFProjectUserConfigMigrations', () => {
  describe('version 1', () => {
    it('migrates docs', async () => {
      const env = new TestEnvironment(0);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01', {});
      await env.server.migrateIfNecessary();

      const userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.numSuggestions).toEqual(1);
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
      { _id: SF_PROJECT_USER_CONFIGS_COLLECTION, collection: SF_PROJECT_USER_CONFIGS_COLLECTION, version }
    ]);
    this.server = new RealtimeServer(
      'TEST',
      false,
      [new SFProjectUserConfigService()],
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
  }
}
