import { ParatextNoteThread } from 'realtime-server/lib/esm/scriptureforge/models/paratext-note-thread';
import { instance, mock } from 'ts-mockito';
import { CommandService } from 'xforge-common/command.service';
import { FileService } from 'xforge-common/file.service';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { ParatextNoteThreadIcon } from './models/paratext-note-thread-doc';
import { SFProjectService } from './sf-project.service';

describe('SFProjectService', () => {
  let env: TestEnvironment;

  beforeEach(() => {
    env = new TestEnvironment();
  });

  it('produce valid alternative note icon', () => {
    const noteThread: ParatextNoteThread = {
      contextBefore: '',
      contextAfter: '',
      startPosition: 0,
      dataId: 'thread01',
      notes: [],
      ownerRef: 'user01',
      projectRef: 'project01',
      selectedText: '',
      tagIcon: 'flag02',
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 }
    };
    const expectedIcon: ParatextNoteThreadIcon = {
      var: '--icon-file: url(/assets/icons/TagIcons/flag02.png);',
      url: '/assets/icons/TagIcons/flag02.png'
    };
    expect(env.projectService.getNoteThreadIcon(noteThread)).toEqual(expectedIcon);
  });

  it('produce correct default note icon', () => {
    const noteThread: ParatextNoteThread = {
      contextBefore: '',
      contextAfter: '',
      startPosition: 0,
      dataId: 'thread01',
      notes: [],
      ownerRef: 'user01',
      projectRef: 'project01',
      selectedText: '',
      tagIcon: '',
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 }
    };
    const expectedIcon: ParatextNoteThreadIcon = {
      var: '--icon-file: url(/assets/icons/TagIcons/01flag1.png);',
      url: '/assets/icons/TagIcons/01flag1.png'
    };
    expect(env.projectService.getNoteThreadIcon(noteThread)).toEqual(expectedIcon);
  });

  it('produce alternative note icon from latest note', () => {
    const noteThread: ParatextNoteThread = {
      contextBefore: '',
      contextAfter: '',
      startPosition: 0,
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
          dateCreated: new Date().toJSON(),
          dateModified: new Date().toJSON()
        },
        {
          dataId: 'note02',
          threadId: 'thread01',
          content: 'note content',
          deleted: false,
          tagIcon: 'flag3',
          ownerRef: 'user01',
          extUserId: 'user01',
          dateCreated: new Date().toJSON(),
          dateModified: new Date().toJSON()
        }
      ],
      ownerRef: 'user01',
      projectRef: 'project01',
      selectedText: '',
      tagIcon: '',
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 }
    };
    const expectedIcon: ParatextNoteThreadIcon = {
      var: '--icon-file: url(/assets/icons/TagIcons/flag3.png);',
      url: '/assets/icons/TagIcons/flag3.png'
    };
    expect(env.projectService.getNoteThreadIcon(noteThread)).toEqual(expectedIcon);
  });
});

class TestEnvironment {
  readonly projectService: SFProjectService;

  constructor() {
    const mockedRealtimeService = mock(TestRealtimeService);
    const mockedCommandService = mock(CommandService);
    const mockedFileService = mock(FileService);
    this.projectService = new SFProjectService(
      instance(mockedRealtimeService),
      instance(mockedCommandService),
      instance(mockedFileService)
    );
  }
}
