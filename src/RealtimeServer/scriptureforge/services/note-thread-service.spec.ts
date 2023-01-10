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
  fetchDoc,
  flushPromises,
  hasDoc,
  submitJson0Op
} from '../../common/utils/test-utils';
import { CheckingAnswerExport, CheckingShareLevel } from '../models/checking-config';
import { SF_PROJECTS_COLLECTION, SFProject } from '../models/sf-project';
import { SFProjectRole } from '../models/sf-project-role';
import {
  getSFProjectUserConfigDocId,
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  SFProjectUserConfig
} from '../models/sf-project-user-config';
import {
  getNoteThreadDocId,
  NOTE_THREAD_COLLECTION,
  NoteStatus,
  NoteThread,
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
    const conn: Connection = clientConnect(env.server, env.projectAdminId);
    await env.setHaveReadNoteRefs(conn);

    // Assert that data is set up as expected for testing.
    const noteThread01: NoteThread =
      env.db.docs[NOTE_THREAD_COLLECTION][getNoteThreadDocId('project01', 'noteThread01')].data;
    env.assertHaveReadNotes();

    let adminProjectUserConfig: SFProjectUserConfig =
      env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][getSFProjectUserConfigDocId('project01', env.projectAdminId)]
        .data;
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread01note01');
    expect(adminProjectUserConfig.noteRefsRead).not.toContain('noteThread01note02');
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread01note03');
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread01note04');
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread02note01');
    let checkerProjectUserConfig: SFProjectUserConfig =
      env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][getSFProjectUserConfigDocId('project01', env.checkerId)].data;
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
      getSFProjectUserConfigDocId('project01', env.projectAdminId)
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
      getSFProjectUserConfigDocId('project01', env.checkerId)
    ].data as SFProjectUserConfig;
    // This have-read should be gone since the corresponding note was removed.
    expect(checkerProjectUserConfig.noteRefsRead).not.toContain('noteThread01note03');
    // This have-read should not have been removed because the note was not removed.
    expect(checkerProjectUserConfig.noteRefsRead).toContain('noteThread01note04');
  });

  it('allows user to read note thread', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn: Connection = clientConnect(env.server, env.projectAdminId);
    const doc = await fetchDoc(conn, NOTE_THREAD_COLLECTION, getNoteThreadDocId('project01', 'noteThread01'));
    expect(doc).not.toBeNull();
  });

  it('prohibits reviewer user to read note threads not published in Scripture Forge', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn: Connection = clientConnect(env.server, env.reviewerId);

    const noteThreadDocId: string = getNoteThreadDocId('project01', 'noteThread01');
    await expect(async () => fetchDoc(conn, NOTE_THREAD_COLLECTION, noteThreadDocId)).rejects.toEqual(
      new Error(`403: Permission denied (read), collection: ${NOTE_THREAD_COLLECTION}, docId: ${noteThreadDocId}`)
    );

    const threadId = 'noteThread03';
    const doc = await fetchDoc(conn, NOTE_THREAD_COLLECTION, getNoteThreadDocId('project01', threadId));
    expect(doc).not.toBeNull();
  });

  it('allows a reviewer to create a note thread', async () => {
    const env = new TestEnvironment();
    await env.createData();
    // the user id 'reviewer' is assigned to have the Reviewer role on the project
    const conn: Connection = clientConnect(env.server, env.reviewerId);

    const noteThreadDocId: string = getNoteThreadDocId('project01', 'noteThread04');
    const noteThread: NoteThread = {
      dataId: 'noteThread04',
      ownerRef: env.reviewerId,
      projectRef: 'project01',
      publishedToSF: true,
      tagIcon: '',
      originalContextAfter: '',
      originalSelectedText: '',
      originalContextBefore: '',
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 10 },
      status: NoteStatus.Todo,
      position: { start: 0, length: 0 },
      notes: [env.getNewNote('noteThread04', 'noteThread04note01', env.reviewerId)]
    };
    await createDoc(conn, NOTE_THREAD_COLLECTION, noteThreadDocId, noteThread);
    const noteThreadDoc = await fetchDoc(conn, NOTE_THREAD_COLLECTION, noteThreadDocId);
    expect(noteThreadDoc).not.toBeNull();
  });

  it('reviewers can add notes to note thread they can read', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn: Connection = clientConnect(env.server, env.reviewerId);
    const noteThreadDocId: string = getNoteThreadDocId('project01', 'noteThread01');
    const note: Note = env.getNewNote('noteThread01', 'reviewerNote01', env.reviewerId);
    // since the user cannot read the note thread, they should not be able to add a note
    await expect(() =>
      submitJson0Op<NoteThread>(conn, NOTE_THREAD_COLLECTION, noteThreadDocId, op => op.insert(n => n.notes, 4, note))
    ).rejects.toEqual(
      new Error(`403: Permission denied (read), collection: ${NOTE_THREAD_COLLECTION}, docId: ${noteThreadDocId}`)
    );

    const sfNoteThreadDocId: string = getNoteThreadDocId('project01', 'noteThread02');
    const doc = await fetchDoc(conn, NOTE_THREAD_COLLECTION, sfNoteThreadDocId);
    let sfNoteThread: NoteThread = doc.data as NoteThread;
    expect(sfNoteThread.notes.length).toEqual(1);
    await submitJson0Op<NoteThread>(conn, NOTE_THREAD_COLLECTION, sfNoteThreadDocId, op =>
      op.insert(n => n.notes, 1, note)
    );
    sfNoteThread = doc.data;
    expect(sfNoteThread.notes.length).toEqual(2);
  });

  it('allows reviewer to update and delete own note', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn: Connection = clientConnect(env.server, env.reviewerId);
    const noteThreadDocId: string = getNoteThreadDocId('project01', 'noteThread02');
    const doc = await fetchDoc(conn, NOTE_THREAD_COLLECTION, noteThreadDocId);
    const noteThread: NoteThread = doc.data as NoteThread;
    expect(noteThread).not.toBeNull();

    const content = 'edited content';
    // edit the note
    await expect(() =>
      submitJson0Op<NoteThread>(conn, NOTE_THREAD_COLLECTION, noteThreadDocId, op =>
        op.set(n => n.notes[0].content, content)
      )
    ).rejects.toEqual(
      new Error(`403: Permission denied (update), collection: ${NOTE_THREAD_COLLECTION}, docId: ${noteThreadDocId}`)
    );

    // delete the note
    await expect(() =>
      submitJson0Op<NoteThread>(conn, NOTE_THREAD_COLLECTION, noteThreadDocId, op => op.remove(n => n.notes, 0))
    ).rejects.toEqual(
      new Error(`403: Permission denied (update), collection: ${NOTE_THREAD_COLLECTION}, docId: ${noteThreadDocId}`)
    );

    const reviewerNoteThreadId: string = getNoteThreadDocId('project01', 'noteThread03');
    const reviewerDoc = await fetchDoc(conn, NOTE_THREAD_COLLECTION, reviewerNoteThreadId);
    let reviewerNoteThread: NoteThread = reviewerDoc.data as NoteThread;
    expect(reviewerNoteThread).not.toBeNull();

    // edit the note
    await submitJson0Op<NoteThread>(conn, NOTE_THREAD_COLLECTION, reviewerNoteThreadId, op =>
      op.set(n => n.notes[0].content, content)
    );
    reviewerNoteThread = reviewerDoc.data;
    expect(reviewerNoteThread.notes[0].content).toEqual('edited content');

    // delete the note
    await submitJson0Op<NoteThread>(conn, NOTE_THREAD_COLLECTION, reviewerNoteThreadId, op =>
      op.remove(n => n.notes, 0)
    );
    reviewerNoteThread = reviewerDoc.data;
    expect(reviewerNoteThread.notes.length).toEqual(0);
  });

  it('allows reviewer to delete their own note thread', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn: Connection = clientConnect(env.server, env.reviewerId);
    const noteThreadDocId: string = getNoteThreadDocId('project01', 'noteThread02');
    await expect(() => deleteDoc(conn, NOTE_THREAD_COLLECTION, noteThreadDocId)).rejects.toEqual(
      new Error(`403: Permission denied (delete), collection: ${NOTE_THREAD_COLLECTION}, docId: ${noteThreadDocId}`)
    );

    const reviewerThreadDocId: string = getNoteThreadDocId('project01', 'noteThread03');
    const doc = await fetchDoc(conn, NOTE_THREAD_COLLECTION, reviewerThreadDocId);
    let reviewerNoteThread: NoteThread = doc.data as NoteThread;
    expect(reviewerNoteThread).toBeDefined();
    // the user who created the first note in the thread can delete the thread because they own the thread
    await deleteDoc(conn, NOTE_THREAD_COLLECTION, reviewerThreadDocId);
    reviewerNoteThread = doc.data as NoteThread;
    expect(reviewerNoteThread).toBeUndefined();
  });

  it('removes have-read note refs when thread deleted', async () => {
    const env = new TestEnvironment();
    await env.createData();
    const conn: Connection = clientConnect(env.server, env.projectAdminId);
    await env.setHaveReadNoteRefs(conn);

    // Assert that data is set up as expected for testing.
    expect(await hasDoc(conn, NOTE_THREAD_COLLECTION, getNoteThreadDocId('project01', 'noteThread01'))).toEqual(true);
    env.assertHaveReadNotes();
    let adminProjectUserConfig: SFProjectUserConfig =
      env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][getSFProjectUserConfigDocId('project01', env.projectAdminId)]
        .data;
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread01note01');
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread01note03');
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread02note01');
    let checkerProjectUserConfig: SFProjectUserConfig =
      env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][getSFProjectUserConfigDocId('project01', env.checkerId)].data;
    expect(checkerProjectUserConfig.noteRefsRead).toContain('noteThread01note03');

    // SUT
    await deleteDoc(conn, NOTE_THREAD_COLLECTION, getNoteThreadDocId('project01', 'noteThread01'));
    await flushPromises();

    // Doc should be gone.
    expect(await hasDoc(conn, NOTE_THREAD_COLLECTION, getNoteThreadDocId('project01', 'noteThread01'))).toEqual(false);
    adminProjectUserConfig =
      env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][getSFProjectUserConfigDocId('project01', env.projectAdminId)]
        .data;
    // Have-read note references to notes in the thread that was removed should be gone.
    expect(adminProjectUserConfig.noteRefsRead).not.toContain('noteThread01note01');
    expect(adminProjectUserConfig.noteRefsRead).not.toContain('noteThread01note03');
    // Have-read note references to notes in a thread that was not removed should not have disappeared.
    expect(adminProjectUserConfig.noteRefsRead).toContain('noteThread02note01');
    checkerProjectUserConfig =
      env.db.docs[SF_PROJECT_USER_CONFIGS_COLLECTION][getSFProjectUserConfigDocId('project01', env.checkerId)].data;
    // Also for other users, the have-read note references to notes in the removed thread, should be gone.
    expect(checkerProjectUserConfig.noteRefsRead).not.toContain('noteThread01note03');
  });
});

