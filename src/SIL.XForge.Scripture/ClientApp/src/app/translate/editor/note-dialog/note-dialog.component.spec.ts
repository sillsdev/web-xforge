import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, DebugElement, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatLegacyDialog as MatDialog, MatLegacyDialogRef as MatDialogRef } from '@angular/material/legacy-dialog';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { CookieService } from 'ngx-cookie-service';
import { CheckingShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { REATTACH_SEPARATOR } from 'realtime-server/lib/esm/scriptureforge/models/note';
import {
  AssignedUsers,
  NoteConflictType,
  NoteStatus,
  NoteThread,
  NoteType
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { SFProject, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { isParatextRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TranslateShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { fromVerseRef, VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import * as RichText from 'rich-text';
import { anything, capture, mock, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { DialogService } from 'xforge-common/dialog.service';
import { FeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, matDialogCloseDelay, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SF_TAG_ICON } from 'realtime-server/lib/esm/scriptureforge/models/note-tag';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { getTextDoc, paratextUsersFromRoles } from '../../../shared/test-utils';
import { NoteThreadDoc } from '../../../core/models/note-thread-doc';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TranslateModule } from '../../translate.module';
import { NoteDialogComponent, NoteDialogData } from './note-dialog.component';

const mockedAuthService = mock(AuthService);
const mockedCookieService = mock(CookieService);
const mockedHttpClient = mock(HttpClient);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedFeatureFlagService = mock(FeatureFlagService);
const mockedDialogService = mock(DialogService);

describe('NoteDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, NoopAnimationsModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: HttpClient, useMock: mockedHttpClient },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: FeatureFlagService, useMock: mockedFeatureFlagService },
      { provide: DialogService, useMock: mockedDialogService }
    ]
  }));

  let env: TestEnvironment;
  afterEach(fakeAsync(() => {
    if (env.dialogContentArea != null) {
      env.closeDialog();
    }
  }));

  it('show selected text and toggle visibility of related segment', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });

    expect(env.noteText.nativeElement.textContent).toEqual('before selection selected text after selection');
    expect(env.segmentText).toBeNull();
    env.toggleSegmentButton();
    expect(env.segmentText.nativeElement.textContent).toEqual(
      `target: chapter 1, verse 7.\ntarget: chapter 1, verse 7 - 2nd paragraph.`
    );
  }));

  it('should not show deleted notes', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    expect(env.notes.length).toBe(4);
  }));

  it('should style notes', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    const tests: { text: string | undefined; expected: string }[] = [
      {
        text: 'turn <bold>text bold</bold>',
        expected: 'turn <b>text bold</b>'
      },
      {
        text: 'turn <italic>text italic</italic>',
        expected: 'turn <i>text italic</i>'
      },
      {
        text: 'Alpha <unknown><bold>Bravo</bold></unknown> Charlie',
        expected: 'Alpha <b>Bravo</b> Charlie'
      },
      {
        text: '<p>this is a paragraph</p>',
        expected: 'this is a paragraph<br />'
      },
      {
        text: 'check <unknown id="anything">unknown</unknown> <italic>text</italic>',
        expected: 'check unknown <i>text</i>'
      },
      {
        text: 'Alpha <strikethrough><color name="red">Bravo</color></strikethrough> Charlie',
        expected: 'Alpha <span class="conflict-text-older">Bravo</span> Charlie'
      },
      {
        text: 'Alpha <bold><color name="red">Bravo</color></bold> Charlie',
        expected: 'Alpha <span class="conflict-text-newer">Bravo</span> Charlie'
      },
      {
        // The following is derived from data from Paratext 9.
        text: '<language name="en">Alpha <strikethrough><color name="red">original </color></strikethrough><bold><color name="red">one-option </color></bold>Bravo</language>',
        expected:
          'Alpha <span class="conflict-text-older">original </span><span class="conflict-text-newer">one-option </span>Bravo'
      },
      {
        // The following is derived from data from Paratext 9.
        text: 'Preamble Before <strikethrough><color name="red">Older text </color></strikethrough><bold><color name="red">Newer text</color></bold><bold><color name="red">\\x - </color></bold><bold><color name="red">\\xo </color></bold><bold><color name="red">3.16 </color></bold><bold><color name="red">\\xt </color></bold><bold><color name="red">cross reference here </color></bold><bold><color name="red">\\x*</color></bold><bold><color name="red"> </color></bold>After ',
        expected:
          'Preamble Before <span class="conflict-text-older">Older text </span><span class="conflict-text-newer">Newer text</span><span class="conflict-text-newer">\\x - </span><span class="conflict-text-newer">\\xo </span><span class="conflict-text-newer">3.16 </span><span class="conflict-text-newer">\\xt </span><span class="conflict-text-newer">cross reference here </span><span class="conflict-text-newer">\\x*</span><span class="conflict-text-newer"> </span>After '
      },
      {
        text: '',
        expected: ''
      },
      {
        text: undefined,
        expected: ''
      }
    ];
    tests.forEach(test => {
      expect(env.component.parseNote(test.text)).toEqual(test.expected);
    });
  }));

  it('produce correct default note icon', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    expect(env.component.flagIcon).toEqual('/assets/icons/TagIcons/flag01.png');
  }));

  it('should show correct icon', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });

    // To do
    expect(env.notes[0].nativeElement.querySelector('img').getAttribute('src'))
      .withContext('[n0] to do - src')
      .toEqual('/assets/icons/TagIcons/flag01.png');
    expect(env.notes[0].nativeElement.querySelector('img').getAttribute('title'))
      .withContext('[n0] to do - title')
      .toEqual('To do');

    // Resolved
    expect(env.notes[1].nativeElement.querySelector('img').getAttribute('src'))
      .withContext('[n1] resolved - src')
      .toEqual('/assets/icons/TagIcons/flag05.png');
    expect(env.notes[1].nativeElement.querySelector('img').getAttribute('title'))
      .withContext('[n1] resolved - title')
      .toEqual('Resolved');
    expect(env.notes[3].nativeElement.querySelector('img').getAttribute('src'))
      .withContext('[n3] resolved - src')
      .toEqual('/assets/icons/TagIcons/flag05.png');
    expect(env.notes[3].nativeElement.querySelector('img').getAttribute('title'))
      .withContext('[n3] resolved - title')
      .toEqual('Resolved');

    // Blank/unspecified
    expect(env.notes[2].nativeElement.querySelector('img').getAttribute('src'))
      .withContext('[n2] blank - src')
      .toEqual('');
    expect(env.notes[2].nativeElement.querySelector('img').getAttribute('title'))
      .withContext('[n2] blank - title')
      .toEqual('');
  }));

  it('should show notes for reattachment', fakeAsync(() => {
    const reattachedContent = '';
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread(reattachedContent) });
    const verseText = 'before selection reattached text after selection';
    const expectedSrc = '/assets/icons/TagIcons/ReattachNote.png';
    const reattachNote = env.notes[4].nativeElement as HTMLElement;
    expect(reattachNote.querySelector('.content .text')!.textContent).toContain(verseText);
    expect(reattachNote.querySelector('.content .verse-reattached')!.textContent).toContain('Matthew 1:4');
    expect(reattachNote.querySelector('img')?.getAttribute('src')).toEqual(expectedSrc);
    expect(reattachNote.querySelector('img')?.getAttribute('title')).toEqual('Note reattached');
  }));

  it('reattached note with content', fakeAsync(() => {
    let reattachedContent: string = 'Reattached content text.';
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread(reattachedContent) });

    // Check note with status set
    const verseText = 'before selection reattached text after selection';
    let expectedSrc = '/assets/icons/TagIcons/flag01.png';
    let reattachNote = env.notes[4].nativeElement as HTMLElement;
    expect(reattachNote.querySelector('.content .text')!.textContent).toContain(verseText);
    expect(reattachNote.querySelector('.content .verse-reattached')!.textContent).toContain('Matthew 1:4');
    expect(reattachNote.querySelector('.content .note-content')!.textContent).toContain(reattachedContent);
    expect(reattachNote.querySelector('img')?.getAttribute('src')).toEqual(expectedSrc);
    expect(reattachNote.querySelector('img')?.getAttribute('title')).toEqual('To do');

    // Check note with no status set
    reattachedContent = 'reattached02';
    expectedSrc = '/assets/icons/TagIcons/flag01.png';
    reattachNote = env.notes[5].nativeElement as HTMLElement;
    expect(reattachNote.querySelector('.content .verse-reattached')!.textContent).toContain('Matthew 1:4');
    expect(reattachNote.querySelector('.content .note-content')!.textContent).toContain(reattachedContent);
    expect(reattachNote.querySelector('img')?.getAttribute('src')).toEqual(expectedSrc);
    expect(reattachNote.querySelector('img')?.getAttribute('title')).toEqual('Note reattached');
  }));

  it('shows assigned user', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    expect(env.threadAssignedUser.nativeElement.textContent).toContain('Team');
    expect(env.notes[0].nativeElement.querySelector('.assigned-user').textContent).toContain(
      TestEnvironment.paratextUsers.find(u => u.sfUserId === 'user01')!.username
    );
    expect(env.notes[1].nativeElement.querySelector('.assigned-user').textContent).toContain('Team');
  }));

  it('shows unassigned user', fakeAsync(() => {
    const noteThread = TestEnvironment.getNoteThread();
    noteThread.assignment = '';
    env = new TestEnvironment({ noteThread });
    expect(env.threadAssignedUser.nativeElement.textContent).toContain('Unassigned');
    env.closeDialog();

    // Ensure it still shows unassigned if there is no assignment set
    delete noteThread.assignment;
    env = new TestEnvironment({ noteThread });
    expect(env.threadAssignedUser.nativeElement.textContent).toContain('Unassigned');
  }));

  it('shows correct coloured icon based on assignment', fakeAsync(() => {
    const currentUserId = 'user01';
    const defaultIcon = 'flag01.png';
    const grayIcon = 'flag04.png';
    const assigned: { assigned?: AssignedUsers | string; expectedIcon: string }[] = [
      {
        assigned: undefined,
        expectedIcon: defaultIcon
      },
      {
        assigned: AssignedUsers.TeamUser,
        expectedIcon: defaultIcon
      },
      {
        assigned: AssignedUsers.Unspecified,
        expectedIcon: defaultIcon
      },
      {
        assigned: 'opaqueuser01', // Current user
        expectedIcon: defaultIcon
      },
      {
        assigned: 'opaqueuser02', // Another user
        expectedIcon: grayIcon
      }
    ];

    const noteThread: NoteThread = TestEnvironment.defaultNoteThread;
    for (const assignment of assigned) {
      noteThread.assignment = assignment.assigned;
      env = new TestEnvironment({ noteThread, currentUserId });
      expect(env.component.flagIcon)
        .withContext(assignment.assigned ?? 'Unassigned')
        .toEqual('/assets/icons/TagIcons/' + assignment.expectedIcon);
      env.closeDialog();
    }
  }));

  it('hides assigned user for non-paratext users', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread(), currentUserId: 'user02' });
    expect(env.threadAssignedUser.nativeElement.textContent).toContain('Team');
    expect(env.notes[0].nativeElement.querySelector('.assigned-user').textContent).toContain('Paratext user');
    expect(env.notes[1].nativeElement.querySelector('.assigned-user').textContent).toContain('Team');
  }));

  it('should gracefully return when data not ready', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread(), includeSnapshots: false });
    expect(env.component.segmentText).toEqual('');
    const noteThread: NoteThread = TestEnvironment.getNoteThread();
    expect(env.component.noteIcon(noteThread[0])).toEqual('');
  }));

  it('uses rtl direction with rtl project', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread(), isRightToLeftProject: true });
    expect(env.component.isRtl).withContext('setup').toBeTrue();
    // RTL is detected and applied.
    expect(env.dialogContentArea.classes.rtl).toBeTrue();
    expect(env.dialogContentArea.classes.ltr).toBeUndefined();
  }));

  it('uses ltr direction with ltr project', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    expect(env.component.isRtl).withContext('setup').toBeFalse();
    expect(env.dialogContentArea.classes.rtl).toBeUndefined();
    expect(env.dialogContentArea.classes.ltr).toBeTrue();
  }));

  it('show insert note dialog content', fakeAsync(() => {
    env = new TestEnvironment({ verseRef: VerseRef.parse('MAT 1:1'), noteTagId: 6 });
    expect(env.noteInputElement).toBeTruthy();
    expect(env.flagIcon).toEqual('/assets/icons/TagIcons/defaultIcon.png');
    expect(env.verseRef).toEqual('Matthew 1:1');
    expect(env.noteText.nativeElement.innerText).toEqual('target: chapter 1, verse 1.');
    expect(env.threadAssignedUser.nativeElement.textContent).toContain('Unassigned');
  }));

  it('can insert a note', fakeAsync(() => {
    const verseRef = VerseRef.parse('MAT 1:3');
    env = new TestEnvironment({ verseRef, noteTagId: 2 });
    expect(env.noteInputElement).toBeTruthy();
    expect(env.verseRef).toEqual('Matthew 1:3');
    env.enterNoteContent('Enter note content');
    expect(env.component.currentNoteContent).toEqual('Enter note content');
    expect(env.component.segmentText).toEqual('target: chapter 1, verse 3.');
    env.submit();

    const verseData: VerseRefData = fromVerseRef(verseRef);
    verify(mockedProjectService.createNoteThread('project01', anything())).once();
    const [, noteThread] = capture(mockedProjectService.createNoteThread).last();
    expect(noteThread.verseRef).toEqual(verseData);
    expect(noteThread.originalSelectedText).toEqual('target: chapter 1, verse 3.');
    expect(noteThread.publishedToSF).toBe(true);
    expect(noteThread.notes[0].ownerRef).toEqual('user01');
    expect(noteThread.notes[0].content).toEqual('Enter note content');
    expect(noteThread.notes[0].tagId).toEqual(2);
  }));

  it('show sf note tag on notes with undefined tag id', fakeAsync(() => {
    const noteThread: NoteThread = TestEnvironment.getNoteThread(undefined, true);
    env = new TestEnvironment({ noteThread });
    expect(env.flagIcon).toEqual('/assets/icons/TagIcons/' + SF_TAG_ICON + '.png');
  }));

  it('does not save note if textarea is empty', fakeAsync(() => {
    env = new TestEnvironment({ verseRef: VerseRef.parse('MAT 1:1') });
    expect(env.noteInputElement).toBeTruthy();
    env.submit();
    verify(mockedProjectService.createNoteThread(anything(), anything())).never();
    expect(env.dialogResult).toBeFalsy();
  }));

  it('does not show text area for users without write permissions', fakeAsync(() => {
    const verseRef = VerseRef.parse('MAT 1:3');
    env = new TestEnvironment({ currentUserId: 'user02', verseRef });
    expect(env.noteInputElement).toBeNull();
    expect(env.saveButton).toBeNull();
  }));

  it('does not save if empty note added to an existing thread', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    expect(env.noteInputElement).toBeTruthy();
    const noteThread: NoteThreadDoc = env.getNoteThreadDoc('thread01');
    expect(noteThread.data!.notes.length).toEqual(5);
    env.submit();
    expect(noteThread.data!.notes.length).toEqual(5);
    expect(env.dialogResult).toBeFalsy();
  }));

  it('allows adding a note to an existing thread', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    const noteThread: NoteThreadDoc = env.getNoteThreadDoc('thread01');
    expect(noteThread.data!.notes.length).toEqual(5);
    expect(env.noteInputElement).toBeTruthy();
    // note 03 is marked deleted and is not displayed
    expect(env.component.notesToDisplay.length).toEqual(4);
    const content = 'content in the thread';
    env.enterNoteContent('content in the thread');
    env.submit();
    expect(noteThread.data!.notes.length).toEqual(6);
    expect(noteThread.data!.notes[5].dataId).not.toContain('note0');
    expect(noteThread.data!.notes[5].threadId).toEqual('thread01');
    expect(noteThread.data!.notes[5].content).toEqual(content);
    expect(env.dialogResult).toBe(true);
  }));

  it('allows user to edit the last note in the thread', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    // note03 is marked as deleted
    expect(env.notes.length).toEqual(4);
    const noteThread: NoteThreadDoc = env.getNoteThreadDoc('thread01');
    expect(noteThread.data!.notes[4].content).toEqual('note05');
    const noteNumbers = [1, 2, 3];
    noteNumbers.forEach(n => expect(env.noteHasEditActions(n)).toBe(false));
    expect(env.noteHasEditActions(4)).toBe(true);
    env.clickEditNote();
    expect(env.noteInputElement).toBeTruthy();
    expect(env.notes.length).toEqual(3);
    noteNumbers.forEach(n => expect(env.noteHasEditActions(n)).toBe(false));
    expect(env.component.currentNoteContent).toEqual('note05');
    const content = 'note 05 edited content';
    env.enterNoteContent(content);
    env.submit();
    expect(noteThread.data!.notes[4].content).toEqual(content);
    expect(env.dialogResult).toBe(true);
  }));

  it('allows user to delete the last note in the thread', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    // note03 is marked as deleted
    expect(env.notes.length).toEqual(4);
    const noteThread: NoteThreadDoc = env.getNoteThreadDoc('thread01');
    expect(noteThread.data!.notes.length).toEqual(5);
    expect(env.noteHasEditActions(3)).toBe(false);
    expect(env.noteHasEditActions(4)).toBe(true);
    env.clickDeleteNote();
    verify(mockedDialogService.confirm(anything(), anything())).once();
    expect(env.notes.length).toEqual(3);
    expect(env.noteHasEditActions(3)).toBe(true);
    expect(noteThread.data!.notes.length).toEqual(4);
  }));

  it('does not delete the note if a user cancels', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    expect(env.notes.length).toEqual(4);
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(false);
    expect(env.noteHasEditActions(4)).toBe(true);
    env.clickDeleteNote();
    verify(mockedDialogService.confirm(anything(), anything())).once();
    expect(env.notes.length).toEqual(4);
  }));

  it('deletes the thread if the last note is deleted', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.defaultNoteThread });
    expect(env.notes.length).toEqual(1);
    const noteThread: NoteThreadDoc = env.getNoteThreadDoc('thread01');
    expect(noteThread.data).toBeTruthy();
    expect(env.noteHasEditActions(1)).toBe(true);
    env.clickDeleteNote();
    verify(mockedDialogService.confirm(anything(), anything())).once();
    expect(noteThread.data).toBeUndefined();
    expect(env.dialogResult).toBe(true);
  }));
});

