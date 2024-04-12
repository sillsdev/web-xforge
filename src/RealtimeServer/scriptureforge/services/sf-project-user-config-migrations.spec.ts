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
    it('adds numSuggestions property', async () => {
      const env = new TestEnvironment(0);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01', {});
      let userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.numSuggestions).not.toBeDefined();

      await env.server.migrateIfNecessary();

      userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.numSuggestions).toEqual(1);
    });
  });

  describe('version 2', () => {
    it('adds noteRefsRead property', async () => {
      const env = new TestEnvironment(1);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01', {});
      let userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.noteRefsRead).not.toBeDefined();

      await env.server.migrateIfNecessary();

      userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.noteRefsRead).toEqual([]);
    });
  });

  describe('version 3', () => {
    it('adds biblicalTermsEnabled and transliterateBiblicalTerms properties', async () => {
      const env = new TestEnvironment(2);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01', {});
      let userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.biblicalTermsEnabled).not.toBeDefined();
      expect(userConfigDoc.data.transliterateBiblicalTerms).not.toBeDefined();

      await env.server.migrateIfNecessary();

      userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.biblicalTermsEnabled).toEqual(true);
      expect(userConfigDoc.data.transliterateBiblicalTerms).toEqual(false);
    });
  });

  describe('version 4', () => {
    it('adds audioRefsPlayed property', async () => {
      const env = new TestEnvironment(3);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01', {});
      let userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.audioRefsPlayed).not.toBeDefined();

      await env.server.migrateIfNecessary();

      userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.audioRefsPlayed).toEqual([]);
    });
  });

  describe('version 5', () => {
    it('adds editorTabsOpen property', async () => {
      const env = new TestEnvironment(4);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01', {});
      let userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.editorTabsOpen).not.toBeDefined();

      await env.server.migrateIfNecessary();

      userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.editorTabsOpen).toEqual([]);
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
      true,
      [new SFProjectUserConfigService()],
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
  }
}
