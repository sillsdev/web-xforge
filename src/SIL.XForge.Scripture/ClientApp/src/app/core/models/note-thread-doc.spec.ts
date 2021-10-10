import { mock } from 'ts-mockito';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { NoteThread } from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { TestBed } from '@angular/core/testing';
import { configureTestingModule } from 'xforge-common/test-utils';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
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

  it('produce valid alternative note icon', async () => {
    const noteThread: NoteThread = {
      originalContextBefore: '',
      originalContextAfter: '',
      originalSelectedText: '',
      position: { start: 0, length: 1 },
      dataId: 'thread01',
      notes: [],
      ownerRef: 'user01',
      projectRef: 'project01',
      tagIcon: 'flag02',
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 }
    };
    const noteThreadDoc = await env.setupDoc(noteThread);
    const expectedIcon: NoteThreadIcon = {
      var: '--icon-file: url(/assets/icons/TagIcons/flag02.png);',
      url: '/assets/icons/TagIcons/flag02.png'
    };
    expect(noteThreadDoc.icon).toEqual(expectedIcon);
  });

  it('produce valid alternative note icon', async () => {
    const noteThread: NoteThread = {
      originalContextBefore: '',
      originalContextAfter: '',
      originalSelectedText: '',
      position: { start: 0, length: 1 },
      dataId: 'thread01',
      notes: [],
      ownerRef: 'user01',
      projectRef: 'project01',
      tagIcon: '',
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 }
    };
    const noteThreadDoc = await env.setupDoc(noteThread);
    const expectedIcon: NoteThreadIcon = {
      var: '--icon-file: url(/assets/icons/TagIcons/01flag1.png);',
      url: '/assets/icons/TagIcons/01flag1.png'
    };
    expect(noteThreadDoc.icon).toEqual(expectedIcon);
  });

  it('produce valid alternative note icon', async () => {
    const noteThread: NoteThread = {
      originalContextBefore: '',
      originalContextAfter: '',
      originalSelectedText: '',
      ownerRef: 'user01',
      projectRef: 'project01',
      tagIcon: '',
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 },
      position: { start: 0, length: 1 },
      dataId: 'thread01',
      notes: [
        {
          dataId: 'note01',
          threadId: 'thread01',
          content: 'note content',
          deleted: false,
          tagIcon: 'flag2',
          ownerRef: 'user01',
          extUserId: 'user01',
          dateCreated: '2021-11-10T12:00:00',
          dateModified: '2021-11-10T12:00:00'
        },
        {
          dataId: 'note03',
          threadId: 'thread01',
          content: 'note content',
          deleted: false,
          tagIcon: 'flag3',
          ownerRef: 'user01',
          extUserId: 'user01',
          dateCreated: '2021-11-10T13:00:00', // Note out of order to test it still renders last
          dateModified: '2021-11-10T13:00:00'
        },
        {
          dataId: 'note02',
          threadId: 'thread01',
          content: 'note content',
          deleted: false,
          tagIcon: 'flag4',
          ownerRef: 'user01',
          extUserId: 'user01',
          dateCreated: '2021-11-10T12:30:00',
          dateModified: '2021-11-10T12:30:00'
        }
      ]
    };
    const noteThreadDoc = await env.setupDoc(noteThread);
    const expectedIcon: NoteThreadIcon = {
      var: '--icon-file: url(/assets/icons/TagIcons/flag3.png);',
      url: '/assets/icons/TagIcons/flag3.png'
    };
    expect(noteThreadDoc.icon).toEqual(expectedIcon);
  });
});

class TestEnvironment {
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {}

  setupDoc(thread: NoteThread): Promise<NoteThreadDoc> {
    const threadId = [thread.projectRef, thread.dataId].join(':');
    this.realtimeService.addSnapshot<NoteThread>(NoteThreadDoc.COLLECTION, {
      id: threadId,
      data: thread
    });
    return this.realtimeService.subscribe(NoteThreadDoc.COLLECTION, threadId);
  }
}
