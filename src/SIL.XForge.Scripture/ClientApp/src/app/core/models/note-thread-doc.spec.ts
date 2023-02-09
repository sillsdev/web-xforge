import { mock } from 'ts-mockito';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import {
  NoteConflictType,
  NoteStatus,
  NoteThread,
  NoteType
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { TestBed } from '@angular/core/testing';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { Note, REATTACH_SEPARATOR } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { DEFAULT_TAG_ICON, NoteTag } from 'realtime-server/lib/esm/scriptureforge/models/note-tag';
import { SFProjectService } from '../sf-project.service';
import { NoteThreadDoc, NoteThreadIcon } from './note-thread-doc';
import { SF_TYPE_REGISTRY } from './sf-type-registry';

const mockedProjectService = mock(SFProjectService);

describe('NoteThreadDoc', () => {
  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [{ provide: SFProjectService, useMock: mockedProjectService }]
  }));
  let env: TestEnvironment;

  beforeEach(() => {
    env = new TestEnvironment();
  });

  it('should use specified icon instead of default', async () => {
    const noteThreadDoc = await env.setupDoc([], 2);
    const expectedIcon: NoteThreadIcon = {
      cssVar: '--icon-file: url(/assets/icons/TagIcons/flag2.png);',
      url: '/assets/icons/TagIcons/flag2.png'
    };
    expect(noteThreadDoc.getIcon(env.noteTags)).toEqual(expectedIcon);
    const expectedVerseRef = VerseRef.parse('MAT 1:1');
    expect(noteThreadDoc.currentVerseRef()!.equals(expectedVerseRef)).toBe(true);
  });

  it('should use default to do icon if tag cannot be found', async () => {
    const noteThreadDoc = await env.setupDoc([], 5);
    const expectedIcon: NoteThreadIcon = {
      cssVar: '--icon-file: url(/assets/icons/TagIcons/' + DEFAULT_TAG_ICON + '.png);',
      url: '/assets/icons/TagIcons/' + DEFAULT_TAG_ICON + '.png'
    };
    expect(noteThreadDoc.getIcon(env.noteTags)).toEqual(expectedIcon);
  });

  it('should use resolved icon', async () => {
    const noteThreadDoc = await env.setupDoc([], 1);
    const expectedIcon: NoteThreadIcon = {
      cssVar: '--icon-file: url(/assets/icons/TagIcons/flag1.png);',
      url: '/assets/icons/TagIcons/flag1.png'
    };
    const resolvedIcon = 'flag5';
    const expectedIconResolved: NoteThreadIcon = {
      cssVar: '--icon-file: url(/assets/icons/TagIcons/' + resolvedIcon + '.png);',
      url: '/assets/icons/TagIcons/' + resolvedIcon + '.png'
    };
    expect(noteThreadDoc.getIcon(env.noteTags)).toEqual(expectedIcon);
    expect(noteThreadDoc.getIconResolved(env.noteTags)).toEqual(expectedIconResolved);
  });

  it('should use grayed out icon', async () => {
    const noteThreadDoc = await env.setupDoc([], 1);
    const expectedIcon: NoteThreadIcon = {
      cssVar: '--icon-file: url(/assets/icons/TagIcons/flag1.png);',
      url: '/assets/icons/TagIcons/flag1.png'
    };
    const grayedOutIcon = 'flag4';
    const expectedIconGrayedOut: NoteThreadIcon = {
      cssVar: '--icon-file: url(/assets/icons/TagIcons/' + grayedOutIcon + '.png);',
      url: '/assets/icons/TagIcons/' + grayedOutIcon + '.png'
    };
    expect(noteThreadDoc.getIcon(env.noteTags)).toEqual(expectedIcon);
    expect(noteThreadDoc.getIconGrayed(env.noteTags)).toEqual(expectedIconGrayedOut);
  });

  it('should use the last icon specified in a threads note list based on date ', async () => {
    const type: NoteType = NoteType.Normal;
    const conflictType: NoteConflictType = NoteConflictType.DefaultValue;

    const notes = [
      {
        dataId: 'note01',
        type,
        conflictType,
        threadId: 'thread01',
        content: 'note content',
        deleted: false,
        tagId: 2,
        status: NoteStatus.Todo,
        ownerRef: 'user01',
        extUserId: 'user01',
        dateCreated: '2021-11-10T12:00:00',
        dateModified: '2021-11-10T12:00:00'
      },
      {
        dataId: 'note03',
        type,
        conflictType,
        threadId: 'thread01',
        content: 'note content',
        deleted: false,
        tagId: 3,
        status: NoteStatus.Todo,
        ownerRef: 'user01',
        extUserId: 'user01',
        dateCreated: '2021-11-10T13:00:00', // Note out of order to test it still renders last
        dateModified: '2021-11-10T13:00:00'
      },
      {
        dataId: 'note02',
        type,
        conflictType,
        threadId: 'thread01',
        content: 'note content',
        deleted: false,
        tagId: 4,
        status: NoteStatus.Todo,
        ownerRef: 'user01',
        extUserId: 'user01',
        dateCreated: '2021-11-10T12:30:00',
        dateModified: '2021-11-10T12:30:00'
      }
    ];
    const noteThreadDoc = await env.setupDoc(notes);
    const expectedIcon: NoteThreadIcon = {
      cssVar: '--icon-file: url(/assets/icons/TagIcons/flag3.png);',
      url: '/assets/icons/TagIcons/flag3.png'
    };
    expect(noteThreadDoc.getIcon(env.noteTags)).toEqual(expectedIcon);
    const expectedVerseRef = VerseRef.parse('MAT 1:1');
    expect(noteThreadDoc.currentVerseRef()!.equals(expectedVerseRef)).toBe(true);
  });

  it('reports the reattached verse reference', async () => {
    const reattachParts: string[] = ['MAT 1:2', 'reattached selected text', '0', '', ''];
    const reattached: string = reattachParts.join(REATTACH_SEPARATOR);
    const type: NoteType = NoteType.Normal;
    const conflictType: NoteConflictType = NoteConflictType.DefaultValue;
    const notes = [
      {
        dataId: 'note01',
        type,
        conflictType,
        threadId: 'thread01',
        content: 'note content',
        deleted: false,
        tagId: 2,
        status: NoteStatus.Todo,
        ownerRef: 'user01',
        extUserId: 'user01',
        dateCreated: '2021-11-10T12:00:00',
        dateModified: '2021-11-10T12:00:00'
      },
      {
        dataId: 'reattach01',
        type,
        conflictType,
        threadId: 'thread01',
        content: '',
        deleted: false,
        status: NoteStatus.Unspecified,
        ownerRef: 'user01',
        extUserId: 'user01',
        dateCreated: '2021-11-10T13:00:00',
        dateModified: '2021-11-10T13:00:00',
        reattached
      }
    ];

    const noteThreadDoc: NoteThreadDoc = await env.setupDoc(notes);
    const verseRef: VerseRef = noteThreadDoc.currentVerseRef()!;
    const expected: VerseRef = VerseRef.parse('MAT 1:2');
    expect(verseRef.equals(expected)).toBe(true);
  });
});

