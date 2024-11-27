import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock, when } from 'ts-mockito';
import { MetadataDB } from '../../common/metadata-db';
import { Operation } from '../../common/models/project-rights';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { createDoc, fetchDoc } from '../../common/utils/test-utils';
import { SF_PROJECTS_COLLECTION } from '../models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from '../models/sf-project-rights';
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
    it('adds alternateTrainingSourceEnabled to draftConfig', async () => {
      const env = new TestEnvironment(13);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        translateConfig: { draftConfig: { lastSelectedBooks: [] } }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.alternateTrainingSourceEnabled).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.alternateTrainingSourceEnabled).toBe(false);
    });

    it('adds lastSelectedTrainingBooks to draftConfig', async () => {
      const env = new TestEnvironment(13);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', { translateConfig: { draftConfig: {} } });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.lastSelectedTrainingBooks).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.lastSelectedTrainingBooks).toEqual([]);
    });

    it('adds lastSelectedTranslationBooks to draftConfig', async () => {
      const env = new TestEnvironment(13);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', { translateConfig: { draftConfig: {} } });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.lastSelectedTranslationBooks).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.lastSelectedTranslationBooks).toEqual([]);
    });

    it('migrates lastSelectedBooks to lastSelectedTrainingBooks', async () => {
      const env = new TestEnvironment(13);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        translateConfig: { draftConfig: { lastSelectedBooks: [1, 2, 3] } }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.lastSelectedTrainingBooks).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.lastSelectedBooks).not.toBeDefined();
      expect(projectDoc.data.translateConfig.draftConfig.lastSelectedTrainingBooks).toEqual([1, 2, 3]);
    });
  });

  describe('version 15', () => {
    it('adds create resolve property to note tag', async () => {
      const env = new TestEnvironment(14);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        noteTags: [{ tagId: 1, name: 'Tag 01', icon: '01flag1', creatorResolve: false }]
      });

      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.noteTags[0].creatorResolve).toBe(false);

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.noteTags[0].creatorResolve).toBe(true);
    });
  });

  describe('version 16', () => {
    it('adds sendAllSegments to draftConfig', async () => {
      const env = new TestEnvironment(15);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        translateConfig: { draftConfig: {} }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.sendAllSegments).toBeUndefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.sendAllSegments).toBe(false);
    });
  });

  describe('version 17', () => {
    it('adds lastSelectedTrainingDataFiles to draftConfig', async () => {
      const env = new TestEnvironment(16);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', { translateConfig: { draftConfig: {} } });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.lastSelectedTrainingDataFiles).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.lastSelectedTrainingDataFiles).toBeDefined();
    });
    it('adds additionalTrainingData to draftConfig', async () => {
      const env = new TestEnvironment(16);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        translateConfig: { draftConfig: {} }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.additionalTrainingData).toBeUndefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.additionalTrainingData).toBe(false);
    });
  });

  describe('version 18', () => {
    it('adds alternateSourceEnabled to draftConfig', async () => {
      const env = new TestEnvironment(17);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        translateConfig: { draftConfig: {} }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.alternateSourceEnabled).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.alternateSourceEnabled).toBe(false);
    });

    it('sets alternateSourceEnabled to true when an alternate source is present', async () => {
      const env = new TestEnvironment(17);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        translateConfig: { draftConfig: { alternateSource: { projectRef: 'project02' } } }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.alternateSourceEnabled).not.toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.alternateSourceEnabled).toBe(true);
    });
  });

  describe('version 19', () => {
    it('removes sendAllSegments from draftConfig', async () => {
      const env = new TestEnvironment(18);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        translateConfig: { draftConfig: { sendAllSegments: false } }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.sendAllSegments).toBeDefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.sendAllSegments).toBeUndefined();
    });
  });

  describe('version 20', () => {
    it('adds additionalTrainingSourceEnabled to draftConfig', async () => {
      const env = new TestEnvironment(19);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        translateConfig: { draftConfig: {} }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.additionalTrainingSourceEnabled).toBeUndefined();

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.translateConfig.draftConfig.additionalTrainingSourceEnabled).toBe(false);
    });
  });

  describe('version 21', () => {
    it('does not change rolePermissions if it already exists', async () => {
      const env = new TestEnvironment(20);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        rolePermissions: {}
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.rolePermissions).toEqual({});

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.rolePermissions).toEqual({});
    });

    it('does not add permissions if shareEnabled is false for checkingConfig and translateConfig', async () => {
      const env = new TestEnvironment(20);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        checkingConfig: { shareEnabled: false },
        translateConfig: { shareEnabled: false }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.rolePermissions).toBeUndefined();
      expect(projectDoc.data.checkingConfig.shareEnabled).toBe(false);
      expect(projectDoc.data.translateConfig.shareEnabled).toBe(false);

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.rolePermissions).toEqual({});
      expect(projectDoc.data.checkingConfig.shareEnabled).not.toBeDefined();
      expect(projectDoc.data.translateConfig.shareEnabled).not.toBeDefined();
    });

    it('adds permissions if shareEnabled is true for checkingConfig', async () => {
      const env = new TestEnvironment(20);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        checkingConfig: { shareEnabled: true },
        translateConfig: { shareEnabled: false }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.rolePermissions).toBeUndefined();
      expect(projectDoc.data.checkingConfig.shareEnabled).toBe(true);
      expect(projectDoc.data.translateConfig.shareEnabled).toBe(false);

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      const permissions = [SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)];
      expect(projectDoc.data.rolePermissions).toEqual({
        sf_community_checker: permissions
      });
      expect(projectDoc.data.checkingConfig.shareEnabled).not.toBeDefined();
      expect(projectDoc.data.translateConfig.shareEnabled).not.toBeDefined();
    });

    it('adds permissions if shareEnabled is true for translateConfig', async () => {
      const env = new TestEnvironment(20);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        checkingConfig: { shareEnabled: false },
        translateConfig: { shareEnabled: true }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.rolePermissions).toBeUndefined();
      expect(projectDoc.data.checkingConfig.shareEnabled).toBe(false);
      expect(projectDoc.data.translateConfig.shareEnabled).toBe(true);

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      const permissions = [SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)];
      expect(projectDoc.data.rolePermissions).toEqual({
        sf_commenter: permissions,
        sf_observer: permissions
      });
      expect(projectDoc.data.checkingConfig.shareEnabled).not.toBeDefined();
      expect(projectDoc.data.translateConfig.shareEnabled).not.toBeDefined();
    });

    it('adds permissions if shareEnabled is true for checkingConfig and translateConfig', async () => {
      const env = new TestEnvironment(20);
      const conn = env.server.connect();
      await createDoc(conn, SF_PROJECTS_COLLECTION, 'project01', {
        checkingConfig: { shareEnabled: true },
        translateConfig: { shareEnabled: true }
      });
      let projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      expect(projectDoc.data.rolePermissions).toBeUndefined();
      expect(projectDoc.data.checkingConfig.shareEnabled).toBe(true);
      expect(projectDoc.data.translateConfig.shareEnabled).toBe(true);

      await env.server.migrateIfNecessary();

      projectDoc = await fetchDoc(conn, SF_PROJECTS_COLLECTION, 'project01');
      const permissions = [SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.UserInvites, Operation.Create)];
      expect(projectDoc.data.rolePermissions).toEqual({
        sf_community_checker: permissions,
        sf_commenter: permissions,
        sf_observer: permissions
      });
      expect(projectDoc.data.checkingConfig.shareEnabled).not.toBeDefined();
      expect(projectDoc.data.translateConfig.shareEnabled).not.toBeDefined();
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
