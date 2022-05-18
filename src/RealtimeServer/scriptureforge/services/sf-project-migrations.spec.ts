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
    it('adds shareEnabled and shareLevel to translate config', async () => {
      const env = new TestEnvironment(4);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        translateConfig: { translationSuggestionsEnabled: false }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.shareEnabled).not.toBeDefined();
      expect(projectDoc.data.translateConfig.shareLevel).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.shareEnabled).toBe(false);
      expect(projectDoc.data.translateConfig.shareLevel).toBe('specific');
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
    it('adds default font and font size', async () => {
      const env = new TestEnvironment(6);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {});
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.defaultFontSize).toBeUndefined();
      expect(projectDoc.data.defaultFont).toBeUndefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.defaultFontSize).toBe(10);
      expect(projectDoc.data.defaultFont).toBe('Arial');
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
      { _id: SF_PROJECTS_COLLECTION, collection: SF_PROJECTS_COLLECTION, version }
    ]);
    this.server = new RealtimeServer(
      'TEST',
      false,
      [new SFProjectService()],
      SF_PROJECTS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
  }
}
