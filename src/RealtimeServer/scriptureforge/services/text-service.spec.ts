import { Delta } from 'rich-text';
import * as RichText from 'rich-text';
import ShareDB = require('sharedb');
import ShareDBMingo = require('sharedb-mingo-memory');
import { instance, mock } from 'ts-mockito';
import { SystemRole } from '../../common/models/system-role';
import { User, USERS_COLLECTION } from '../../common/models/user';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { allowAll, clientConnect, createDoc, fetchDoc, submitOp } from '../../common/utils/test-utils';
import { CheckingShareLevel } from '../models/checking-config';
import { SF_PROJECTS_COLLECTION, SFProject } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import { getTextDocId, TextData, TEXTS_COLLECTION } from '../models/text-data';
import { TextService } from './text-service';

ShareDB.types.register(RichText.type);

describe('TextService', () => {
  it('allows member to view text', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'observer');
    await expect(fetchDoc(conn, TEXTS_COLLECTION, getTextDocId('project01', 40, 1))).resolves.not.toThrow();
  });

  it('allows translator to edit text', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'translator');
    await expect(
      submitOp(conn, TEXTS_COLLECTION, getTextDocId('project01', 40, 1), new Delta())
    ).resolves.not.toThrow();
  });

  it('allows user with resource access to view text', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'resource_access');
    await expect(fetchDoc(conn, TEXTS_COLLECTION, getTextDocId('project01', 40, 1))).resolves.not.toThrow();
  });

  it('does not allow non-member to view text', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'nonmember');
    await expect(fetchDoc(conn, TEXTS_COLLECTION, getTextDocId('project01', 40, 1))).rejects.toThrow();
  });

  it('does not allow observer to edit text', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'observer');
    await expect(submitOp(conn, TEXTS_COLLECTION, getTextDocId('project01', 40, 1), new Delta())).rejects.toThrow();
  });
});

class TestEnvironment {
  readonly service: TextService;
  readonly server: RealtimeServer;
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);

  constructor() {
    this.service = new TextService();
    const ShareDBMingoType = ShareDBMingo.extendMemoryDB(ShareDB.MemoryDB);
    this.db = new ShareDBMingoType();
    this.server = new RealtimeServer(
      'TEST',
      [this.service],
      SF_PROJECTS_COLLECTION,
      this.db,
      instance(this.mockedSchemaVersionRepository)
    );
    allowAll(this.server, USERS_COLLECTION);
    allowAll(this.server, SF_PROJECTS_COLLECTION);
  }

  async createData(): Promise<void> {
    const conn = this.server.connect();
    await createDoc<User>(conn, USERS_COLLECTION, 'translator', {
      name: 'User 01',
      email: 'user01@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth01',
      displayName: 'User 01',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<User>(conn, USERS_COLLECTION, 'observer', {
      name: 'User 02',
      email: 'user02@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth02',
      displayName: 'User 02',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<User>(conn, USERS_COLLECTION, 'nonmember', {
      name: 'User 03',
      email: 'user03@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth03',
      displayName: 'User 03',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<User>(conn, USERS_COLLECTION, 'resource_access', {
      name: 'User 04',
      email: 'user04@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth04',
      displayName: 'User 04',
      avatarUrl: '',
      sites: {
        TEST: {
          projects: [],
          resources: ['project01']
        }
      }
    });

    await createDoc<SFProject>(conn, SF_PROJECTS_COLLECTION, 'project01', {
      name: 'Project 01',
      shortName: 'PT01',
      paratextId: 'pt01',
      writingSystem: { tag: 'qaa' },
      translateConfig: { translationSuggestionsEnabled: false },
      checkingConfig: {
        checkingEnabled: false,
        usersSeeEachOthersResponses: true,
        shareEnabled: true,
        shareLevel: CheckingShareLevel.Specific
      },
      texts: [],
      sync: { queuedCount: 0 },
      userRoles: {
        translator: SFProjectRole.ParatextTranslator,
        observer: SFProjectRole.ParatextObserver
      }
    });

    await createDoc<TextData>(conn, TEXTS_COLLECTION, getTextDocId('project01', 40, 1), new Delta(), 'rich-text');
  }
}
