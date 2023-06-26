import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock } from 'ts-mockito';
import { SystemRole } from '../../common/models/system-role';
import { User, USERS_COLLECTION } from '../../common/models/user';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import { allowAll, clientConnect, createDoc, fetchDoc, submitJson0Op } from '../../common/utils/test-utils';
import { CheckingAnswerExport } from '../models/checking-config';
import { SF_PROJECTS_COLLECTION, SFProject } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import { TextAudio, TEXT_AUDIO_COLLECTION } from '../models/text-audio';
import { getTextDocId } from '../models/text-data';
import { TextAudioService } from './text-audio-service';

describe('TextAudioService', () => {
  it('allows member to view text audio timings', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'observer');
    await expect(fetchDoc(conn, TEXT_AUDIO_COLLECTION, getTextDocId('project01', 40, 1))).resolves.not.toThrow();
  });

  it('allows administrator to edit text audio timings', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'administrator');
    await expect(
      submitJson0Op<TextAudio>(conn, TEXT_AUDIO_COLLECTION, getTextDocId('project01', 40, 1), op =>
        op.add(n => n.timings, {
          textRef: '2',
          from: 1.0,
          to: 1.5
        })
      )
    ).resolves.not.toThrow();
  });

  it('does not allow non-member to view text audio timings', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'nonmember');
    await expect(fetchDoc(conn, TEXT_AUDIO_COLLECTION, getTextDocId('project01', 40, 1))).rejects.toThrow();
  });

  it('does not allow observer to edit text audio timings', async () => {
    const env = new TestEnvironment();
    await env.createData();

    const conn = clientConnect(env.server, 'observer');
    await expect(
      submitJson0Op<TextAudio>(conn, TEXT_AUDIO_COLLECTION, getTextDocId('project01', 40, 1), op =>
        op.add(n => n.timings, {
          textRef: '2',
          from: 1.0,
          to: 1.5
        })
      )
    ).rejects.toThrow();
  });
});

class TestEnvironment {
  readonly service: TextAudioService;
  readonly server: RealtimeServer;
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);

  constructor() {
    this.service = new TextAudioService();
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
    allowAll(this.server, USERS_COLLECTION);
    allowAll(this.server, SF_PROJECTS_COLLECTION);
  }

  async createData(): Promise<void> {
    const conn = this.server.connect();
    await createDoc<User>(conn, USERS_COLLECTION, 'administrator', {
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

    await createDoc<SFProject>(conn, SF_PROJECTS_COLLECTION, 'project01', {
      name: 'Project 01',
      shortName: 'PT01',
      paratextId: 'pt01',
      writingSystem: { tag: 'qaa' },
      translateConfig: {
        translationSuggestionsEnabled: false,
        shareEnabled: true
      },
      checkingConfig: {
        checkingEnabled: false,
        usersSeeEachOthersResponses: true,
        shareEnabled: true,
        answerExportMethod: CheckingAnswerExport.MarkedForExport
      },
      texts: [],
      noteTags: [],
      sync: { queuedCount: 0 },
      editable: true,
      userRoles: {
        administrator: SFProjectRole.ParatextAdministrator,
        observer: SFProjectRole.ParatextObserver
      },
      paratextUsers: [],
      userPermissions: {}
    });

    await createDoc<TextAudio>(conn, TEXT_AUDIO_COLLECTION, getTextDocId('project01', 40, 1), {
      dataId: 'dataId01',
      projectRef: 'project01',
      ownerRef: 'user01',
      timings: [
        {
          textRef: '1',
          from: 0.0,
          to: 0.0
        }
      ],
      mimeType: 'audio/mpeg',
      audioUrl: 'project01/user01_file01.mp3?t=123456789123456789'
    });
  }
}
