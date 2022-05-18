import ShareDB from 'sharedb';
import ShareDBMingo from 'sharedb-mingo-memory';
import { instance, mock } from 'ts-mockito';
import { Connection } from 'sharedb/lib/client';
import { TranslateShareLevel } from '../models/translate-config';
import { SystemRole } from '../../common/models/system-role';
import { User, USERS_COLLECTION } from '../../common/models/user';
import { RealtimeServer } from '../../common/realtime-server';
import { SchemaVersionRepository } from '../../common/schema-version-repository';
import {
  allowAll,
  clientConnect,
  createDoc,
  deleteDoc,
  flushPromises,
  hasDoc,
  submitJson0Op
} from '../../common/utils/test-utils';
import { CheckingShareLevel } from '../models/checking-config';
import { SFProject, SF_PROJECTS_COLLECTION } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig,
  SF_PROJECT_USER_CONFIGS_COLLECTION
} from '../models/sf-project-user-config';
import {
  getNoteThreadDocId,
  NoteThread,
  NOTE_THREAD_COLLECTION,
  NoteStatus,
  NoteType,
  NoteConflictType
} from '../models/note-thread';
import { Note } from '../models/note';
import { VerseRefData } from '../models/verse-ref-data';
import { TextAnchor } from '../models/text-anchor';

import { NoteThreadService } from './note-thread-service';

describe('NoteThreadService', () => {
  it('the model builds an id as expected', () => {
    expect(getNoteThreadDocId('myProjectId', 'myNoteThreadId')).toEqual('myProjectId:myNoteThreadId');
  });

  it('removes read refs when note deleted', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn: Connection = clientConnect(env.server, 'projectAdmin');
    await env.setHaveReadNoteRefs(conn);

    // Assert that data is set up as expected for testing.
    const noteThread01: NoteThread =
      env.db.docs[NOTE_THREAD_COLLECTION][getNoteThreadDocId('project01', 'noteThread01')].data;
    env.assertHaveReadNotes();

    let adminProjectUserConfig: SFProjectUserConfig =
      env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][getSFProjectUserConfigDocId('project01', 'projectAdmin')].data;
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread01note01');
    expect(adminProjectUserConfig.noteRefsRead).not.toContain('noteThread01note02');
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread01note03');
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread01note04');
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread02note01');
    let checkerProjectUserConfig: SFProjectUserConfig =
      env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][getSFProjectUserConfigDocId('project01', 'checker')].data;
    expect(checkerProjectUserConfig.noteRefsRead).toContain('noteThread01note03');
    expect(checkerProjectUserConfig.noteRefsRead).toContain('noteThread01note04');

    const nt01n01index = (noteThread01.notes as Note[]).findIndex((note: Note) => note.dataId === 'noteThread01note01');
    const nt01n02index = (noteThread01.notes as Note[]).findIndex((note: Note) => note.dataId === 'noteThread01note02');
    const nt01n03index = (noteThread01.notes as Note[]).findIndex((note: Note) => note.dataId === 'noteThread01note03');

    // SUT
    await submitJson0Op<NoteThread>(
      conn,
      NOTE_THREAD_COLLECTION,
      getNoteThreadDocId('project01', 'noteThread01'),
      ops => {
        ops.remove((noteThread: NoteThread) => noteThread.notes, nt01n03index);
        ops.remove((noteThread: NoteThread) => noteThread.notes, nt01n02index);
        ops.remove((noteThread: NoteThread) => noteThread.notes, nt01n01index);
      }
    );
    await flushPromises();

    adminProjectUserConfig = env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][
      getSFProjectUserConfigDocId('project01', 'projectAdmin')
    ].data as SFProjectUserConfig;
    // This have-read should be gone since the corresponding note was removed.
    expect(adminProjectUserConfig.noteRefsRead).not.toContain('noteThread01note01');
    // User still does not have this have-read item, and importantly, nothing crashed as a result.
    expect(adminProjectUserConfig.noteRefsRead).not.toContain('noteThread01note02');
    // This have-read should be gone since the corresponding note was removed.
    expect(adminProjectUserConfig.noteRefsRead).not.toContain('noteThread01note03');
    // This have-read should not have been removed because the note was not removed.
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread01note04');
    // this have-read should not have been removed. It regards a note in another notethread that was not touched.
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread02note01');
    checkerProjectUserConfig = env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][
      getSFProjectUserConfigDocId('project01', 'checker')
    ].data as SFProjectUserConfig;
    // This have-read should be gone since the corresponding note was removed.
    expect(checkerProjectUserConfig.noteRefsRead).not.toContain('noteThread01note03');
    // This have-read should not have been removed because the note was not removed.
    expect(checkerProjectUserConfig.noteRefsRead).toContain('noteThread01note04');
  });

  it('removes have-read note refs when thread deleted', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn: Connection = clientConnect(env.server, 'projectAdmin');
    await env.setHaveReadNoteRefs(conn);

    // Assert that data is set up as expected for testing.
    expect(await hasDoc(conn, NOTE_THREAD_COLLECTION, getNoteThreadDocId('project01', 'noteThread01'))).toEqual(true);
    env.assertHaveReadNotes();
    let adminProjectUserConfig: SFProjectUserConfig =
      env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][getSFProjectUserConfigDocId('project01', 'projectAdmin')].data;
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread01note01');
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread01note03');
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread02note01');
    let checkerProjectUserConfig: SFProjectUserConfig =
      env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][getSFProjectUserConfigDocId('project01', 'checker')].data;
    expect(checkerProjectUserConfig.noteRefsRead).toContain('noteThread01note03');

    // SUT
    await deleteDoc(conn, NOTE_THREAD_COLLECTION, getNoteThreadDocId('project01', 'noteThread01'));
    await flushPromises();

    // Doc should be gone.
    expect(await hasDoc(conn, NOTE_THREAD_COLLECTION, getNoteThreadDocId('project01', 'noteThread01'))).toEqual(false);
    adminProjectUserConfig =
      env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][getSFProjectUserConfigDocId('project01', 'projectAdmin')].data;
    // Have-read note references to notes in the thread that was removed should be gone.
    expect(adminProjectUserConfig.noteRefsRead).not.toContain('noteThread01note01');
    expect(adminProjectUserConfig.noteRefsRead).not.toContain('noteThread01note03');
    // Have-read note references to notes in a thread that was not removed should not have disappeared.
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread02note01');
    checkerProjectUserConfig =
      env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][getSFProjectUserConfigDocId('project01', 'checker')].data;
    // Also for other users, the have-read note references to notes in the removed thread, should be gone.
    expect(checkerProjectUserConfig.noteRefsRead).not.toContain('noteThread01note03');
  });
});

