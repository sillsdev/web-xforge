import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock } from 'ts-mockito';
import { SFProject, SF_PROJECTS_COLLECTION, SF_PROJECT_PROFILES_COLLECTION } from '../models/sf-project';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { clientConnect, createDoc, fetchDoc } from '../../common/utils/test-utils';
import { CheckingShareLevel } from '../models/checking-config';
import { TranslateShareLevel } from '../models/translate-config';
import { SystemRole } from '../../common/models/system-role';
import { SFProjectService } from './sf-project-service';

describe('SFProjectService', () => {
  it('allows user on project to see profile', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'observer');
    await expect(fetchDoc(conn, SF_PROJECT_PROFILES_COLLECTION, 'project01')).resolves.not.toThrow();
  });

  it('does not allow non-paratext user to see project', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'observer');
    await expect(fetchDoc(conn, env.collection, 'project01')).rejects.toThrow();
  });

  it('allows paratext user to see project', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'translator');
    await expect(fetchDoc(conn, env.collection, 'project01')).resolves.not.toThrow();
  });

  it('allows system admin user to see project', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'sys_admin', SystemRole.SystemAdmin);
    await expect(fetchDoc(conn, env.collection, 'project01')).resolves.not.toThrow();
  });

  it('does not allow non-member to view profile', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'non_member');
    await expect(fetchDoc(conn, SF_PROJECT_PROFILES_COLLECTION, 'project01')).rejects.toThrow();
  });
});

class TestEnvironment {
  readonly collection = SF_PROJECTS_COLLECTION;

  readonly service: SFProjectService;
  readonly server: RealtimeServer;
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);
  constructor() {
    this.service = new SFProjectService();
    const ShareDBMingoType = ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB);
    this.db = new ShareDBMingoType();
    this.server = new RealtimeServer(
      'TEST',
      false,
      [this.service],
      SF_PROJECTS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
  }

  async createData(): Promise<void> {
    const conn = this.server.connect();

    await createDoc<SFProject>(conn, SF_PROJECTS_COLLECTION, 'project01', {
      name: 'Project 01',
      shortName: 'P01',
      paratextId: 'Project01Id',
      userRoles: {
        projectAdmin: 'pt_administrator',
        translator: 'pt_translator',
        observer: 'sf_observer'
      },
      paratextUsers: [
        { sfUserId: 'projectAdmin', username: 'ptprojectAdmin', opaqueUserId: 'opaqueprojectAdmin' },
        { sfUserId: 'translator', username: 'pttranslator', opaqueUserId: 'opaquetranslator' }
      ],
      userPermissions: {},
      sync: {
        queuedCount: 0
      },
      checkingConfig: {
        checkingEnabled: false,
        shareEnabled: false,
        shareLevel: CheckingShareLevel.Specific,
        usersSeeEachOthersResponses: false
      },
      translateConfig: {
        translationSuggestionsEnabled: false,
        shareEnabled: false,
        shareLevel: TranslateShareLevel.Specific
      },
      writingSystem: {
        tag: 'en'
      },
      texts: [
        {
          bookNum: 1,
          hasSource: false,
          chapters: [
            {
              number: 1,
              lastVerse: 3,
              isValid: true,
              permissions: {
                projectAdmin: 'write',
                translator: 'write'
              }
            }
          ],
          permissions: {
            projectAdmin: 'write',
            translator: 'write'
          }
        }
      ]
    });
  }
}