@Directive({
  // es lint complains that a directive should be used as an attribute
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: 'appViewContainerDirective'
})
class ViewContainerDirective {
  constructor(public viewContainerRef: ViewContainerRef) {}
}

@Component({
  selector: 'app-view-container',
  template: '<appViewContainerDirective></appViewContainerDirective>'
})
class ChildViewContainerComponent {
  @ViewChild(ViewContainerDirective, { static: true }) viewContainer!: ViewContainerDirective;
}

@NgModule({
  imports: [CommonModule, UICommonModule, TranslateModule, TestTranslocoModule],
  declarations: [ViewContainerDirective, ChildViewContainerComponent],
  exports: [ViewContainerDirective, ChildViewContainerComponent]
})
class DialogTestModule {}

interface TestEnvironmentConstructorArgs {
  includeSnapshots?: boolean;
  isRightToLeftProject?: boolean;
  currentUserId?: string;
  noteThread?: NoteThread;
  verseRef?: VerseRef;
  noteTagId?: number;
}

class TestEnvironment {
  static PROJECT01: string = 'project01';
  static matthewText: TextInfo = {
    bookNum: 40,
    hasSource: false,
    chapters: [
      { number: 1, lastVerse: 25, isValid: true, permissions: {} },
      { number: 3, lastVerse: 17, isValid: true, permissions: {} }
    ],
    permissions: {}
  };
  static userRoles: { [userId: string]: string } = {
    user01: SFProjectRole.ParatextAdministrator,
    user02: SFProjectRole.Observer
  };
  static testProjectProfile: SFProjectProfile = {
    paratextId: 'pt01',
    shortName: 'P01',
    name: 'Project 01',
    writingSystem: { tag: 'en' },
    userPermissions: {},
    translateConfig: {
      translationSuggestionsEnabled: false,
      shareEnabled: false,
      shareLevel: TranslateShareLevel.Anyone
    },
    checkingConfig: {
      usersSeeEachOthersResponses: true,
      checkingEnabled: true,
      shareEnabled: true,
      shareLevel: CheckingShareLevel.Anyone,
      answerExportMethod: CheckingAnswerExport.MarkedForExport
    },
    texts: [TestEnvironment.matthewText],
    noteTags: [
      { tagId: 1, name: 'PT Tag 1', icon: 'flag01', creatorResolve: false },
      { tagId: 2, name: 'PT Tag 2', icon: 'circle01', creatorResolve: false },
      { tagId: 3, name: 'PT Tag 3', icon: 'star01', creatorResolve: false },
      { tagId: 4, name: 'PT Tag 4', icon: 'tag01', creatorResolve: false },
      { tagId: 5, name: 'PT Tag 5', icon: 'asterisk01', creatorResolve: false },
      { tagId: 6, name: 'SF Note Tag', icon: 'defaultIcon', creatorResolve: false }
    ],
    sync: { queuedCount: 0 },
    editable: true,
    userRoles: TestEnvironment.userRoles
  };
  static paratextUsers: ParatextUserProfile[] = paratextUsersFromRoles(TestEnvironment.userRoles);
  static testProject: SFProject = {
    ...TestEnvironment.testProjectProfile,
    paratextUsers: TestEnvironment.paratextUsers
  };
  static reattached: string = ['MAT 1:4', 'reattached text', '17', 'before selection ', ' after selection'].join(
    REATTACH_SEPARATOR
  );
  static defaultNoteThread: NoteThread = {
    originalContextBefore: '',
    originalContextAfter: '',
    originalSelectedText: '',
    dataId: 'thread01',
    ownerRef: 'user01',
    position: { start: 0, length: 0 },
    projectRef: TestEnvironment.PROJECT01,
    verseRef: { bookNum: 40, chapterNum: 1, verseNum: 1 },
    status: NoteStatus.Todo,
    assignment: AssignedUsers.TeamUser,
    notes: [
      {
        dataId: 'note01',
        type: NoteType.Normal,
        conflictType: NoteConflictType.DefaultValue,
        threadId: 'thread01',
        content: 'thread01',
        extUserId: 'user01',
        deleted: false,
        ownerRef: 'user01',
        status: NoteStatus.Todo,
        tagId: 1,
        dateCreated: '',
        dateModified: ''
      }
    ]
  };
  static getNoteThread(reattachedContent?: string, isInitialSFNote?: boolean): NoteThread {
    const type: NoteType = NoteType.Normal;
    const conflictType: NoteConflictType = NoteConflictType.DefaultValue;
    const tagId: number | undefined = isInitialSFNote === true ? undefined : 1;
    const noteThread: NoteThread = {
      originalContextBefore: 'before selection ',
      originalContextAfter: ' after selection',
      originalSelectedText: 'selected text',
      dataId: 'thread01',
      ownerRef: 'user01',
      position: { start: 1, length: 1 },
      projectRef: TestEnvironment.PROJECT01,
      verseRef: { bookNum: 40, chapterNum: 1, verseNum: 7 },
      status: NoteStatus.Todo,
      assignment: AssignedUsers.TeamUser,
      publishedToSF: !!isInitialSFNote,
      notes: [
        {
          dataId: 'note01',
          type,
          conflictType,
          threadId: 'thread01',
          content: 'note',
          extUserId: 'user01',
          deleted: false,
          ownerRef: 'user01',
          status: NoteStatus.Todo,
          tagId,
          dateCreated: '',
          dateModified: '',
          assignment: TestEnvironment.paratextUsers.find(u => u.sfUserId === 'user01')!.opaqueUserId
        },
        {
          dataId: 'note02',
          type,
          conflictType,
          threadId: 'thread01',
          content: 'note02',
          extUserId: 'user01',
          deleted: false,
          ownerRef: 'user01',
          status: NoteStatus.Resolved,
          tagId,
          dateCreated: '',
          dateModified: '',
          assignment: AssignedUsers.TeamUser
        },
        {
          dataId: 'note03',
          type,
          conflictType,
          threadId: 'thread01',
          content: 'note03',
          extUserId: 'user01',
          deleted: true,
          ownerRef: 'user01',
          status: NoteStatus.Todo,
          tagId,
          dateCreated: '',
          dateModified: ''
        },
        {
          dataId: 'note04',
          type,
          conflictType,
          threadId: 'thread01',
          content: 'note04',
          extUserId: 'user01',
          deleted: false,
          ownerRef: 'user01',
          status: NoteStatus.Unspecified,
          dateCreated: '',
          dateModified: ''
        },
        {
          dataId: 'note05',
          type,
          conflictType,
          threadId: 'thread01',
          content: 'note05',
          extUserId: 'user01',
          deleted: false,
          ownerRef: 'user01',
          status: NoteStatus.Done,
          tagId,
          dateCreated: '',
          dateModified: ''
        }
      ]
    };
    if (reattachedContent != null) {
      noteThread.notes.push({
        dataId: 'reattached01',
        type,
        conflictType,
        threadId: 'thread01',
        content: reattachedContent,
        extUserId: 'user01',
        deleted: false,
        ownerRef: 'user01',
        status: reattachedContent === '' ? NoteStatus.Unspecified : NoteStatus.Todo,
        tagId: reattachedContent === '' ? undefined : 1,
        dateCreated: '',
        dateModified: '',
        reattached: TestEnvironment.reattached
      });
      noteThread.notes.push({
        dataId: 'reattached02',
        type,
        conflictType,
        threadId: 'thread01',
        content: 'reattached02',
        extUserId: 'user01',
        deleted: false,
        ownerRef: 'user01',
        status: NoteStatus.Unspecified,
        tagId: 1,
        dateCreated: '',
        dateModified: '',
        reattached: TestEnvironment.reattached
      });
    }
    return noteThread;
  }

  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  readonly component: NoteDialogComponent;
  readonly dialogRef: MatDialogRef<NoteDialogComponent, boolean>;
  dialogResult?: boolean;

