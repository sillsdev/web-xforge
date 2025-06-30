import { HttpClient } from '@angular/common/http';
import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { translate } from '@ngneat/transloco';
import { VerseRef } from '@sillsdev/scripture';
import { cloneDeep } from 'lodash-es';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { createTestUserProfile } from 'realtime-server/lib/esm/common/models/user-test-data';
import { BiblicalTerm, getBiblicalTermDocId } from 'realtime-server/lib/esm/scriptureforge/models/biblical-term';
import { Note, REATTACH_SEPARATOR } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { SF_TAG_ICON } from 'realtime-server/lib/esm/scriptureforge/models/note-tag';
import {
  AssignedUsers,
  getNoteThreadDocId,
  NoteConflictType,
  NoteStatus,
  NoteThread,
  NoteType
} from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { SFProject, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import {
  createTestProject,
  createTestProjectProfile
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { createTestProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config-test-data';
import { TextData } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import * as RichText from 'rich-text';
import { firstValueFrom } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { UNKNOWN_COMPONENT_OR_SERVICE } from 'xforge-common/models/realtime-doc';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { ChildViewContainerComponent, configureTestingModule, matDialogCloseDelay } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { BiblicalTermDoc } from '../../../core/models/biblical-term-doc';
import { NoteThreadDoc } from '../../../core/models/note-thread-doc';
import { SFProjectDoc } from '../../../core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../../core/models/sf-type-registry';
import { TextDoc, TextDocId } from '../../../core/models/text-doc';
import { getCombinedVerseTextDoc, getTextDoc, paratextUsersFromRoles } from '../../../shared/test-utils';
import { TranslateModule } from '../../translate.module';
import { NoteDialogComponent, NoteDialogData, NoteDialogResult } from './note-dialog.component';

const mockedHttpClient = mock(HttpClient);
const mockedUserService = mock(UserService);
const mockedDialogService = mock(DialogService);

describe('NoteDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, NoopAnimationsModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: HttpClient, useMock: mockedHttpClient },
      { provide: UserService, useMock: mockedUserService },
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

    expect(env.textMenuButton).toBeTruthy();
    expect(env.component.isSegmentDifferentFromContext).toBeTrue();
    expect(env.noteText.nativeElement.textContent).toEqual('before selection selected text after selection');
    expect(env.segmentText).toBeNull();
    env.toggleSegmentButton();
    expect(env.segmentText.nativeElement.textContent).toEqual(
      `target: chapter 1, verse 7.\ntarget: chapter 1, verse 7 - 2nd paragraph.`
    );
  }));

  it('only show note context if different from segment text', fakeAsync(() => {
    const noteThread = TestEnvironment.getNoteThread();
    noteThread.originalContextBefore = 'target: chapter 1, ';
    noteThread.originalSelectedText = 'verse 7.\ntarget: chapter 1, verse 7 ';
    noteThread.originalContextAfter = '- 2nd paragraph.';
    env = new TestEnvironment({ noteThread });
    expect(env.textMenuButton).toBeFalsy();
    expect(env.component.isSegmentDifferentFromContext).toBeFalse();
  }));

  it('shows segment text for rtl combined verses', fakeAsync(() => {
    const verseRef: VerseRef = new VerseRef('MAT 1:2-3');
    env = new TestEnvironment({ verseRef, isRightToLeftProject: true, combinedVerseTextDoc: true });
    expect(env.noteText.nativeElement.textContent).toBe('target: chapter 1, verse 2-3.');
  }));

  it('shows segment text for rtl multiple verses', fakeAsync(() => {
    const verseRef: VerseRef = new VerseRef('MAT 1:5,7');
    env = new TestEnvironment({ verseRef, isRightToLeftProject: true, combinedVerseTextDoc: true });
    expect(env.noteText.nativeElement.textContent).toBe('target: chapter 1, verse 5,7.');
  }));

  it('should not show deleted notes', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    expect(env.notes.length).toBe(4);
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

  it('invalid reattached note', fakeAsync(() => {
    let reattachedContent: string = 'Reattached content text.';
    env = new TestEnvironment({
      noteThread: TestEnvironment.getNoteThread(reattachedContent, undefined, undefined, true)
    });

    // Check note with status set
    let expectedSrc = '/assets/icons/TagIcons/flag01.png';
    let reattachNote = env.notes[4].nativeElement as HTMLElement;
    expect(reattachNote.querySelector('.content .text')?.textContent).toBeUndefined();
    expect(reattachNote.querySelector('.content .verse-reattached')?.textContent).toBeUndefined();
    expect(reattachNote.querySelector('.content .note-content')!.textContent).toContain(reattachedContent);
    expect(reattachNote.querySelector('img')?.getAttribute('src')).toEqual(expectedSrc);
    expect(reattachNote.querySelector('img')?.getAttribute('title')).toEqual('To do');

    // Check note with no status set
    reattachedContent = 'reattached02';
    expectedSrc = '/assets/icons/TagIcons/flag01.png';
    reattachNote = env.notes[5].nativeElement as HTMLElement;
    expect(reattachNote.querySelector('.content .verse-reattached')?.textContent).toBeUndefined();
    expect(reattachNote.querySelector('.content .note-content')?.textContent).toContain(reattachedContent);
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
    expect(env.threadAssignedUser).toBeFalsy();
    expect(env.notes[0].nativeElement.querySelector('.assigned-user').textContent).toContain('Paratext user');
    expect(env.notes[1].nativeElement.querySelector('.assigned-user').textContent).toContain('Team');
  }));

  it('should gracefully return when data not ready', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread(), includeSnapshots: false });
    expect(env.component.segmentText).toEqual('');
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
    env = new TestEnvironment({ verseRef: new VerseRef('MAT 1:1'), noteTagId: 6 });
    expect(env.noteInputElement).toBeTruthy();
    expect(env.flagIcon).toEqual('/assets/icons/TagIcons/defaultIcon.png');
    expect(env.verseRef).toEqual('Matthew 1:1');
    expect(env.noteText.nativeElement.innerText).toEqual('target: chapter 1, verse 1.');
    expect(env.threadAssignedUser.nativeElement.textContent).toContain('Unassigned');
  }));

  it('can insert a note', fakeAsync(() => {
    const verseRef = new VerseRef('MAT 1:3');
    env = new TestEnvironment({ verseRef, noteTagId: 2 });
    expect(env.noteInputElement).toBeTruthy();
    expect(env.verseRef).toEqual('Matthew 1:3');
    env.enterNoteContent('Enter note content');
    expect(env.component.currentNoteContent).toEqual('Enter note content');
    expect(env.component.segmentText).toEqual('target: chapter 1, verse 3.');
    env.submit();

    expect(env.dialogResult).toEqual({ noteContent: 'Enter note content', noteDataId: undefined });
  }));

  it('show sf note tag on notes with undefined tag id', fakeAsync(() => {
    const noteThread: NoteThread = TestEnvironment.getNoteThread(undefined, true);
    env = new TestEnvironment({ noteThread });
    expect(env.flagIcon).toEqual('/assets/icons/TagIcons/' + SF_TAG_ICON + '.png');
  }));

  it('does not save note if textarea is empty', fakeAsync(() => {
    env = new TestEnvironment({ verseRef: new VerseRef('MAT 1:1') });
    expect(env.noteInputElement).toBeTruthy();
    env.submit();
    expect(env.noteInputElement).toBeTruthy();
  }));

  it('does not show text area for users without write permissions', fakeAsync(() => {
    const verseRef = new VerseRef('MAT 1:3');
    env = new TestEnvironment({ currentUserId: 'user02', verseRef });
    expect(env.noteInputElement).toBeNull();
    expect(env.saveButton).toBeNull();
  }));

  it('does not save if empty note added to an existing thread', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    expect(env.noteInputElement).toBeTruthy();
    const noteThread: NoteThreadDoc = env.getNoteThreadDoc('dataid01');
    expect(noteThread.data!.notes.length).toEqual(5);
    env.submit();
    expect(noteThread.data!.notes.length).toEqual(5);
    expect(env.dialogResult).toBeFalsy();
  }));

  it('allows adding a note to an existing thread', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    expect(env.noteInputElement).toBeTruthy();
    const content = 'content in the thread';
    env.enterNoteContent(content);
    env.submit();
    expect(env.dialogResult).toEqual({ noteContent: content, noteDataId: undefined });
  }));

  it('allows user to edit the last note in the thread', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread(undefined, undefined, true) });
    // note03 is marked as deleted
    expect(env.notes.length).toEqual(4);
    const noteThread: NoteThreadDoc = env.getNoteThreadDoc('dataid01');
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
    expect(env.dialogResult).toEqual({ noteContent: content, noteDataId: 'note05' });
  }));

  it('allows user to resolve the last note in the thread', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread(undefined, undefined, true) });
    // note03 is marked as deleted
    expect(env.notes.length).toEqual(4);
    const noteThread: NoteThreadDoc = env.getNoteThreadDoc('dataid01');
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
    env.selectResolveOption();
    env.submit();
    expect(env.dialogResult).toEqual({ noteContent: content, noteDataId: 'note05', status: NoteStatus.Resolved });
  }));

  it('does not allow user to edit the last note in the thread if it is not editable', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    // note03 is marked as deleted
    expect(env.notes.length).toEqual(4);
    const noteThread: NoteThreadDoc = env.getNoteThreadDoc('dataid01');
    expect(noteThread.data!.notes[4].content).toEqual('note05');
    const noteNumbers = [1, 2, 3, 4];
    noteNumbers.forEach(n => expect(env.noteHasEditActions(n)).toBe(false));
  }));

  it('allows user to delete the last note in the thread', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread(undefined, undefined, true) });
    // note03 is marked as deleted
    expect(env.notes.length).toEqual(4);
    const noteThread: NoteThreadDoc = env.getNoteThreadDoc('dataid01');
    expect(noteThread.data!.notes.length).toEqual(5);
    expect(env.noteHasEditActions(3)).toBe(false);
    expect(env.noteHasEditActions(4)).toBe(true);
    env.clickDeleteNote();
    verify(mockedDialogService.confirm(anything(), anything())).once();
    expect(env.notes.length).toEqual(3);
    expect(env.noteHasEditActions(3)).toBe(true);
    expect(noteThread.data!.notes.length).toEqual(5);
    expect(noteThread.data!.notes[4].deleted).toBe(true);
  }));

  it('does not allow deleting a note that is not editable', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    expect(env.notes.length).toEqual(4);
    const noteNumbers = [1, 2, 3, 4];
    noteNumbers.forEach(n => expect(env.noteHasEditActions(n)).toBe(false));
  }));

  it('does not delete the note if a user cancels', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread(undefined, undefined, true) });
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
    const noteThread: NoteThreadDoc = env.getNoteThreadDoc('dataid01');
    expect(noteThread.data).toBeTruthy();
    expect(env.noteHasEditActions(1)).toBe(true);
    env.clickDeleteNote();
    verify(mockedDialogService.confirm(anything(), anything())).once();
    expect(env.dialogResult).toEqual({ deleted: true });
    expect(noteThread.data!.notes[0].deleted).toBe(true);
  }));

  it('deletes the thread if the deleted note is the only active note', fakeAsync(() => {
    const noteThread: NoteThread = cloneDeep(TestEnvironment.defaultNoteThread);
    const note: Note = {
      dataId: 'note02',
      threadId: noteThread.dataId,
      ownerRef: 'user01',
      content: 'deleted note',
      dateCreated: '',
      dateModified: '',
      deleted: true,
      type: NoteType.Normal,
      status: NoteStatus.Resolved,
      conflictType: NoteConflictType.DefaultValue
    };
    noteThread.notes.push(note);
    env = new TestEnvironment({ noteThread });
    expect(env.notes.length).toEqual(1);
    const threadDoc: NoteThreadDoc = env.getNoteThreadDoc('dataid01');
    expect(threadDoc).toBeTruthy();
    expect(env.noteHasEditActions(1)).toBe(true);
    env.clickDeleteNote();
    verify(mockedDialogService.confirm(anything(), anything())).once();
    expect(threadDoc.data!.notes[0].deleted).toBe(true);
    expect(env.dialogResult).toEqual({ deleted: true });
  }));

  it('resolves a thread', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    env.selectResolveOption();
    env.submit();
    expect(env.dialogResult).toEqual({ status: NoteStatus.Resolved });
  }));

  it('resolves a thread with content', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    const content = 'This thread is resolved.';
    env.enterNoteContent(content);
    env.selectResolveOption();
    env.submit();
    expect(env.dialogResult).toEqual({ status: NoteStatus.Resolved, noteContent: content, noteDataId: undefined });
  }));

  it('allows changing save option', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread() });
    expect(env.saveButton.nativeElement.textContent).toEqual('Save');
    // open the save option menu trigger
    env.saveOptionsButton.nativeElement.click();
    tick();
    env.fixture.detectChanges();
    expect(env.saveOptionsMenu).not.toBeNull();
    // select resolve from the menu
    const resolveMenuItem: DebugElement = env.saveOptionsMenu.query(By.css('button'));
    expect(resolveMenuItem.nativeElement.textContent).toEqual('Save and resolve');
    resolveMenuItem.nativeElement.click();
    tick(10);
    env.fixture.detectChanges();
    expect(env.component.saveOption).toEqual('resolve');
    expect(env.saveButton.nativeElement.textContent).toEqual('Save and resolve');
  }));

  it('hides save options trigger when user is a commenter', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread(), currentUserId: 'user03' });
    expect(env.saveButton.nativeElement.textContent).toEqual('Save');
    expect(env.saveOptionsButton).toBeNull();
  }));

  it('hides save options trigger when starting a new thread', fakeAsync(() => {
    env = new TestEnvironment({ verseRef: new VerseRef('MAT 1:1') });
    expect(env.component.currentNoteContent).toEqual('');
    expect(env.saveOptionsButton).toBeNull();
    env.submit();
    expect(env.dialogResult).toEqual(undefined);
  }));

  it('hides save options trigger when tag on note thread is restricted resolve', fakeAsync(() => {
    const noteThread: NoteThread = TestEnvironment.getNoteThread();
    const note: Note = {
      dataId: 'note03',
      threadId: noteThread.dataId,
      ownerRef: 'user04',
      content: 'translator note',
      dateCreated: '',
      dateModified: '',
      deleted: true,
      type: NoteType.Normal,
      status: NoteStatus.Resolved,
      conflictType: NoteConflictType.DefaultValue,
      tagId: 5
    };
    noteThread.notes.push(note);
    env = new TestEnvironment({ noteThread, currentUserId: 'user04' });
    expect(env.saveOptionsButton).toBeNull();
    env.closeDialog();
    expect(env.dialogResult).toEqual(undefined);
  }));

  it('show notes in correct date order', fakeAsync(() => {
    const noteThread = TestEnvironment.getNoteThread();
    const currentTime = new Date('2023-03-14T23:00:00Z').getTime();
    let minutes = 0;
    for (const note of noteThread.notes) {
      if (note.dataId === 'note04') {
        note.dateCreated = '2023-03-15T11:00:00+13:00';
      } else {
        note.dateCreated = new Date(currentTime + minutes).toJSON();
      }
      minutes += 60000;
    }
    env = new TestEnvironment({ noteThread });
    expect(noteThread.notes[3].content).toEqual('note04');
    expect(env.notes[0].nativeElement.querySelector('.note-content').textContent).toEqual('note04');
  }));

  it('can insert a biblical terms note', fakeAsync(() => {
    const biblicalTerm = TestEnvironment.defaultBiblicalTerm;
    env = new TestEnvironment({ biblicalTerm });
    expect(env.noteInputElement).toBeTruthy();
    expect(env.verseRef).toEqual('Biblical Term');
    const content = 'Enter note content';
    env.enterNoteContent(content);
    expect(env.component.currentNoteContent).toEqual(content);
    expect(env.component.flagIcon).toEqual('/assets/icons/TagIcons/biblicalterm1.png');
    expect(env.noteText.nativeElement.textContent).toEqual('termId01 (transliteration01) gloss01_en');
    env.submit();

    expect(env.dialogResult).toEqual({ noteContent: content, noteDataId: undefined });
  }));

  it('allows adding a note to an existing biblical term note thread', fakeAsync(() => {
    const biblicalTerm = TestEnvironment.defaultBiblicalTerm;
    const noteThread = TestEnvironment.getNoteThread();
    noteThread.biblicalTermId = biblicalTerm.dataId;
    noteThread.extraHeadingInfo = {
      gloss: 'note_gloss',
      language: 'note_language',
      lemma: 'note_lemma',
      transliteration: 'note_transliteration'
    };

    env = new TestEnvironment({ noteThread, biblicalTerm });
    const noteThreadDoc: NoteThreadDoc = env.getNoteThreadDoc('dataid01');
    expect(noteThreadDoc.data!.notes.length).toEqual(5);
    expect(noteThreadDoc.data!.extraHeadingInfo).not.toBeNull();
    expect(env.verseRef).toEqual('Biblical Term');
    env.enterNoteContent('Enter note content');
    expect(env.component.currentNoteContent).toEqual('Enter note content');
    expect(env.component.flagIcon).toEqual('/assets/icons/TagIcons/biblicalterm1.png');
    expect(env.noteText.nativeElement.textContent).toEqual('note_lemma (note_transliteration) note_gloss');
    expect(env.noteInputElement).toBeTruthy();
    // note 03 is marked deleted and is not displayed
    expect(env.component.notesToDisplay.length).toEqual(4);
    const content = 'content in the thread';
    env.enterNoteContent('content in the thread');
    env.submit();

    expect(env.dialogResult).toEqual({ noteContent: content, noteDataId: undefined });
  }));

  it('shows the current Scripture Forge user as Me', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread(), currentUserId: 'user01' });
    expect(env.notes[0].nativeElement.querySelector('.user-name').textContent).toContain(translate('checking.me'));
  }));

  it('shows the SF note owner name if not synced', fakeAsync(() => {
    const noteThread = TestEnvironment.getNoteThread(undefined, undefined, true);
    noteThread.notes[0].syncUserRef = undefined;
    env = new TestEnvironment({
      noteThread,
      currentUserId: 'user04',
      userProfileId: 'user01',
      userProfile: createTestUserProfile({ displayName: 'User 01' })
    });
    expect(env.notes[0].nativeElement.querySelector('.user-name').textContent).toContain('User 01');
  }));

  it('shows the SF note owner name if the user is a commenter', fakeAsync(() => {
    env = new TestEnvironment({
      noteThread: TestEnvironment.getNoteThread(),
      currentUserId: 'user03',
      userProfileId: 'user01',
      userProfile: createTestUserProfile({ displayName: 'User 01' })
    });
    expect(env.notes[0].nativeElement.querySelector('.user-name').textContent).toContain('User 01');
  }));

  it('shows the SF note owner name if the note was created in SF', fakeAsync(() => {
    env = new TestEnvironment({
      noteThread: TestEnvironment.getNoteThread(undefined, undefined, true),
      currentUserId: 'user04',
      userProfileId: 'user01',
      userProfile: createTestUserProfile({ displayName: 'User 01' })
    });
    expect(env.notes[0].nativeElement.querySelector('.user-name').textContent).toContain('User 01');
  }));

  it('shows the PT note owner name if the note was created in SF and we do not have a user record', fakeAsync(() => {
    env = new TestEnvironment({
      noteThread: TestEnvironment.getNoteThread(undefined, undefined, true),
      currentUserId: 'user04'
    });
    expect(env.notes[0].nativeElement.querySelector('.user-name').textContent).toContain('ptuser01');
  }));

  it('shows Unknown author when the author is unknown', fakeAsync(() => {
    env = new TestEnvironment({ noteThread: TestEnvironment.getNoteThread(), currentUserId: 'user02' });
    expect(env.notes[0].nativeElement.querySelector('.user-name').textContent).toContain(
      translate('checking.unknown_author')
    );
  }));

  it('shows the SF note owner name if created in PT and we have a matching SF user', fakeAsync(() => {
    env = new TestEnvironment({
      noteThread: TestEnvironment.getNoteThread(),
      currentUserId: 'user04',
      userProfileId: 'user01',
      userProfile: createTestUserProfile({ displayName: 'User 01' })
    });
    expect(env.notes[0].nativeElement.querySelector('.user-name').textContent).toContain('User 01');
  }));

  it('shows the PT sync user if created in PT and we do not have a matching SF user', fakeAsync(() => {
    env = new TestEnvironment({
      noteThread: TestEnvironment.getNoteThread(),
      currentUserId: 'user04'
    });
    expect(env.notes[0].nativeElement.querySelector('.user-name').textContent).toContain('ptuser01');
  }));
});

