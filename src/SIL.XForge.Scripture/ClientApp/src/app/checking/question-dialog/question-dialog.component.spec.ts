import { CommonModule } from '@angular/common';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogConfig, MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { VerseRef } from '@sillsdev/scripture';
import { CookieService } from 'ngx-cookie-service';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { getQuestionDocId, Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { getTextDocId } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { fromVerseRef } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import * as RichText from 'rich-text';
import { of } from 'rxjs';
import { anything, deepEqual, instance, mock, objectContaining, spy, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { DialogService } from 'xforge-common/dialog.service';
import { FileService } from 'xforge-common/file.service';
import { createStorageFileData, FileType } from 'xforge-common/models/file-offline-data';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import {
  ChildViewContainerComponent,
  configureTestingModule,
  getAudioBlob,
  TestTranslocoModule
} from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { Delta, TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { ScriptureChooserDialogComponent } from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { getTextDoc } from '../../shared/test-utils';
import { EDITOR_READY_TIMEOUT } from '../../shared/text/text.component';
import { CheckingModule } from '../checking.module';
import { AudioAttachment } from '../checking/checking-audio-player/checking-audio-player.component';
import { QuestionDialogComponent, QuestionDialogData } from './question-dialog.component';

const mockedAuthService = mock(AuthService);
const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
const mockedFileService = mock(FileService);

describe('QuestionDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [
      ReactiveFormsModule,
      FormsModule,
      DialogTestModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: UserService, useMock: mockedUserService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: FileService, useMock: mockedFileService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService }
    ]
  }));

  let env: TestEnvironment;
  afterEach(fakeAsync(() => {
    if (env.cancelButton != null) {
      env.clickElement(env.cancelButton);
    }
    flush();
  }));

  it('should allow user to cancel', fakeAsync(() => {
    env = new TestEnvironment();
    env.clickElement(env.cancelButton);
    flush();
    expect(env.afterCloseCallback).toHaveBeenCalledWith('close');
  }));

  it('should not allow Save without required fields', fakeAsync(() => {
    env = new TestEnvironment();
    env.clickElement(env.saveButton);
    flush();
    expect(env.afterCloseCallback).not.toHaveBeenCalled();
  }));

  it('should show error text for required fields', fakeAsync(() => {
    env = new TestEnvironment();
    expect(env.errorText[0].classes['visible']).not.toBeDefined();

    env.component.scriptureStart.markAsTouched();
    env.clickElement(env.saveButton);
    flush();

    expect(env.scriptureStartValidationMsg.textContent).toContain('Required');
    expect(env.scriptureStartValidationMsg.textContent).not.toContain('e.g.');
    expect(env.scriptureStartValidationMsg.textContent).not.toContain('range');
    expect(env.errorText[0].classes['visible']).toBe(true);
  }));

  it('does not accept just whitespace for a question', fakeAsync(() => {
    env = new TestEnvironment();
    flush();

    env.inputValue(env.questionInput, '');
    env.clickElement(env.saveButton);
    expect(env.component.textAndAudio?.text.valid).toBe(false);
    expect(env.component.textAndAudio?.text.errors!.invalid).toBeDefined();

    env.inputValue(env.questionInput, ' ');
    env.clickElement(env.saveButton);
    expect(env.component.textAndAudio?.text.valid).toBe(false);
    expect(env.component.textAndAudio?.text.errors!.invalid).toBeDefined();

    env.inputValue(env.questionInput, '\n');
    env.clickElement(env.saveButton);
    expect(env.component.textAndAudio?.text.valid).toBe(false);
    expect(env.component.textAndAudio?.text.errors!.invalid).toBeDefined();
  }));

  it('should validate verse fields', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    expect(env.component.versesForm.valid).toBe(false);
    expect(env.component.scriptureStart.valid).toBe(false);
    // scriptureEnd starts disabled, and therefore invalid
    expect(env.component.scriptureEnd.valid).toBe(false);
    expect(env.component.scriptureStart.errors!.required).toBe(true);
    env.component.scriptureStart.setValue('MAT');
    expect(env.component.scriptureStart.errors!.verseFormat).toBe(true);
    env.component.scriptureStart.setValue('MAT 1:1');
    expect(env.component.scriptureStart.valid).toBe(true);
    expect(env.component.scriptureStart.errors).toBeNull();
    env.component.scriptureStart.setValue('MAT 1:1a');
    expect(env.component.scriptureStart.errors).toBeNull();
    env.component.scriptureStart.setValue('TIT 1:1');
    expect(env.component.scriptureStart.errors!.verseRange).toBe(true);
    env.component.scriptureStart.setValue('MAT 1:26');
    expect(env.component.scriptureStart.errors!.verseRange).toBe(true);
    env.component.scriptureStart.setValue('MAT 1:25');
    expect(env.component.scriptureStart.errors).toBeNull();

    expect(env.component.scriptureEnd.enabled).toBe(true);
    env.component.scriptureEnd.setValue('MAT');
    expect(env.component.scriptureEnd.errors!.verseFormat).toBe(true);
    env.component.scriptureEnd.setValue('MAT 1:1');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    env.component.scriptureEnd.setValue('MAT 1:1a');
    expect(env.component.scriptureEnd.errors).toBeNull();
    env.component.scriptureEnd.setValue('TIT 1:1');
    expect(env.component.scriptureEnd.errors!.verseRange).toBe(true);
    env.component.scriptureEnd.setValue('MAT 1:26');
    expect(env.component.scriptureEnd.errors!.verseRange).toBe(true);
    env.component.scriptureEnd.setValue('MAT 1:25');
    expect(env.component.scriptureEnd.errors).toBeNull();
    env.component.scriptureEnd.setValue('JHN 1:1');
    expect(env.component.scriptureEnd.errors!.verseRange).toBe(true);
  }));

  it('should produce error', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    const invalidVerses = [
      'MAT 1',
      'MAT a1',
      'MAT 1:1#',
      'MAT 1:1c',
      'MAT 1:aa',
      'MAT 1:1a2',
      'MAT 1:1,',
      'MAT 1:1--2',
      'MAT 1:1,2:1'
    ];
    for (const v of invalidVerses) {
      env.component.scriptureStart.setValue(v);
      expect(env.component.scriptureStart.errors!.verseFormat).toBe(true);
    }
    // set scriptureStart to valid value so scriptureEnd is enabled
    env.component.scriptureStart.setValue('MAT 1:1');
    flush();
    for (const v of invalidVerses) {
      env.component.scriptureEnd.setValue(v);
      expect(env.component.scriptureEnd.errors!.verseFormat).toBe(true);
    }
  }));

  it('should set default verse and text direction when provided', fakeAsync(() => {
    const verseRef: VerseRef = new VerseRef('LUK 1:1');
    env = new TestEnvironment(undefined, verseRef, true);
    flush();
    expect(env.component.scriptureStart.value).toBe('LUK 1:1');
    expect(env.component.isTextRightToLeft).toBe(true);
  }));

  it('should validate matching book and chapter', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('MAT 1:2');
    expect(env.component.scriptureStart.valid).toBe(true);
    expect(env.component.scriptureStart.errors).toBeNull();
    env.component.scriptureEnd.setValue('LUK 1:1');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.versesForm.errors!.verseDifferentBookOrChapter).toBe(true);
    env.component.scriptureEnd.setValue('MAT 2:1');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.versesForm.errors!.verseDifferentBookOrChapter).toBe(true);
    env.component.scriptureEnd.setValue('MAT 1:2');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.versesForm.errors).toBeNull();
  }));

  it('should validate start verse is before or same as end verse', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('MAT 1:2');
    expect(env.component.scriptureStart.valid).toBe(true);
    expect(env.component.scriptureStart.errors).toBeNull();
    env.component.scriptureEnd.setValue('MAT 1:1');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.versesForm.errors!.verseBeforeStart).toBe(true);
    env.component.scriptureEnd.setValue('MAT 1:2');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.versesForm.errors).toBeNull();
    env.component.scriptureEnd.setValue('MAT 1:3');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.versesForm.errors).toBeNull();
  }));

  it('opens reference chooser, uses result', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('MAT 3:4');
    expect(env.component.scriptureStart.value).not.toEqual('LUK 1:2');

    env.clickElement(env.scriptureStartInputIcon);
    flush();
    verify(
      env.dialogServiceSpy.openMatDialog(anything(), objectContaining({ data: { input: new VerseRef('MAT 3:4') } }))
    ).once();
    flush();
    expect(env.component.scriptureStart.value).toEqual('LUK 1:2');
  }));

  // Needed for validation error messages to appear
  it('control marked as touched+dirty after reference chooser', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    // scriptureStart control starts off untouched+undirty and changes
    env.component.scriptureStart.setValue('MAT 3:4');
    expect(env.component.scriptureStart.touched).toBe(false);
    expect(env.component.scriptureStart.dirty).toBe(false);
    env.clickElement(env.scriptureStartInputIcon);
    flush();

    expect(env.component.scriptureStart.touched).toBe(true);
    expect(env.component.scriptureStart.dirty).toBe(true);

    // scriptureEnd changes the same
    env.component.scriptureEnd.setValue('MAT 3:4');
    expect(env.component.scriptureEnd.touched).toBe(false);
    expect(env.component.scriptureEnd.dirty).toBe(false);
    env.clickElement(env.scriptureEndInputIcon);
    flush();

    expect(env.component.scriptureEnd.touched).toBe(true);
    expect(env.component.scriptureEnd.dirty).toBe(true);
  }));

  it('control marked as touched after reference chooser closed', fakeAsync(() => {
    env = new TestEnvironment();
    when(env.mockedScriptureChooserMatDialogRef.afterOpened()).thenReturn(of());
    when(env.mockedScriptureChooserMatDialogRef.afterClosed()).thenReturn(of('close'));
    flush();

    env.clickElement(env.scriptureStartInputIcon);
    flush();

    verify(env.dialogServiceSpy.openMatDialog(anything(), anything())).once();
    flush();

    expect(env.component.scriptureStart.touched).toBe(true);
    expect(env.component.scriptureStart.dirty).toBe(false);
  }));

  it('passes start reference to end-reference chooser', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    expect(env.component.scriptureEnd.enabled).toBe(false);
    env.component.scriptureStart.setValue('LUK 1:1');
    env.component.scriptureEnd.setValue('GEN 5:6');
    tick();
    env.fixture.detectChanges();
    expect(env.component.scriptureEnd.enabled).toBe(true);

    env.clickElement(env.scriptureEndInputIcon);
    // Dialog receives unhelpful input value that can be ignored.
    // rangeStart should have been passed in, and from scriptureStart value.
    verify(
      env.dialogServiceSpy.openMatDialog(
        anything(),
        objectContaining({ data: { input: new VerseRef('GEN 5:6'), rangeStart: new VerseRef('LUK 1:1') } })
      )
    ).once();
    flush();
    expect(env.component.scriptureEnd.value).toEqual('LUK 1:2');
  }));

  it('does not pass start reference as range start when opening start-reference chooser', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('LUK 1:1');

    env.clickElement(env.scriptureStartInputIcon);
    flush();
    // rangeStart should not have been passed in.
    verify(
      env.dialogServiceSpy.openMatDialog(
        anything(),
        objectContaining({ data: { input: new VerseRef('LUK 1:1'), rangeStart: undefined } })
      )
    ).once();
    flush();
    expect(env.component.scriptureStart.value).toEqual('LUK 1:2');
  }));

  it('disables end-reference if start-reference is invalid', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    tick(EDITOR_READY_TIMEOUT);
    env.inputValue(env.scriptureStartInput, 'LUK 1:1');
    expect(env.component.scriptureEnd.disabled).toBe(false);
    env.inputValue(env.scriptureStartInput, 'LUK 99:1');
    expect(env.component.scriptureEnd.disabled).toBe(true);
    // Gets re-enabled
    env.inputValue(env.scriptureStartInput, 'LUK 1:1');
    expect(env.component.scriptureEnd.disabled).toBe(false);
  }));

  it('does not enable end-reference until start-reference is changed', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    expect(env.component.scriptureEnd.disabled).toBe(true);
    env.inputValue(env.scriptureStartInput, 'LUK 1:1');
    expect(env.component.scriptureEnd.disabled).toBe(false);
  }));

  it('allows a question without text if audio is provided', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    env.inputValue(env.questionInput, '');
    env.clickElement(env.saveButton);
    expect(env.component.textAndAudio?.text.valid).toBe(false);
    expect(env.component.textAndAudio?.text.errors!.invalid).not.toBeNull();
    // Test that audio recorded results in a valid questionText control
    env.setAudioStatus('processed');
    expect(env.component.textAndAudio?.text.valid).toBe(true);
    expect(env.component.textAndAudio?.text.errors).toBeNull();
    // Removing the audio sets the validators on questionText
    env.setAudioStatus('reset');
    env.clickElement(env.saveButton);
    expect(env.component.textAndAudio?.text.valid).toBe(false);
    expect(env.component.textAndAudio?.text.errors!.invalid).not.toBeNull();
  }));

  it('should not save with no text and audio permission is denied', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    env.inputValue(env.questionInput, '');
    env.clickElement(env.saveButton);
    expect(env.component.textAndAudio?.text.valid).toBe(false);
    expect(env.component.textAndAudio?.text.errors!.invalid).not.toBeNull();
    // Test that audio permission was blocked and validation is still invalid
    env.setAudioStatus('denied');
    expect(env.component.textAndAudio?.text.valid).toBe(false);
    expect(env.component.textAndAudio?.text.errors!.invalid).not.toBeNull();
  }));

  it('display quill editor', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    expect(env.quillEditor).not.toBeNull();
    expect(env.component.textDocId).toBeUndefined();
    env.component.scriptureStart.setValue('LUK 1:1');
    tick(500);
    env.fixture.detectChanges();
    tick(500);
    const textDocId = new TextDocId('project01', 42, 1, 'target');
    expect(env.component.textDocId!.toString()).toBe(textDocId.toString());
    verify(mockedProjectService.getText(deepEqual(textDocId))).once();
    expect(env.isSegmentHighlighted('1')).toBe(true);
    expect(env.isSegmentHighlighted('2')).toBe(false);
  }));

  it('retrieves scripture text on editing a question', fakeAsync(() => {
    env = new TestEnvironment({
      dataId: 'question01',
      ownerRef: 'user01',
      projectRef: 'project01',
      verseRef: fromVerseRef(new VerseRef('LUK 1:3')),
      answers: [],
      isArchived: false,
      dateCreated: '',
      dateModified: '',
      audioUrl: 'test-audio-short.mp3'
    });
    flush();
    const textDocId = new TextDocId('project01', 42, 1, 'target');
    env.fixture.detectChanges();
    tick(EDITOR_READY_TIMEOUT);
    env.fixture.detectChanges();
    expect(env.component.textDocId!.toString()).toBe(textDocId.toString());
    verify(mockedProjectService.getText(deepEqual(textDocId))).once();
    expect(env.component.selection!.toString()).toEqual('LUK 1:3');
    expect(env.component.textAndAudio?.input?.audioUrl).toBeDefined();
  }));

  it('displays error editing end reference to different book', fakeAsync(() => {
    env = new TestEnvironment({
      dataId: 'question01',
      ownerRef: 'user01',
      projectRef: 'project01',
      verseRef: fromVerseRef(new VerseRef('LUK 1:3')),
      answers: [],
      isArchived: false,
      dateCreated: '',
      dateModified: ''
    });
    flush();
    tick(EDITOR_READY_TIMEOUT);
    expect(env.component.scriptureStart.value).toBe('LUK 1:3');
    env.component.scriptureEnd.setValue('MAT 1:2');
    env.component.scriptureEnd.markAsTouched();
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.versesForm.errors!.verseDifferentBookOrChapter).toBe(true);
    env.clickElement(env.saveButton);
    expect(env.scriptureEndInput.classList).toContain('mat-form-field-invalid');
    expect(env.scriptureEndValidationMsg.textContent).toContain('Must be the same book and chapter');
  }));

  it('displays error editing start reference to a different book', fakeAsync(() => {
    env = new TestEnvironment({
      dataId: 'question01',
      ownerRef: 'user01',
      projectRef: 'project01',
      verseRef: fromVerseRef(new VerseRef('LUK 1:3-4')),
      answers: [],
      isArchived: false,
      dateCreated: '',
      dateModified: ''
    });
    flush();
    tick(EDITOR_READY_TIMEOUT);
    env.component.scriptureStart.setValue('MAT 1:2');
    env.component.scriptureStart.markAsTouched();
    expect(env.component.versesForm.errors!.verseDifferentBookOrChapter).toBe(true);
    env.clickElement(env.saveButton);
    expect(env.scriptureEndInput.classList).toContain('mat-form-field-invalid');
    expect(env.scriptureEndValidationMsg.textContent).toContain('Must be the same book and chapter');
  }));

  it('generate correct verse ref when start and end mismatch only by case or insignificant zero', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('LUK 1:1');
    env.component.scriptureEnd.setValue('luk 1:1');

    flush();
    expect(env.component.selection!.toString()).toEqual('LUK 1:1');

    env.component.scriptureEnd.setValue('LUK 1:01');
    flush();
    expect(env.component.selection!.toString()).toEqual('LUK 1:1');
  }));

  it('should handle invalid start reference when end reference exists', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('nonsense');
    env.component.scriptureEnd.setValue('LUK 1:1');
    expect(() => {
      env.component.updateSelection();
    }).not.toThrow();
  }));

  it('should not highlight range if chapter or book differ', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('MAT 1:1');
    env.component.scriptureEnd.setValue('LUK 1:2');
    tick(500);
    env.fixture.detectChanges();
    tick(500);
    expect(env.isSegmentHighlighted('1')).toBe(false);
  }));

  it('should clear highlight when starting ref is cleared', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('LUK 1:1');
    tick(500);
    env.fixture.detectChanges();
    tick(500);
    // verify initial highlight
    expect(env.isSegmentHighlighted('1')).toBe(true);
    // SUT
    // clear scriptureStart
    env.component.scriptureStart.setValue('');
    tick(500);
    env.fixture.detectChanges();
    tick(500);
    expect(env.isSegmentHighlighted('1')).toBe(false);
    // reset scriptureStart
    flush();
    env.component.scriptureStart.setValue('LUK 1:1');
    tick(500);
    env.fixture.detectChanges();
    tick(500);
    // verify re-apply of the highlight
    expect(env.isSegmentHighlighted('1')).toBe(true);
  }));

  it('should clear highlight when end ref is invalid', fakeAsync(() => {
    env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('LUK 1:1');
    env.component.scriptureEnd.setValue('LUK 1:2');
    tick(500);
    env.fixture.detectChanges();
    tick(500);
    // verify initial highlight
    expect(env.isSegmentHighlighted('1')).toBe(true);
    // SUT
    // make scriptureEnd bad
    env.component.scriptureEnd.setValue('LUK 91:2');
    tick(500);
    env.fixture.detectChanges();
    tick(500);
    expect(env.isSegmentHighlighted('1')).toBe(false);
    // clear scriptureEnd
    flush();
    env.component.scriptureEnd.setValue('');
    tick(500);
    env.fixture.detectChanges();
    tick(500);
    // verify re-apply of the highlight
    expect(env.isSegmentHighlighted('1')).toBe(true);
  }));
});