class TestEnvironment {
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  readonly noteTags: NoteTag[] = [
    { tagId: 1, name: 'SF 1', icon: 'flag1', creatorResolve: false },
    { tagId: 2, name: 'SF 2', icon: 'flag2', creatorResolve: false },
    { tagId: 3, name: 'SF 3', icon: 'flag3', creatorResolve: false },
    { tagId: 4, name: 'SF 4', icon: 'flag4', creatorResolve: false }
  ];

  constructor() {}

  setupDoc(notes: Note[], tagId: number = 1): Promise<NoteThreadDoc> {
    notes = notes.length === 0 ? this.getDefaultNotes(tagId) : notes;
    const thread: NoteThread = this.getNoteThread(notes);
    const threadId = [thread.projectRef, thread.dataId].join(':');
    this.realtimeService.addSnapshot<NoteThread>(NoteThreadDoc.COLLECTION, {
      id: threadId,
      data: thread
    });
    return this.realtimeService.subscribe(NoteThreadDoc.COLLECTION, threadId);
  }

  private getNoteThread(notes: Note[]): NoteThread {
    return {
      originalContextBefore: '',
      originalContextAfter: '',
      originalSelectedText: '',
      position: { start: 0, length: 1 },
      dataId: 'thread01',
      notes,
      ownerRef: 'user01',
      projectRef: 'project01',
      status: NoteStatus.Todo,
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 }
    };
  }

  private getDefaultNotes(tagId: number): Note[] {
    return [
      {
        dataId: 'note01',
        threadId: 'thread01',
        ownerRef: 'user01',
        extUserId: 'user01',
        content: 'Some content',
        status: NoteStatus.Todo,
        type: NoteType.Normal,
        conflictType: NoteConflictType.DefaultValue,
        tagId,
        deleted: false,
        dateCreated: '',
        dateModified: ''
      }
    ];
  }
}
