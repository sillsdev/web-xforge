import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock, when } from 'ts-mockito';
import { MetadataDB } from '../../common/metadata-db';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { createDoc, fetchDoc } from '../../common/utils/test-utils';
import { SF_PROJECTS_COLLECTION } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import { TextInfoPermission } from '../models/text-info-permission';
import { SF_PROJECT_MIGRATIONS } from './sf-project-migrations';
import { SFProjectService } from './sf-project-service';

describe('SFProjectMigrations', () => {
  describe('version 1', () => {
    it('migrates docs', async () => {
      const env = new TestEnvironment(0);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        texts: [
          { bookNum: 40, chapters: [{ number: 1 }, { number: 2, isValid: true }] },
          { bookNum: 41, chapters: [{ number: 1 }, { number: 2 }] }
        ]
      });
      await env.server.migrateIfNecessary();

      const projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.texts[0].chapters[0].isValid).toBe(true);
      expect(projectDoc.data.texts[0].chapters[1].isValid).toBe(true);
      expect(projectDoc.data.texts[1].chapters[0].isValid).toBe(true);
      expect(projectDoc.data.texts[1].chapters[1].isValid).toBe(true);
    });
  });
  describe('version 2', () => {
    it('migrates docs', async () => {
      const env = new TestEnvironment(1);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        texts: [
          { bookNum: 40, chapters: [{ number: 1 }, { number: 2, isValid: true }], hasSource: true },
          { bookNum: 41, chapters: [{ number: 1 }, { number: 2, isValid: true }], hasSource: false }
        ],
        userRoles: {
          user01: SFProjectRole.ParatextAdministrator,
          user02: SFProjectRole.ParatextTranslator,
          user03: SFProjectRole.ParatextConsultant,
          user04: SFProjectRole.ParatextObserver
        }
      });
      await env.server.migrateIfNecessary();

      const projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.texts[0].permissions['user01']).toBe(TextInfoPermission.Write);
      expect(projectDoc.data.texts[0].permissions['user02']).toBe(TextInfoPermission.Write);
      expect(projectDoc.data.texts[0].permissions['user03']).toBe(TextInfoPermission.Read);
      expect(projectDoc.data.texts[0].permissions['user04']).toBe(TextInfoPermission.Read);
      expect(Object.keys(projectDoc.data.texts[0].permissions).length).toBe(4);
      expect(projectDoc.data.texts[1].permissions['user01']).toBe(TextInfoPermission.Write);
      expect(projectDoc.data.texts[1].permissions['user02']).toBe(TextInfoPermission.Write);
      expect(projectDoc.data.texts[1].permissions['user03']).toBe(TextInfoPermission.Read);
      expect(projectDoc.data.texts[1].permissions['user04']).toBe(TextInfoPermission.Read);
      expect(Object.keys(projectDoc.data.texts[1].permissions).length).toBe(4);
    });
  });
  describe('version 3', () => {
    it('migrates docs', async () => {
      const env = new TestEnvironment(1, 3);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        texts: [
          { bookNum: 40, chapters: [{ number: 1 }, { number: 2, isValid: true }], hasSource: true },
          { bookNum: 41, chapters: [{ number: 1 }, { number: 2, isValid: true }], hasSource: false }
        ],
        userRoles: {
          user01: SFProjectRole.ParatextAdministrator,
          user02: SFProjectRole.ParatextTranslator,
          user03: SFProjectRole.ParatextConsultant,
          user04: SFProjectRole.ParatextObserver
        }
      });
      await env.server.migrateIfNecessary();

      const projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.texts[0].chapters[0].permissions['user01']).toBe(TextInfoPermission.Write);
      expect(projectDoc.data.texts[0].chapters[0].permissions['user02']).toBe(TextInfoPermission.Write);
      expect(projectDoc.data.texts[0].chapters[0].permissions['user03']).toBe(TextInfoPermission.Read);
      expect(projectDoc.data.texts[0].chapters[0].permissions['user04']).toBe(TextInfoPermission.Read);
      expect(Object.keys(projectDoc.data.texts[0].chapters[0].permissions).length).toBe(4);
      expect(projectDoc.data.texts[0].chapters[1].permissions['user01']).toBe(TextInfoPermission.Write);
      expect(projectDoc.data.texts[0].chapters[1].permissions['user02']).toBe(TextInfoPermission.Write);
      expect(projectDoc.data.texts[0].chapters[1].permissions['user03']).toBe(TextInfoPermission.Read);
      expect(projectDoc.data.texts[0].chapters[1].permissions['user04']).toBe(TextInfoPermission.Read);
      expect(Object.keys(projectDoc.data.texts[1].permissions).length).toBe(4);
      expect(projectDoc.data.texts[1].chapters[0].permissions['user01']).toBe(TextInfoPermission.Write);
      expect(projectDoc.data.texts[1].chapters[0].permissions['user02']).toBe(TextInfoPermission.Write);
      expect(projectDoc.data.texts[1].chapters[0].permissions['user03']).toBe(TextInfoPermission.Read);
      expect(projectDoc.data.texts[1].chapters[0].permissions['user04']).toBe(TextInfoPermission.Read);
      expect(Object.keys(projectDoc.data.texts[1].chapters[0].permissions).length).toBe(4);
      expect(projectDoc.data.texts[1].chapters[1].permissions['user01']).toBe(TextInfoPermission.Write);
      expect(projectDoc.data.texts[1].chapters[1].permissions['user02']).toBe(TextInfoPermission.Write);
      expect(projectDoc.data.texts[1].chapters[1].permissions['user03']).toBe(TextInfoPermission.Read);
      expect(projectDoc.data.texts[1].chapters[1].permissions['user04']).toBe(TextInfoPermission.Read);
      expect(Object.keys(projectDoc.data.texts[1].chapters[1].permissions).length).toBe(4);
    });
  });
  describe('version 4', () => {
    it('adds userPermissions property to project docs', async () => {
      const env = new TestEnvironment(3);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {});
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.userPermissions).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.userPermissions).toBeDefined();
    });
  });
  describe('version 5', () => {
    it('adds shareEnabled to translate config', async () => {
      const env = new TestEnvironment(4);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        translateConfig: { translationSuggestionsEnabled: false }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.shareEnabled).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.shareEnabled).toBe(false);
    });
  });

  describe('version 6', () => {
    it('adds editable property', async () => {
      const env = new TestEnvironment(5);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {});
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.editable).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.editable).toBe(true);
    });
  });

  describe('version 7', () => {
    it('moves tag icon to translateConfig class', async () => {
      const env = new TestEnvironment(6);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        tagIcon: '01flag1',
        translateConfig: {}
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.tagIcon).toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.tagIcon).toBeUndefined();
    });
  });

  describe('version 8', () => {
    it('removes percentCompleted from project doc', async () => {
      const env = new TestEnvironment(7);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        sync: { percentCompleted: 1 }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.sync.percentCompleted).toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.sync.percentCompleted).not.toBeDefined();
    });
  });

  describe('version 9', () => {
    it('removes shareLevel from translate and checking config', async () => {
      const env = new TestEnvironment(8);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        translateConfig: { shareLevel: 'anyone' },
        checkingConfig: { shareLevel: 'anyone' }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.shareLevel).toBeDefined();
      expect(projectDoc.data.checkingConfig.shareLevel).toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.shareLevel).not.toBeDefined();
      expect(projectDoc.data.checkingConfig.shareLevel).not.toBeDefined();
    });
  });

  describe('version 10', () => {
    it('adds preTranslate to translate config', async () => {
      const env = new TestEnvironment(9);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        translateConfig: { translationSuggestionsEnabled: false }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.preTranslate).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.preTranslate).toBe(false);
    });
  });
});