@NgModule({
  declarations: [ScriptureChooserDialogComponent],
  exports: [ScriptureChooserDialogComponent],
  imports: [CommonModule, UICommonModule, CheckingModule, TestTranslocoModule, NoopAnimationsModule],
  providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
})
class DialogTestModule {}

class TestEnvironment {
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly component: QuestionDialogComponent;
  readonly dialogRef: MatDialogRef<QuestionDialogComponent>;
  readonly afterCloseCallback: jasmine.Spy;
  readonly dialogServiceSpy: DialogService;

  readonly mockedScriptureChooserMatDialogRef = mock(MatDialogRef);

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(question?: Question, defaultVerseRef?: VerseRef, isRtl: boolean = false) {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const viewContainerRef = this.fixture.componentInstance.childViewContainer;
    let questionDoc: QuestionDoc | undefined;
    if (question != null) {
      const questionId = getQuestionDocId(question.projectRef, question.dataId);
      this.realtimeService.addSnapshot(QuestionDoc.COLLECTION, {
        id: questionId,
        data: question
      });
      questionDoc = this.realtimeService.get<QuestionDoc>(QuestionDoc.COLLECTION, questionId);
      questionDoc.onlineFetch();
    }
    const textsByBookId = {
      MAT: {
        bookNum: 40,
        hasSource: false,
        chapters: [
          { number: 1, lastVerse: 25, isValid: true, permissions: {} },
          { number: 2, lastVerse: 23, isValid: true, permissions: {} }
        ],
        permissions: {}
      },
      LUK: {
        bookNum: 42,
        hasSource: false,
        chapters: [{ number: 1, lastVerse: 80, isValid: true, permissions: {} }],
        permissions: {}
      },
      JHN: {
        bookNum: 43,
        hasSource: false,
        chapters: [{ number: 1, lastVerse: 0, isValid: true, permissions: {} }],
        permissions: {}
      }
    };
    this.realtimeService.addSnapshot(SFProjectProfileDoc.COLLECTION, {
      id: 'project01',
      data: createTestProjectProfile({ texts: Object.values(textsByBookId) })
    });
    const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, 'project01');
    const config: MatDialogConfig<QuestionDialogData> = {
      data: {
        questionDoc,
        projectDoc,
        textsByBookId,
        projectId: 'project01',
        defaultVerse: defaultVerseRef,
        isRightToLeft: isRtl
      },
      viewContainerRef
    };
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: 'user01',
      data: createTestUser()
    });

    this.dialogRef = TestBed.inject(MatDialog).open(QuestionDialogComponent, config);
    this.afterCloseCallback = jasmine.createSpy('afterClose callback');
    this.dialogRef.afterClosed().subscribe(this.afterCloseCallback);
    this.component = this.dialogRef.componentInstance;

    // Set up dialog mocking after it's already used above (without mocking) in creating the component.
    this.dialogServiceSpy = spy(this.component.dialogService);
    when(this.dialogServiceSpy.openMatDialog(anything(), anything())).thenReturn(
      instance(this.mockedScriptureChooserMatDialogRef)
    );
    const chooserDialogResult = new VerseRef('LUK', '1', '2');
    when(this.mockedScriptureChooserMatDialogRef.afterClosed()).thenReturn(of(chooserDialogResult));
    this.addTextDoc(new TextDocId('project01', 40, 1));
    this.addTextDoc(new TextDocId('project01', 42, 1));
    this.addEmptyTextDoc(43);
    when(mockedProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );
    when(mockedProjectService.getProfile(anything())).thenCall(id =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, id.toString())
    );
    when(mockedFileService.findOrUpdateCache(FileType.Audio, anything(), 'question01', anything())).thenResolve(
      createStorageFileData(QuestionDoc.COLLECTION, 'question01', 'test-audio-short.mp3', getAudioBlob())
    );
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, 'user01')
    );
    this.fixture.detectChanges();
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get cancelButton(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector('#question-cancel-btn') as HTMLButtonElement;
  }

  get questionInput(): HTMLTextAreaElement {
    return this.overlayContainerElement
      .querySelector('app-text-and-audio')
      ?.querySelector('mat-form-field') as HTMLTextAreaElement;
  }

  get quillEditor(): HTMLElement {
    return <HTMLElement>document.getElementsByClassName('ql-container')[0];
  }

  get saveButton(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector('#question-save-btn') as HTMLButtonElement;
  }

  get scriptureEndInput(): HTMLInputElement {
    return this.overlayContainerElement.querySelector('#scripture-end') as HTMLInputElement;
  }

  get scriptureEndInputIcon(): HTMLElement {
    return this.scriptureEndInput.querySelector('button') as HTMLElement;
  }

  get scriptureStartInput(): HTMLInputElement {
    return this.overlayContainerElement.querySelector('#scripture-start') as HTMLInputElement;
  }

  get scriptureStartInputIcon(): HTMLElement {
    return this.scriptureStartInput.querySelector('button') as HTMLElement;
  }

  get scriptureStartValidationMsg(): HTMLElement {
    return this.overlayContainerElement.querySelector('#question-scripture-start-helper-text') as HTMLElement;
  }

  get scriptureEndValidationMsg(): HTMLElement {
    return this.overlayContainerElement.querySelector('#question-scripture-end-helper-text') as HTMLElement;
  }

  get errorText(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('.form-helper-text'));
  }

  inputValue(element: HTMLElement, value: string): void {
    const inputElem = element.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    inputElem.dispatchEvent(new Event('change'));
    this.fixture.detectChanges();
    tick();
  }

  clickElement(element: HTMLElement): void {
    element.click();
    this.fixture.detectChanges();
    tick();
  }

  isSegmentHighlighted(verse: string): boolean {
    const segment: HTMLElement | null = this.quillEditor.querySelector(
      'usx-segment[data-segment=verse_1_' + verse + ']'
    )!;
    return segment.classList.toString().includes('highlight-segment');
  }

  setAudioStatus(status: 'denied' | 'processed' | 'recording' | 'reset' | 'stopped' | 'uploaded'): void {
    const audio: AudioAttachment = { status: status };
    if (status === 'uploaded' || status === 'processed') {
      audio.url = 'some/url';
    }
    this.component.textAndAudio?.setAudioAttachment(audio);
  }

  private addTextDoc(id: TextDocId): void {
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: getTextDocId(id.projectId, id.bookNum, id.chapterNum),
      type: RichText.type.name,
      data: getTextDoc(id)
    });
  }

  private addEmptyTextDoc(bookNum: number): void {
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: getTextDocId('project01', bookNum, 1, 'target'),
      type: RichText.type.name,
      data: new Delta()
    });
  }
}
