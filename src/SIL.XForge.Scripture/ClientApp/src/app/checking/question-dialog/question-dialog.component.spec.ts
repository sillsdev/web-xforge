import { MdcDialog, MdcDialogConfig, MdcDialogRef, OverlayContainer } from '@angular-mdc/web';
import { CommonModule } from '@angular/common';
import { Component, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { getTextDocId } from 'realtime-server/lib/scriptureforge/models/text-data';
import { fromVerseRef } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import * as RichText from 'rich-text';
import { of } from 'rxjs';
import { anything, deepEqual, instance, mock, objectContaining, spy, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { NoticeService } from 'xforge-common/notice.service';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_REALTIME_DOC_TYPES } from '../../core/models/sf-realtime-doc-types';
import { Delta, TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { ScriptureChooserDialogComponent } from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { CheckingModule } from '../checking.module';
import { AudioAttachment } from '../checking/checking-audio-recorder/checking-audio-recorder.component';
import { QuestionDialogComponent, QuestionDialogData } from './question-dialog.component';

const mockedAuthService = mock(AuthService);
const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);

describe('QuestionDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [ReactiveFormsModule, FormsModule, DialogTestModule],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: UserService, useMock: mockedUserService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: SFProjectService, useMock: mockedProjectService }
    ]
  }));

  it('should allow user to cancel', fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickElement(env.cancelButton);
    flush();
    expect(env.afterCloseCallback).toHaveBeenCalledWith('close');
  }));

  it('should not allow Save without required fields', fakeAsync(() => {
    const env = new TestEnvironment();
    env.clickElement(env.saveButton);
    flush();
    expect(env.afterCloseCallback).not.toHaveBeenCalled();
    expect(env.scriptureStartValidationMsg.textContent).toContain('Required');
    // expect(getComputedStyle(env.scriptureStartValidationMsg).opacity).toEqual('0');
    expect(env.scriptureStartValidationMsg.textContent).not.toContain('e.g.');
    expect(env.scriptureStartValidationMsg.textContent).not.toContain('range');
  }));

  it('does not accept just whitespace for a question', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();

    env.inputValue(env.questionInput, 'Hello?');
    expect(env.component.questionText.valid).toBe(true);
    expect(env.component.questionText.errors).toBeNull();

    env.inputValue(env.questionInput, '');
    expect(env.component.questionText.valid).toBe(false);
    expect(env.component.questionText.errors!.required).toBeDefined();

    env.inputValue(env.questionInput, ' ');
    expect(env.component.questionText.valid).toBe(false);
    expect(env.component.questionText.errors!.someNonWhitespace).toBeDefined();

    env.inputValue(env.questionInput, '\n');
    expect(env.component.questionText.valid).toBe(false);
    expect(env.component.questionText.errors!.someNonWhitespace).toBeDefined();
  }));

  it('should validate verse fields', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    expect(env.component.questionForm.valid).toBe(false);
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
    const env = new TestEnvironment();
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

  it('should set default verse if provided', fakeAsync(() => {
    const verseRef: VerseRef = VerseRef.parse('LUK 1:1');
    const env = new TestEnvironment(undefined, verseRef);
    flush();
    expect(env.component.scriptureStart.value).toBe('LUK 1:1');
  }));

  it('should validate matching book and chapter', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('MAT 1:2');
    expect(env.component.scriptureStart.valid).toBe(true);
    expect(env.component.scriptureStart.errors).toBeNull();
    env.component.scriptureEnd.setValue('LUK 1:1');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.questionForm.errors!.verseDifferentBookOrChapter).toBe(true);
    env.component.scriptureEnd.setValue('MAT 2:1');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.questionForm.errors!.verseDifferentBookOrChapter).toBe(true);
    env.component.scriptureEnd.setValue('MAT 1:2');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.questionForm.errors).toBeNull();
  }));

  it('should validate start verse is before or same as end verse', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('MAT 1:2');
    expect(env.component.scriptureStart.valid).toBe(true);
    expect(env.component.scriptureStart.errors).toBeNull();
    env.component.scriptureEnd.setValue('MAT 1:1');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.questionForm.errors!.verseBeforeStart).toBe(true);
    env.component.scriptureEnd.setValue('MAT 1:2');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.questionForm.errors).toBeNull();
    env.component.scriptureEnd.setValue('MAT 1:3');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.questionForm.errors).toBeNull();
  }));

  it('opens reference chooser, uses result', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('MAT 3:4');
    expect(env.component.scriptureStart.value).not.toEqual('LUK 1:2');

    env.clickElement(env.scriptureStartInputIcon);
    flush();
    verify(env.dialogSpy.open(anything(), objectContaining({ data: { input: VerseRef.parse('MAT 3:4') } }))).once();
    flush();
    expect(env.component.scriptureStart.value).toEqual('LUK 1:2');
  }));

  // Needed for validation error messages to appear
  it('control marked as touched+dirty after reference chooser', fakeAsync(() => {
    const env = new TestEnvironment();
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

  it('passes start reference to end-reference chooser', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('LUK 1:1');
    env.component.scriptureEnd.setValue('GEN 5:6');

    env.clickElement(env.scriptureEndInputIcon);
    flush();
    // Dialog receives unhelpful input value that can be ignored.
    // rangeStart should have been passed in, and from scriptureStart value.
    verify(
      env.dialogSpy.open(
        anything(),
        objectContaining({ data: { input: VerseRef.parse('GEN 5:6'), rangeStart: VerseRef.parse('LUK 1:1') } })
      )
    ).once();
    flush();
    expect(env.component.scriptureEnd.value).toEqual('LUK 1:2');
  }));

  it('does not pass start reference as range start when opening start-reference chooser', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('LUK 1:1');

    env.clickElement(env.scriptureStartInputIcon);
    flush();
    // rangeStart should not have been passed in.
    verify(
      env.dialogSpy.open(
        anything(),
        objectContaining({ data: { input: VerseRef.parse('LUK 1:1'), rangeStart: undefined } })
      )
    ).once();
    flush();
    expect(env.component.scriptureStart.value).toEqual('LUK 1:2');
  }));

  it('disables end-reference if start-reference is invalid', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    env.inputValue(env.scriptureStartInput, 'LUK 1:1');
    expect(env.component.scriptureEnd.disabled).toBe(false);
    env.inputValue(env.scriptureStartInput, 'LUK 99:1');
    expect(env.component.scriptureEnd.disabled).toBe(true);
    // Gets re-enabled
    env.inputValue(env.scriptureStartInput, 'LUK 1:1');
    expect(env.component.scriptureEnd.disabled).toBe(false);
  }));

  it('does not enable end-reference until start-reference is changed', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    expect(env.component.scriptureEnd.disabled).toBe(true);
    env.inputValue(env.scriptureStartInput, 'LUK 1:1');
    expect(env.component.scriptureEnd.disabled).toBe(false);
  }));

  it('allows a question without text if audio is provided', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    env.inputValue(env.questionInput, '');
    expect(env.component.questionText.valid).toBe(false);
    expect(env.component.questionText.errors!.required).not.toBeNull();
    // Test that audio recorded results in a valid questionText control
    env.setAudioStatus('processed');
    expect(env.component.questionText.valid).toBe(true);
    expect(env.component.questionText.errors).toBeNull();
    // Removing the audio sets the validators on questionText
    env.setAudioStatus('reset');
    expect(env.component.questionText.valid).toBe(false);
    expect(env.component.questionText.errors!.required).not.toBeNull();
  }));

  it('display quill editor', fakeAsync(() => {
    const env = new TestEnvironment();
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
    const env = new TestEnvironment({
      dataId: 'question01',
      ownerRef: 'user01',
      projectRef: 'project01',
      verseRef: fromVerseRef(VerseRef.parse('LUK 1:3')),
      answers: [],
      isArchived: false,
      dateCreated: '',
      dateModified: ''
    });
    flush();
    const textDocId = new TextDocId('project01', 42, 1, 'target');
    expect(env.component.textDocId!.toString()).toBe(textDocId.toString());
    verify(mockedProjectService.getText(deepEqual(textDocId))).once();
    expect(env.component.selection!.toString()).toEqual('LUK 1:3');
  }));

  it('displays error editing end reference to different book', fakeAsync(() => {
    const env = new TestEnvironment({
      dataId: 'question01',
      ownerRef: 'user01',
      projectRef: 'project01',
      verseRef: fromVerseRef(VerseRef.parse('LUK 1:3')),
      answers: [],
      isArchived: false,
      dateCreated: '',
      dateModified: ''
    });
    flush();
    expect(env.component.scriptureStart.value).toBe('LUK 1:3');
    env.component.scriptureEnd.setValue('MAT 1:2');
    env.component.scriptureEnd.markAsTouched();
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.questionForm.errors!.verseDifferentBookOrChapter).toBe(true);
    env.clickElement(env.saveButton);
    expect(env.scriptureEndInput.classList).toContain('mdc-text-field--invalid');
    expect(env.scriptureEndValidationMsg.textContent).toContain('Must be the same book and chapter');
  }));

  it('displays error editing start reference to a different book', fakeAsync(() => {
    const env = new TestEnvironment({
      dataId: 'question01',
      ownerRef: 'user01',
      projectRef: 'project01',
      verseRef: fromVerseRef(VerseRef.parse('LUK 1:3-4')),
      answers: [],
      isArchived: false,
      dateCreated: '',
      dateModified: ''
    });
    flush();
    env.component.scriptureStart.setValue('MAT 1:2');
    env.component.scriptureStart.markAsTouched();
    expect(env.component.questionForm.errors!.verseDifferentBookOrChapter).toBe(true);
    env.clickElement(env.saveButton);
    expect(env.scriptureEndInput.classList).toContain('mdc-text-field--invalid');
    expect(env.scriptureEndValidationMsg.textContent).toContain('Must be the same book and chapter');
  }));

  it('generate correct verse ref when start and end mismatch only by case or insignificant zero', fakeAsync(() => {
    const env = new TestEnvironment();
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
    const env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('nonsense');
    env.component.scriptureEnd.setValue('LUK 1:1');
    expect(() => {
      env.component.updateSelection();
    }).not.toThrow();
  }));

  it('should not highlight range if chapter or book differ', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('MAT 1:1');
    env.component.scriptureEnd.setValue('LUK 1:2');
    tick(500);
    env.fixture.detectChanges();
    tick(500);
    expect(env.isSegmentHighlighted('1')).toBe(false);
  }));

  it('should clear highlight when starting ref is cleared', fakeAsync(() => {
    const env = new TestEnvironment();
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
    const env = new TestEnvironment();
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

@Directive({
  // ts lint complains that a directive should be used as an attribute
  // tslint:disable-next-line:directive-selector
  selector: 'viewContainerDirective'
})
class ViewContainerDirective {
  constructor(public viewContainerRef: ViewContainerRef) {}
}

@Component({
  selector: 'app-view-container',
  template: '<viewContainerDirective></viewContainerDirective>'
})
class ChildViewContainerComponent {
  @ViewChild(ViewContainerDirective, { static: true }) viewContainer!: ViewContainerDirective;

  get childViewContainer(): ViewContainerRef {
    return this.viewContainer.viewContainerRef;
  }
}

@NgModule({
  imports: [CommonModule, UICommonModule, CheckingModule],
  declarations: [ViewContainerDirective, ChildViewContainerComponent, ScriptureChooserDialogComponent],
  exports: [ViewContainerDirective, ChildViewContainerComponent, ScriptureChooserDialogComponent],
  entryComponents: [ChildViewContainerComponent, QuestionDialogComponent, ScriptureChooserDialogComponent]
})
class DialogTestModule {}

class TestEnvironment {
  readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  readonly component: QuestionDialogComponent;
  readonly dialogRef: MdcDialogRef<QuestionDialogComponent>;
  readonly overlayContainerElement: HTMLElement;
  readonly afterCloseCallback: jasmine.Spy;
  readonly dialogSpy: MdcDialog;

  readonly mockedScriptureChooserMdcDialogRef = mock(MdcDialogRef);

  private readonly realtimeService = new TestRealtimeService(SF_REALTIME_DOC_TYPES);

  constructor(question?: Question, defaultVerseRef?: VerseRef) {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const viewContainerRef = this.fixture.componentInstance.childViewContainer;
    const config: MdcDialogConfig<QuestionDialogData> = {
      data: {
        question: question ? question : undefined,
        textsByBookId: {
          MAT: {
            bookNum: 40,
            hasSource: false,
            chapters: [{ number: 1, lastVerse: 25 }, { number: 2, lastVerse: 23 }]
          },
          LUK: { bookNum: 42, hasSource: false, chapters: [{ number: 1, lastVerse: 80 }] },
          JHN: { bookNum: 43, hasSource: false, chapters: [{ number: 1, lastVerse: 0 }] }
        },
        projectId: 'project01',
        defaultVerse: defaultVerseRef
      } as QuestionDialogData,
      viewContainerRef
    };
    this.dialogRef = TestBed.get(MdcDialog).open(QuestionDialogComponent, config);
    this.afterCloseCallback = jasmine.createSpy('afterClose callback');
    this.dialogRef.afterClosed().subscribe(this.afterCloseCallback);
    this.component = this.dialogRef.componentInstance;
    this.overlayContainerElement = TestBed.get(OverlayContainer).getContainerElement();

    // Set up MdcDialog mocking after it's already used above in creating the component.
    this.dialogSpy = spy(this.component.dialog);
    when(this.dialogSpy.open(anything(), anything())).thenReturn(instance(this.mockedScriptureChooserMdcDialogRef));
    const chooserDialogResult = new VerseRef('LUK', '1', '2');
    when(this.mockedScriptureChooserMdcDialogRef.afterClosed()).thenReturn(of(chooserDialogResult));
    this.addTextDoc(40);
    this.addTextDoc(42);
    this.addEmptyTextDoc(43);
    when(mockedProjectService.getText(anything())).thenCall(id =>
      this.realtimeService.subscribe(TextDoc.COLLECTION, id.toString())
    );
    when(mockedProjectService.get(anything())).thenResolve({} as SFProjectDoc);
    this.fixture.detectChanges();
  }

  get cancelButton(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector('#question-cancel-btn') as HTMLButtonElement;
  }

  get questionInput(): HTMLTextAreaElement {
    return this.overlayContainerElement.querySelector('#question-text') as HTMLTextAreaElement;
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

  get scriptureEndInputIcon(): HTMLInputElement {
    return this.scriptureEndInput.querySelector('mdc-icon') as HTMLInputElement;
  }

  get scriptureStartInput(): HTMLInputElement {
    return this.overlayContainerElement.querySelector('#scripture-start') as HTMLInputElement;
  }

  get scriptureStartInputIcon(): HTMLInputElement {
    return this.scriptureStartInput.querySelector('mdc-icon') as HTMLInputElement;
  }

  get scriptureStartValidationMsg(): HTMLElement {
    return this.overlayContainerElement.querySelector('#question-scripture-start-helper-text > div') as HTMLElement;
  }

  get scriptureEndValidationMsg(): HTMLElement {
    return this.overlayContainerElement.querySelector('#question-scripture-end-helper-text > div') as HTMLElement;
  }

  inputValue(element: HTMLElement, value: string) {
    const inputElem = element.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    this.fixture.detectChanges();
    tick();
  }

  clickElement(element: HTMLElement) {
    element.click();
    this.fixture.detectChanges();
    tick();
  }

  isSegmentHighlighted(verse: string): boolean {
    const segment = this.quillEditor.querySelector('usx-segment[data-segment=verse_1_' + verse + ']')!;
    return segment.classList.toString().includes('highlight-segment-target');
  }

  setAudioStatus(status: 'denied' | 'processed' | 'recording' | 'reset' | 'stopped' | 'uploaded') {
    const audio: AudioAttachment = { status: status };
    this.component.processAudio(audio);
  }

  private addTextDoc(bookNum: number): void {
    const delta = new Delta();
    delta.insert({ chapter: { number: '1', style: 'c' } });
    delta.insert({ blank: true }, { segment: 'p_1' });
    delta.insert({ verse: { number: '1', style: 'v' } });
    delta.insert('target: chapter 1, verse 1.', { segment: 'verse_1_1' });
    delta.insert({ verse: { number: '2', style: 'v' } });
    delta.insert({ blank: true }, { segment: 'verse_1_2' });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ blank: true }, { segment: 'verse_1_2/p_1' });
    delta.insert({ verse: { number: '3', style: 'v' } });
    delta.insert(`target: chapter 1, verse 3.`, { segment: 'verse_1_3' });
    delta.insert({ verse: { number: '4', style: 'v' } });
    delta.insert(`target: chapter 1, verse 4.`, { segment: 'verse_1_4' });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ blank: true }, { segment: 'verse_1_4/p_1' });
    delta.insert({ verse: { number: '5', style: 'v' } });
    delta.insert(`target: chapter 1, `, { segment: 'verse_1_5' });
    delta.insert('\n', { para: { style: 'p' } });
    this.realtimeService.addSnapshot(TextDoc.COLLECTION, {
      id: getTextDocId('project01', bookNum, 1, 'target'),
      type: RichText.type.name,
      data: delta
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