  constructor({
    includeSnapshots = true,
    isRightToLeftProject,
    currentUserId = 'user01',
    noteThread,
    verseRef,
    noteTagId
  }: TestEnvironmentConstructorArgs = {}) {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const textDocId = new TextDocId(TestEnvironment.PROJECT01, 40, 1);
    const configData: NoteDialogData = {
      projectId: TestEnvironment.PROJECT01,
      textDocId,
      threadId: noteThread?.dataId,
      verseRef
    };
    TestEnvironment.testProjectProfile.isRightToLeft = isRightToLeftProject;
    TestEnvironment.testProject.isRightToLeft = isRightToLeftProject;
    TestEnvironment.testProjectProfile.translateConfig.defaultNoteTagId = noteTagId;
    TestEnvironment.testProject.translateConfig.defaultNoteTagId = noteTagId;
    this.dialogRef = TestBed.inject(MatDialog).open(NoteDialogComponent, { data: configData });
    this.component = this.dialogRef.componentInstance;
    tick();

    if (includeSnapshots) {
      this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
        id: configData.projectId,
        data: TestEnvironment.testProject
      });
      this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
        id: configData.projectId,
        data: TestEnvironment.testProjectProfile
      });
      const textData = getTextDoc(textDocId);
      this.realtimeService.addSnapshot<TextData>(TextDoc.COLLECTION, {
        id: textDocId.toString(),
        data: textData,
        type: RichText.type.name
      });
      if (noteThread != null) {
        this.realtimeService.addSnapshot<NoteThread>(NoteThreadDoc.COLLECTION, {
          id: [TestEnvironment.PROJECT01, noteThread.dataId].join(':'),
          data: noteThread
        });
      }
    }

    when(mockedProjectService.getNoteThread(anything())).thenCall(id =>
      this.realtimeService.subscribe(NoteThreadDoc.COLLECTION, id)
    );

    when(mockedProjectService.getProfile(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id)
    );

    when(mockedProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id)
    );

    when(mockedProjectService.tryGetForRole(anything(), anything())).thenCall((id, role) =>
      isParatextRole(role) ? this.realtimeService.subscribe(SFProjectDoc.COLLECTION, id) : undefined
    );

    when(mockedUserService.currentUserId).thenReturn(currentUserId);
    this.dialogRef
      .afterClosed()
      .toPromise()
      .then(result => (this.dialogResult = result));

    when(mockedFeatureFlagService.allowAddingNotes).thenReturn({ enabled: true } as FeatureFlag);

    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);

    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
    flush();
  }

  get flagIcon(): string {
    return this.overlayContainerElement.query(By.css('h1 img')).nativeElement.getAttribute('src');
  }

  get verseRef(): string {
    return this.overlayContainerElement.query(By.css('h1 .verse-reference')).nativeElement.textContent;
  }

  get notes(): DebugElement[] {
    return this.overlayContainerElement.queryAll(By.css('.notes .note'));
  }

  get noteText(): DebugElement {
    return this.overlayContainerElement.query(By.css('.note-text'));
  }

  get segmentText(): DebugElement {
    return this.overlayContainerElement.query(By.css('.segment-text'));
  }

  get noteInputElement(): DebugElement {
    return this.overlayContainerElement.query(By.css('mat-form-field textarea'));
  }

  get dialogContentArea(): DebugElement {
    return this.overlayContainerElement.query(By.css('mat-dialog-content'));
  }

  get threadAssignedUser(): DebugElement {
    return this.overlayContainerElement.query(By.css('#assignedUser'));
  }

  get editButton(): DebugElement {
    return this.overlayContainerElement.query(By.css('.edit-actions .edit-button'));
  }

  get saveButton(): DebugElement {
    return this.overlayContainerElement.query(By.css('button.save-button'));
  }

  private get overlayContainerElement(): DebugElement {
    return this.fixture.debugElement.parent!.query(By.css('.cdk-overlay-container'));
  }

  closeDialog(): void {
    this.overlayContainerElement.query(By.css('button.close-button')).nativeElement.click();
    tick(matDialogCloseDelay);
  }

  clickEditNote(): void {
    this.editButton.nativeElement.click();
    tick();
    this.fixture.detectChanges();
  }

  clickDeleteNote(): void {
    this.overlayContainerElement.query(By.css('.delete-button')).nativeElement.click();
    flush();
    this.fixture.detectChanges();
  }

  getNoteThreadDoc(threadId: string): NoteThreadDoc {
    const id: string = [TestEnvironment.PROJECT01, threadId].join(':');
    return this.realtimeService.get<NoteThreadDoc>(NoteThreadDoc.COLLECTION, id);
  }

  getProjectProfileDoc(projectId: string): SFProjectProfileDoc {
    return this.realtimeService.get<SFProjectDoc>(SFProjectProfileDoc.COLLECTION, projectId);
  }

  noteHasEditActions(noteNumber: number): boolean {
    return (
      this.overlayContainerElement.query(By.css('.notes .note:nth-child(' + noteNumber + ') .edit-actions')) != null
    );
  }

  enterNoteContent(noteContent: string): void {
    const textAreaInput: HTMLTextAreaElement = this.noteInputElement.nativeElement;
    textAreaInput.value = noteContent;
    textAreaInput.dispatchEvent(new Event('input'));
    tick();
    this.fixture.detectChanges();
  }

  submit(): void {
    this.saveButton.nativeElement.click();
    tick(matDialogCloseDelay);
  }

  toggleSegmentButton(): void {
    this.component.toggleSegmentText();
    tick();
    this.fixture.detectChanges();
  }
}
