import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock, when } from 'ts-mockito';
import { MetadataDB } from '../../common/metadata-db';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { createDoc, fetchDoc } from '../../common/utils/test-utils';
import { SF_PROJECT_USER_CONFIGS_COLLECTION } from '../models/sf-project-user-config';
import { SF_PROJECT_USER_CONFIG_MIGRATIONS } from './sf-project-user-config-migrations';
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
      expect(userConfigDoc.data.audioRefsPlayed).toBeDefined();
    });
  });

  describe('version 5', () => {
    it('deletes audioRefsPlayed property', async () => {
      const env = new TestEnvironment(4);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01', { audioRefsPlayed: [] });
      let userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.audioRefsPlayed).toBeDefined();

      await env.server.migrateIfNecessary();

      userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.audioRefsPlayed).not.toBeDefined();
    });
  });

  describe('version 6', () => {
    it('adds editorTabsOpen property', async () => {
      const env = new TestEnvironment(5);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01', {});
      let userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.editorTabsOpen).not.toBeDefined();

      await env.server.migrateIfNecessary();

      userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.editorTabsOpen).toEqual([]);
    });
  });

  describe('version 7', () => {
    it('creates the tab in the source if there are source tabs', async () => {
      const env = new TestEnvironment(6);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01', {
        biblicalTermsEnabled: true,
        editorTabsOpen: [{ groupId: 'source' }]
      });
      let userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.editorTabsOpen.length).toBe(1);
      expect(userConfigDoc.data.biblicalTermsEnabled).toBeDefined();

      await env.server.migrateIfNecessary();

      userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.biblicalTermsEnabled).not.toBeDefined();
      expect(userConfigDoc.data.editorTabsOpen.length).toBe(2);
      expect(userConfigDoc.data.editorTabsOpen[1]).toEqual({
        tabType: 'biblical-terms',
        groupId: 'source',
        isSelected: false
      });
    });

    it('creates the tab in the target if there are no source tabs', async () => {
      const env = new TestEnvironment(6);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01', {
        biblicalTermsEnabled: true,
        editorTabsOpen: []
      });
      let userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.editorTabsOpen.length).toBe(0);
      expect(userConfigDoc.data.biblicalTermsEnabled).toBeDefined();

      await env.server.migrateIfNecessary();

      userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.biblicalTermsEnabled).not.toBeDefined();
      expect(userConfigDoc.data.editorTabsOpen.length).toBe(1);
      expect(userConfigDoc.data.editorTabsOpen[0]).toEqual({
        tabType: 'biblical-terms',
        groupId: 'target',
        isSelected: false
      });
    });

    it('does not create a tab if one already exists', async () => {
      const env = new TestEnvironment(6);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01', {
        biblicalTermsEnabled: true,
        editorTabsOpen: [
          {
            tabType: 'biblical-terms',
            groupId: 'target',
            isSelected: false
          }
        ]
      });
      let userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.editorTabsOpen.length).toBe(1);
      expect(userConfigDoc.data.biblicalTermsEnabled).toBeDefined();

      await env.server.migrateIfNecessary();

      userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.biblicalTermsEnabled).not.toBeDefined();
      expect(userConfigDoc.data.editorTabsOpen.length).toBe(1);
    });

    it('does not migrate if already migrated', async () => {
      const env = new TestEnvironment(6);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01', {});
      let userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.biblicalTermsEnabled).not.toBeDefined();
      expect(userConfigDoc.version).toBe(1);

      await env.server.migrateIfNecessary();

      userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.biblicalTermsEnabled).not.toBeDefined();
      expect(userConfigDoc.version).toBe(1);
    });

    it('removes the biblicalTermsEnabled property', async () => {
      const env = new TestEnvironment(6);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01', {
        biblicalTermsEnabled: false,
        editorTabsOpen: []
      });
      let userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.editorTabsOpen.length).toBe(0);
      expect(userConfigDoc.data.biblicalTermsEnabled).toBeDefined();

      await env.server.migrateIfNecessary();

      userConfigDoc = await fetchDoc(conn, SF_PROJECT_USER_CONFIGS_COLLECTION, 'project01:user01');
      expect(userConfigDoc.data.editorTabsOpen.length).toBe(0);
      expect(userConfigDoc.data.biblicalTermsEnabled).not.toBeDefined();
    });
  });
});

class TestEnvironment {
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);
  readonly server: RealtimeServer;

  /**
   * @param startVersion The version the document is currently at (so migrations prior to this version will not be run
   * on the document)
   * @param endVersion The version the document should be migrated to
   */
  constructor(startVersion: number, endVersion: number = startVersion + 1) {
    const ShareDBMingoType = MetadataDB(ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB));
    this.db = new ShareDBMingoType();
    when(this.mockedSchemaVersionRepository.getAll()).thenResolve([
      { _id: SF_PROJECT_USER_CONFIGS_COLLECTION, collection: SF_PROJECT_USER_CONFIGS_COLLECTION, version: startVersion }
    ]);
    this.server = new RealtimeServer(
      'TEST',
      false,
      true,
      [new SFProjectUserConfigService(SF_PROJECT_USER_CONFIG_MIGRATIONS.filter(m => m.VERSION <= endVersion))],
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
  }
}