@NgModule({
  imports: [TranslateModule]
})
class DialogTestModule {}

interface TestEnvironmentConstructorArgs {
  includeSnapshots?: boolean;
  isRightToLeftProject?: boolean;
  currentUserId?: string;
  noteThread?: NoteThread;
  verseRef?: VerseRef;
  noteTagId?: number;
  combinedVerseTextDoc?: boolean;
  biblicalTerm?: BiblicalTerm;
  userProfile?: UserProfile;
  userProfileId?: string;
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
    user02: SFProjectRole.Viewer,
    user03: SFProjectRole.Commenter,
    user04: SFProjectRole.ParatextTranslator
  };
  static testProjectProfile: SFProjectProfile = createTestProjectProfile({
    texts: [TestEnvironment.matthewText],
    noteTags: [
      { tagId: 1, name: 'PT Tag 1', icon: 'flag01', creatorResolve: false },
      { tagId: 2, name: 'PT Tag 2', icon: 'circle01', creatorResolve: false },
      { tagId: 3, name: 'PT Tag 3', icon: 'star01', creatorResolve: false },
      { tagId: 4, name: 'PT Tag 4', icon: 'tag01', creatorResolve: false },
      { tagId: 5, name: 'PT Tag 5', icon: 'asterisk01', creatorResolve: true },
      { tagId: 6, name: 'SF Note Tag', icon: 'defaultIcon', creatorResolve: false }
    ],
    userRoles: TestEnvironment.userRoles
  });
  static paratextUsers: ParatextUserProfile[] = paratextUsersFromRoles(TestEnvironment.userRoles);
  static testProject: SFProject = createTestProject({
    ...TestEnvironment.testProjectProfile,
    paratextUsers: TestEnvironment.paratextUsers
  });
  static projectUserConfig: SFProjectUserConfig = createTestProjectUserConfig({
    projectRef: TestEnvironment.PROJECT01,
    ownerRef: 'user01',
    isTargetTextRight: true,
    translationSuggestionsEnabled: false,
    selectedSegment: 'verse_1_1'
  });

  static reattached: string = ['MAT 1:4', 'reattached text', '17', 'before selection ', ' after selection'].join(
    REATTACH_SEPARATOR
  );
  static invalidReattached: string = 'MAT 1:4  invalid note  invalid selection';
  static get defaultBiblicalTerm(): BiblicalTerm {
    return {
      projectRef: 'project01',
      ownerRef: 'user01',
      dataId: 'dataId01',
      termId: 'termId01',
      transliteration: 'transliteration01',
      renderings: ['rendering01'],
      description: 'description01',
      language: 'language01',
      links: ['link01'],
      references: [new VerseRef(1, 1, 1).BBBCCCVVV],
      definitions: {
        en: {
          categories: ['category01_en'],
          domains: ['domain01_en'],
          gloss: 'gloss01_en',
          notes: 'notes01_en'
        },
        es: {
          categories: [],
          domains: [],
          gloss: 'gloss01_es',
          notes: 'notes01_es'
        },
        fr: {
          categories: ['category01_fr'],
          domains: ['domain01_fr'],
          gloss: 'gloss01_fr',
          notes: 'notes01_fr'
        }
      }
    };
  }
  static get defaultNoteThread(): NoteThread {
    return {
      originalContextBefore: '',
      originalContextAfter: '',
      originalSelectedText: '',
      dataId: 'dataid01',
      threadId: 'thread01',
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
          deleted: false,
          editable: true,
          ownerRef: 'user01',
          status: NoteStatus.Todo,
          tagId: 1,
          dateCreated: '',
          dateModified: ''
        }
      ]
    };
  }
  static getNoteThread(
    reattachedContent?: string,
    isInitialSFNote?: boolean,
    editable?: boolean,
    invalidReattachedNote?: boolean
  ): NoteThread {
    const type: NoteType = NoteType.Normal;
    const conflictType: NoteConflictType = NoteConflictType.DefaultValue;
    const tagId: number | undefined = isInitialSFNote === true ? undefined : 1;
    const noteThread: NoteThread = {
      originalContextBefore: 'before selection ',
      originalContextAfter: ' after selection',
      originalSelectedText: 'selected text',
      dataId: 'dataid01',
      threadId: 'thread01',
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
          deleted: false,
          editable,
          ownerRef: 'user01',
          status: NoteStatus.Todo,
          tagId,
          dateCreated: '',
          dateModified: '',
          assignment: TestEnvironment.paratextUsers.find(u => u.sfUserId === 'user01')!.opaqueUserId,
          syncUserRef: TestEnvironment.paratextUsers.find(u => u.sfUserId === 'user01')!.opaqueUserId
        },
        {
          dataId: 'note02',
          type,
          conflictType,
          threadId: 'thread01',
          content: 'note02',
          deleted: false,
          editable,
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
          deleted: true,
          editable,
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
          deleted: false,
          editable,
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
          deleted: false,
          editable,
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
        deleted: false,
        editable,
        ownerRef: 'user01',
        status: reattachedContent === '' ? NoteStatus.Unspecified : NoteStatus.Todo,
        tagId: reattachedContent === '' ? undefined : 1,
        dateCreated: '',
        dateModified: '',
        reattached: invalidReattachedNote ? TestEnvironment.invalidReattached : TestEnvironment.reattached
      });
      noteThread.notes.push({
        dataId: 'reattached02',
        type,
        conflictType,
        threadId: 'thread01',
        content: 'reattached02',
        deleted: false,
        editable,
        ownerRef: 'user01',
        status: NoteStatus.Unspecified,
        tagId: 1,
        dateCreated: '',
        dateModified: '',
        reattached: invalidReattachedNote ? TestEnvironment.invalidReattached : TestEnvironment.reattached
      });
    }
    return noteThread;
  }

  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  readonly component: NoteDialogComponent;
  readonly dialogRef: MatDialogRef<NoteDialogComponent, NoteDialogResult | undefined>;
  dialogResult?: NoteDialogResult;

  constructor({
    includeSnapshots = true,
    isRightToLeftProject,
    currentUserId = 'user01',
    noteThread,
    verseRef,
    noteTagId,
    combinedVerseTextDoc,
    biblicalTerm,
    userProfile,
    userProfileId
  }: TestEnvironmentConstructorArgs = {}) {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const textDocId = new TextDocId(TestEnvironment.PROJECT01, 40, 1);
    const configData: NoteDialogData = {
      projectId: TestEnvironment.PROJECT01,
      textDocId,
      threadDataId: noteThread?.dataId,
      verseRef,
      biblicalTermId: biblicalTerm?.dataId
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
      const textData: TextData = combinedVerseTextDoc
        ? getCombinedVerseTextDoc(textDocId, isRightToLeftProject)
        : getTextDoc(textDocId);
      this.realtimeService.addSnapshot<TextData>(TextDoc.COLLECTION, {
        id: textDocId.toString(),
        data: textData,
        type: RichText.type.name
      });
      if (noteThread != null) {
        this.realtimeService.addSnapshot<NoteThread>(NoteThreadDoc.COLLECTION, {
          id: getNoteThreadDocId(configData.projectId, noteThread.dataId),
          data: noteThread
        });
      }
      if (biblicalTerm != null) {
        this.realtimeService.addSnapshot<BiblicalTerm>(BiblicalTermDoc.COLLECTION, {
          id: getBiblicalTermDocId(configData.projectId, biblicalTerm.dataId),
          data: biblicalTerm
        });
      }
      this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
        id: getSFProjectUserConfigDocId(configData.projectId, currentUserId),
        data: TestEnvironment.projectUserConfig
      });
      if (userProfile != null && userProfileId != null) {
        this.realtimeService.addSnapshot<UserProfile>(UserProfileDoc.COLLECTION, {
          id: userProfileId,
          data: userProfile
        });
      }
    }

    when(mockedUserService.currentUserId).thenReturn(currentUserId);
    firstValueFrom(this.dialogRef.afterClosed()).then(result => (this.dialogResult = result));

    when(mockedUserService.getProfile(anything())).thenCall(id =>
      this.realtimeService.get(UserProfileDoc.COLLECTION, id, UNKNOWN_COMPONENT_OR_SERVICE)
    );
    when(mockedUserService.subscribeProfile(anything(), anything())).thenCall((id, subscriber) =>
      this.realtimeService.get(UserProfileDoc.COLLECTION, id, subscriber)
    );

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
    return this.overlayContainerElement.query(By.css('.save-button'));
  }

  get saveOptionsButton(): DebugElement {
    return this.overlayContainerElement.query(By.css('.save-options-trigger'));
  }

  get saveOptionsMenu(): DebugElement {
    return this.overlayContainerElement.query(By.css('.save-options-menu'));
  }

  get textMenuButton(): DebugElement {
    return this.overlayContainerElement.query(By.css('#text-menu-button'));
  }

  private get overlayContainerElement(): DebugElement {
    return this.fixture.debugElement.parent!.query(By.css('.cdk-overlay-container'));
  }

  closeDialog(): void {
    this.overlayContainerElement.query(By.css('.close-button')).nativeElement.click();
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

  selectResolveOption(): void {
    this.component.saveOption = 'resolve';
    tick();
    this.fixture.detectChanges();
  }

  getNoteThreadDoc(threadDataId: string): NoteThreadDoc {
    const id: string = getNoteThreadDocId(TestEnvironment.PROJECT01, threadDataId);
    return this.realtimeService.get<NoteThreadDoc>(NoteThreadDoc.COLLECTION, id, UNKNOWN_COMPONENT_OR_SERVICE);
  }

  getProjectUserConfigDoc(projectId: string, userId: string): SFProjectUserConfigDoc {
    const id: string = getSFProjectUserConfigDocId(projectId, userId);
    return this.realtimeService.get<SFProjectUserConfigDoc>(
      SFProjectUserConfigDoc.COLLECTION,
      id,
      UNKNOWN_COMPONENT_OR_SERVICE
    );
  }

  getNoteContent(noteNumber: number): string {
    return this.notes[noteNumber - 1].query(By.css('.note-content')).nativeElement.textContent;
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