class TestEnvironment {
  readonly service: NoteThreadService;
  readonly server: RealtimeServer;
  readonly db: ShareDBMingo;
  readonly mockedSchemaVersionRepository = mock(SchemaVersionRepository);

  constructor() {
    this.service = new NoteThreadService();
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
    allowAll(this.server, SF_PROJECT_USER_CONFIGS_COLLECTION);
  }

  async createData(): Promise<void> {
    const conn = this.server.connect();
    await createDoc<User>(conn, USERS_COLLECTION, 'projectAdmin', {
      name: 'User 01',
      email: 'user01@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth01',
      displayName: 'User 01',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<SFProjectUserConfig>(
      conn,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      getSFProjectUserConfigDocId('project01', 'projectAdmin'),
      {
        projectRef: 'project01',
        ownerRef: 'projectAdmin',
        isTargetTextRight: false,
        confidenceThreshold: 0.2,
        translationSuggestionsEnabled: true,
        numSuggestions: 1,
        selectedSegment: '',
        questionRefsRead: ['question01'],
        answerRefsRead: ['answer01'],
        commentRefsRead: ['comment01'],
        noteRefsRead: []
      }
    );

    await createDoc<User>(conn, USERS_COLLECTION, 'checker', {
      name: 'User 02',
      email: 'user02@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth02',
      displayName: 'User 02',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<SFProjectUserConfig>(
      conn,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      getSFProjectUserConfigDocId('project01', 'checker'),
      {
        projectRef: 'project01',
        ownerRef: 'checker',
        isTargetTextRight: false,
        confidenceThreshold: 0.2,
        translationSuggestionsEnabled: true,
        numSuggestions: 1,
        selectedSegment: '',
        questionRefsRead: ['question01'],
        answerRefsRead: ['answer01'],
        commentRefsRead: ['comment01'],
        noteRefsRead: []
      }
    );

    await createDoc<SFProject>(conn, SF_PROJECTS_COLLECTION, 'project01', {
      name: 'Project 01',
      shortName: 'PT01',
      paratextId: 'pt01',
      writingSystem: { tag: 'qaa' },
      translateConfig: {
        translationSuggestionsEnabled: false,
        shareEnabled: true,
        shareLevel: TranslateShareLevel.Specific
      },
      checkingConfig: {
        checkingEnabled: false,
        usersSeeEachOthersResponses: true,
        shareEnabled: true,
        shareLevel: CheckingShareLevel.Specific
      },
      texts: [],
      editable: true,
      defaultFontSize: 10,
      defaultFont: 'Arial',
      sync: { queuedCount: 0 },
      userRoles: {
        projectAdmin: SFProjectRole.ParatextAdministrator,
        checker: SFProjectRole.CommunityChecker
      },
      userPermissions: {},
      paratextUsers: []
    });

    const verseRef: VerseRefData = {
      bookNum: 40,
      chapterNum: 1,
      verseNum: 1
    };
    const position: TextAnchor = { start: 0, length: 0 };
    const status: NoteStatus = NoteStatus.Todo;
    const type: NoteType = NoteType.Normal;
    const conflictType: NoteConflictType = NoteConflictType.DefaultValue;
    await createDoc<NoteThread>(conn, NOTE_THREAD_COLLECTION, getNoteThreadDocId('project01', 'noteThread01'), {
      projectRef: 'project01',
      ownerRef: 'some-owner',
      dataId: 'noteThread01',
      verseRef,
      notes: [
        {
          dataId: 'noteThread01note01',
          type,
          conflictType,
          threadId: 'noteThread01',
          extUserId: 'some-ext-user-id',
          deleted: false,
          status,
          dateModified: '',
          dateCreated: '',
          ownerRef: 'some-owner-id'
        },
        {
          dataId: 'noteThread01note02',
          type,
          conflictType,
          threadId: 'noteThread01',
          extUserId: 'some-ext-user-id',
          deleted: false,
          status,
          dateModified: '',
          dateCreated: '',
          ownerRef: 'some-owner-id'
        },
        {
          dataId: 'noteThread01note03',
          type,
          conflictType,
          threadId: 'noteThread01',
          extUserId: 'some-ext-user-id',
          deleted: false,
          status,
          dateModified: '',
          dateCreated: '',
          ownerRef: 'some-owner-id'
        },
        {
          dataId: 'noteThread01note04',
          type,
          conflictType,
          threadId: 'noteThread01',
          extUserId: 'some-ext-user-id',
          deleted: false,
          status,
          dateModified: '',
          dateCreated: '',
          ownerRef: 'some-owner-id'
        }
      ],
      originalSelectedText: '',
      originalContextBefore: '',
      originalContextAfter: '',
      position,
      status,
      tagIcon: ''
    });

    await createDoc<NoteThread>(conn, NOTE_THREAD_COLLECTION, getNoteThreadDocId('project01', 'noteThread02'), {
      projectRef: 'project01',
      ownerRef: 'some-owner',
      dataId: 'noteThread02',
      verseRef,
      notes: [
        {
          dataId: 'noteThread02note01',
          type,
          conflictType,
          threadId: 'noteThread02',
          extUserId: 'some-ext-user-id',
          deleted: false,
          status,
          dateModified: '',
          dateCreated: '',
          ownerRef: 'some-owner-id'
        }
      ],
      originalSelectedText: '',
      originalContextBefore: '',
      originalContextAfter: '',
      position,
      status,
      tagIcon: ''
    });
  }

  /** Set have-read indications for specific notes. */
  async setHaveReadNoteRefs(conn: Connection): Promise<void> {
    submitJson0Op<SFProjectUserConfig>(
      conn,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      getSFProjectUserConfigDocId('project01', 'projectAdmin'),
      ops => {
        ops.add((puc: SFProjectUserConfig) => puc.noteRefsRead, 'noteThread01note01');
        ops.add((puc: SFProjectUserConfig) => puc.noteRefsRead, 'noteThread01note03');
        ops.add((puc: SFProjectUserConfig) => puc.noteRefsRead, 'noteThread01note04');
        ops.add((puc: SFProjectUserConfig) => puc.noteRefsRead, 'noteThread02note01');
      }
    );
    submitJson0Op<SFProjectUserConfig>(
      conn,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      getSFProjectUserConfigDocId('project01', 'checker'),
      ops => {
        ops.add((puc: SFProjectUserConfig) => puc.noteRefsRead, 'noteThread01note03');
        ops.add((puc: SFProjectUserConfig) => puc.noteRefsRead, 'noteThread01note04');
      }
    );
    await flushPromises();
  }

  assertHaveReadNotes(): void {
    const noteThread01: NoteThread =
      this.db.docs[NOTE_THREAD_COLLECTION][getNoteThreadDocId('project01', 'noteThread01')].data;
    const noteThread01noteIds: string[] = noteThread01.notes.map((note: Note) => note.dataId);
    expect(noteThread01noteIds).toContain('noteThread01note01');
    expect(noteThread01noteIds).toContain('noteThread01note02');
    expect(noteThread01noteIds).toContain('noteThread01note03');
    expect(noteThread01noteIds).toContain('noteThread01note04');
    const noteThread02: NoteThread =
      this.db.docs[NOTE_THREAD_COLLECTION][getNoteThreadDocId('project01', 'noteThread02')].data;
    const noteThread02noteIds: string[] = noteThread02.notes.map((note: Note) => note.dataId);
    expect(noteThread02noteIds).toContain('noteThread02note01');
  }
}