class TestEnvironment {
  readonly projectAdminId = 'projectAdmin';
  readonly checkerId = 'checker';
  readonly reviewerId = 'reviewer';
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
    await createDoc<User>(conn, USERS_COLLECTION, this.projectAdminId, {
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
      getSFProjectUserConfigDocId('project01', this.projectAdminId),
      {
        projectRef: 'project01',
        ownerRef: this.projectAdminId,
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

    await createDoc<User>(conn, USERS_COLLECTION, this.checkerId, {
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
      getSFProjectUserConfigDocId('project01', this.checkerId),
      {
        projectRef: 'project01',
        ownerRef: this.checkerId,
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

    await createDoc<User>(conn, USERS_COLLECTION, this.reviewerId, {
      name: 'User 03',
      email: 'user03@example.com',
      role: SystemRole.User,
      isDisplayNameConfirmed: true,
      authId: 'auth03',
      displayName: 'User 03',
      avatarUrl: '',
      sites: {}
    });

    await createDoc<SFProjectUserConfig>(
      conn,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      getSFProjectUserConfigDocId('project01', this.reviewerId),
      {
        projectRef: 'project01',
        ownerRef: this.reviewerId,
        isTargetTextRight: false,
        confidenceThreshold: 0.2,
        translationSuggestionsEnabled: false,
        numSuggestions: 1,
        selectedSegment: '',
        questionRefsRead: [],
        answerRefsRead: [],
        commentRefsRead: [],
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
        shareLevel: CheckingShareLevel.Specific,
        answerExportMethod: CheckingAnswerExport.MarkedForExport
      },
      texts: [],
      editable: true,
      sync: { queuedCount: 0 },
      userRoles: {
        projectAdmin: SFProjectRole.ParatextAdministrator,
        checker: SFProjectRole.CommunityChecker,
        reviewer: SFProjectRole.Reviewer
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

    await createDoc<NoteThread>(conn, NOTE_THREAD_COLLECTION, getNoteThreadDocId('project01', 'noteThread01'), {
      projectRef: 'project01',
      ownerRef: 'some-owner',
      dataId: 'noteThread01',
      verseRef,
      notes: [
        this.getNewNote('noteThread01', 'noteThread01note01', 'ptUser01'),
        this.getNewNote('noteThread01', 'noteThread01note02', 'ptUser01'),
        this.getNewNote('noteThread01', 'noteThread01note03', 'ptUser01'),
        this.getNewNote('noteThread01', 'noteThread01note04', 'ptUser01')
      ],
      originalSelectedText: '',
      originalContextBefore: '',
      originalContextAfter: '',
      position,
      status,
      tagIcon: '',
      publishedToSF: false
    });

    await createDoc<NoteThread>(conn, NOTE_THREAD_COLLECTION, getNoteThreadDocId('project01', 'noteThread02'), {
      projectRef: 'project01',
      ownerRef: 'some-owner',
      dataId: 'noteThread02',
      verseRef,
      notes: [this.getNewNote('noteThread02', 'noteThread02note01', 'ptUser01')],
      originalSelectedText: '',
      originalContextBefore: '',
      originalContextAfter: '',
      position,
      status,
      tagIcon: '',
      publishedToSF: true
    });

    await createDoc<NoteThread>(conn, NOTE_THREAD_COLLECTION, getNoteThreadDocId('project01', 'noteThread03'), {
      projectRef: 'project01',
      ownerRef: this.reviewerId,
      dataId: 'noteThread03',
      verseRef,
      notes: [this.getNewNote('noteThread03', 'noteThread03note01', this.reviewerId)],
      originalSelectedText: '',
      originalContextBefore: '',
      originalContextAfter: '',
      position,
      status,
      tagIcon: '',
      publishedToSF: true
    });
  }

  /** Set have-read indications for specific notes. */
  async setHaveReadNoteRefs(conn: Connection): Promise<void> {
    submitJson0Op<SFProjectUserConfig>(
      conn,
      SF_PROJECT_USER_CONFIGS_COLLECTION,
      getSFProjectUserConfigDocId('project01', this.projectAdminId),
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
      getSFProjectUserConfigDocId('project01', this.checkerId),
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

  getNewNote(threadId: string, dataId: string, ownerRef: string): Note {
    return {
      dataId,
      threadId,
      dateCreated: '',
      dateModified: '',
      ownerRef,
      content: 'note content',
      type: NoteType.Normal,
      conflictType: NoteConflictType.DefaultValue,
      status: NoteStatus.Todo,
      extUserId: ownerRef,
      deleted: false
    };
  }
}