describe('version 11', () => {
  it('adds biblical terms properties', async () => {
    const env = new TestEnvironment(10);
    const conn = env.server.connect();
    await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {});
    let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
    expect(projectDoc.data.biblicalTermsConfig).not.toBeDefined();

    await env.server.migrateIfNecessary();

    projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
    expect(projectDoc.data.biblicalTermsConfig.biblicalTermsEnabled).toBe(false);
    expect(projectDoc.data.biblicalTermsConfig.hasRenderings).toBe(false);
  });
});

describe('version 12', () => {
  it('adds draftConfig to translateConfig', async () => {
    const env = new TestEnvironment(11);
    const conn = env.server.connect();
    await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', { translateConfig: {} });
    let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
    expect(projectDoc.data.translateConfig.draftConfig).not.toBeDefined();

    await env.server.migrateIfNecessary();

    projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
    expect(projectDoc.data.translateConfig.draftConfig).toBeDefined();
  });

  describe('version 13', () => {
    it('adds lastSelectedBooks to draftConfig', async () => {
      const env = new TestEnvironment(12);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', { translateConfig: { draftConfig: {} } });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.lastSelectedBooks).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.lastSelectedBooks).toBeDefined();
    });
  });

  describe('version 14', () => {
    it('adds trainOnEnabled to draftConfig', async () => {
      const env = new TestEnvironment(13);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        translateConfig: { draftConfig: { lastSelectedBooks: [] } }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.trainOnEnabled).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.trainOnEnabled).toBe(false);
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
      { _id: SF_PROJECTS_COLLECTION, collection: SF_PROJECTS_COLLECTION, version: startVersion }
    ]);
    this.server = new RealtimeServer(
      'TEST',
      false,
      true,
      [new SFProjectService(SF_PROJECT_MIGRATIONS.filter(m => m.VERSION <= endVersion))],
      SF_PROJECTS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
  }
}
