import { MdcDialog, MdcDialogConfig, MdcDialogRef, OverlayContainer } from '@angular-mdc/web';
import { CommonModule } from '@angular/common';
import { Component, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { getTextDocId } from 'realtime-server/lib/scriptureforge/models/text-data';
import { fromVerseRef } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import * as RichText from 'rich-text';
import { of } from 'rxjs';
import { anything, capture, deepEqual, instance, mock, spy, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { MemoryRealtimeOfflineStore } from 'xforge-common/memory-realtime-offline-store';
import { MemoryRealtimeDocAdapter } from 'xforge-common/memory-realtime-remote-store';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { Delta, TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { CheckingModule } from '../checking.module';
import { AudioAttachment } from '../checking/checking-audio-recorder/checking-audio-recorder.component';
import { QuestionDialogComponent, QuestionDialogData } from './question-dialog.component';

describe('QuestionDialogComponent', () => {
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
    expect(env.component.questionText.errors.required).toBeDefined();

    env.inputValue(env.questionInput, ' ');
    expect(env.component.questionText.valid).toBe(false);
    expect(env.component.questionText.errors.someNonWhitespace).toBeDefined();

    env.inputValue(env.questionInput, '\n');
    expect(env.component.questionText.valid).toBe(false);
    expect(env.component.questionText.errors.someNonWhitespace).toBeDefined();
  }));

  it('should validate verse fields', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    expect(env.component.questionForm.valid).toBe(false);
    expect(env.component.scriptureStart.valid).toBe(false);
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureStart.errors.required).toBe(true);
    env.component.scriptureStart.setValue('MAT');
    expect(env.component.scriptureStart.errors.verseFormat).toBe(true);
    env.component.scriptureStart.setValue('MAT 1:1');
    expect(env.component.scriptureStart.valid).toBe(true);
    expect(env.component.scriptureStart.errors).toBeNull();
    env.component.scriptureStart.setValue('MAT 1:1a');
    expect(env.component.scriptureStart.errors).toBeNull();
    env.component.scriptureStart.setValue('TIT 1:1');
    expect(env.component.scriptureStart.errors.verseRange).toBe(true);
    env.component.scriptureStart.setValue('MAT 1:26');
    expect(env.component.scriptureStart.errors.verseRange).toBe(true);
    env.component.scriptureStart.setValue('MAT 1:25');
    expect(env.component.scriptureStart.errors).toBeNull();

    env.component.scriptureEnd.setValue('MAT');
    expect(env.component.scriptureEnd.errors.verseFormat).toBe(true);
    env.component.scriptureEnd.setValue('MAT 1:1');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    env.component.scriptureEnd.setValue('MAT 1:1a');
    expect(env.component.scriptureEnd.errors).toBeNull();
    env.component.scriptureEnd.setValue('TIT 1:1');
    expect(env.component.scriptureEnd.errors.verseRange).toBe(true);
    env.component.scriptureEnd.setValue('MAT 1:26');
    expect(env.component.scriptureEnd.errors.verseRange).toBe(true);
    env.component.scriptureEnd.setValue('MAT 1:25');
    expect(env.component.scriptureEnd.errors).toBeNull();
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
      expect(env.component.scriptureStart.errors.verseFormat).toBe(true);
      env.component.scriptureEnd.setValue(v);
      expect(env.component.scriptureEnd.errors.verseFormat).toBe(true);
    }
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
    expect(env.component.questionForm.errors.verseDifferentBookOrChapter).toBe(true);
    env.component.scriptureEnd.setValue('MAT 2:1');
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.questionForm.errors.verseDifferentBookOrChapter).toBe(true);
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
    expect(env.component.questionForm.errors.verseBeforeStart).toBe(true);
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
    verify(env.dialogSpy.open(anything(), anything())).once();
    expect(env.dataPassedToDialog.input.toString()).toEqual('MAT 3:4');
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
    verify(env.dialogSpy.open(anything(), anything())).once();
    // Dialog receives unhelpful input value that can be ignored.
    expect(env.dataPassedToDialog.input.toString()).toEqual('GEN 5:6');
    // rangeStart should have been passed in, and from scriptureStart value.
    expect(env.dataPassedToDialog.rangeStart.toString()).toEqual('LUK 1:1');
    flush();
    expect(env.component.scriptureEnd.value).toEqual('LUK 1:2');
  }));

  it('does not pass start reference as range start when opening start-reference chooser', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    env.component.scriptureStart.setValue('LUK 1:1');

    env.clickElement(env.scriptureStartInputIcon);
    flush();
    verify(env.dialogSpy.open(anything(), anything())).once();
    expect(env.dataPassedToDialog.input.toString()).toEqual('LUK 1:1');
    // rangeStart should not have been passed in.
    expect(env.dataPassedToDialog.rangeStart).toBeUndefined();
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

  it('allows a question without text if audio is provided', fakeAsync(() => {
    const env = new TestEnvironment();
    flush();
    env.inputValue(env.questionInput, '');
    expect(env.component.questionText.valid).toBe(false);
    expect(env.component.questionText.errors.required).not.toBeNull();
    // Test that audio recorded results in a valid questionText control
    env.setAudioStatus('processed');
    expect(env.component.questionText.valid).toBe(true);
    expect(env.component.questionText.errors).toBeNull();
    // Removing the audio sets the validators on questionText
    env.setAudioStatus('reset');
    expect(env.component.questionText.valid).toBe(false);
    expect(env.component.questionText.errors.required).not.toBeNull();
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
    expect(env.component.textDocId.toString()).toBe(textDocId.toString());
    verify(env.mockedProjectService.getText(deepEqual(textDocId))).once();
    expect(env.isSegmentHighlighted('1')).toBe(true);
    expect(env.isSegmentHighlighted('2')).toBe(false);
  }));

  it('retrieves scripture text on editing a question', fakeAsync(() => {
    const env = new TestEnvironment(true);
    flush();
    const textDocId = new TextDocId('project01', 42, 1, 'target');
    expect(env.component.textDocId.toString()).toBe(textDocId.toString());
    verify(env.mockedProjectService.getText(deepEqual(textDocId))).once();
    expect(env.component.selection.verseRef.toString()).toEqual('LUK 1:3');
  }));

  it('displays error message when editing the scripture reference', fakeAsync(() => {
    const env = new TestEnvironment(true);
    flush();
    expect(env.component.scriptureStart.value).toBe('LUK 1:3');
    env.component.scriptureEnd.setValue('MAT 1:2');
    env.component.scriptureEnd.markAsTouched();
    expect(env.component.scriptureEnd.errors).toBeNull();
    expect(env.component.scriptureEnd.valid).toBe(true);
    expect(env.component.questionForm.errors.verseDifferentBookOrChapter).toBe(true);
    env.clickElement(env.saveButton);
    expect(env.scriptureEndInput.classList).toContain('mdc-text-field--invalid');
    expect(env.scriptureEndValidationMsg.textContent).toContain('Must be the same book and chapter');
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
  @ViewChild(ViewContainerDirective, { static: true }) viewContainer: ViewContainerDirective;

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
  fixture: ComponentFixture<ChildViewContainerComponent>;
  currentUserDoc: UserDoc;
  component: QuestionDialogComponent;
  dialogRef: MdcDialogRef<QuestionDialogComponent>;
  overlayContainerElement: HTMLElement;
  afterCloseCallback: jasmine.Spy;

  mockedAuthService: AuthService = mock(AuthService);
  mockedScriptureChooserMdcDialogRef = mock(MdcDialogRef);
  mockedNoticeService = mock(NoticeService);
  mockedProjectService = mock(SFProjectService);
  mockedUserService: UserService = mock(UserService);
  dialogSpy: MdcDialog;

  private readonly offlineStore = new MemoryRealtimeOfflineStore();

  constructor(editMode: boolean = false) {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, FormsModule, DialogTestModule],
      providers: [
        { provide: AuthService, useFactory: () => instance(this.mockedAuthService) },
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedProjectService) }
      ]
    });
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const viewContainerRef = this.fixture.componentInstance.childViewContainer;
    const config: MdcDialogConfig<QuestionDialogData> = {
      data: {
        question: editMode
          ? {
              dataId: 'question01',
              ownerRef: 'user01',
              projectRef: 'project01',
              verseRef: fromVerseRef(VerseRef.parse('LUK 1:3')),
              answers: [],
              isArchived: false,
              dateCreated: '',
              dateModified: ''
            }
          : undefined,
        textsByBookId: {
          MAT: {
            id: 'text01',
            bookNum: 40,
            hasSource: false,
            chapters: [{ number: 1, lastVerse: 25 }, { number: 2, lastVerse: 23 }]
          },
          LUK: { id: 'text02', bookNum: 42, hasSource: false, chapters: [{ number: 1, lastVerse: 80 }] }
        },
        projectId: 'project01'
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
    when(this.mockedProjectService.getText(deepEqual(new TextDocId('project01', 42, 1, 'target')))).thenResolve(
      this.createTextDoc()
    );
    this.fixture.detectChanges();
  }

  get cancelButton(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector('#question-cancel-btn');
  }

  get dataPassedToDialog(): ScriptureChooserDialogData {
    return (capture(this.dialogSpy.open).last()[1] as MdcDialogConfig<ScriptureChooserDialogData>).data;
  }

  get questionInput(): HTMLTextAreaElement {
    return this.overlayContainerElement.querySelector('#question-text');
  }

  get quillEditor(): HTMLElement {
    return <HTMLElement>document.getElementsByClassName('ql-container')[0];
  }

  get saveButton(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector('#question-save-btn');
  }

  get scriptureEndInput(): HTMLInputElement {
    return this.overlayContainerElement.querySelector('#scripture-end');
  }

  get scriptureEndInputIcon(): HTMLInputElement {
    return this.scriptureEndInput.querySelector('mdc-icon');
  }

  get scriptureStartInput(): HTMLInputElement {
    return this.overlayContainerElement.querySelector('#scripture-start');
  }

  get scriptureStartInputIcon(): HTMLInputElement {
    return this.scriptureStartInput.querySelector('mdc-icon');
  }

  get scriptureStartValidationMsg(): HTMLElement {
    return this.overlayContainerElement.querySelector('#question-scripture-start-helper-text > div');
  }

  get scriptureEndValidationMsg(): HTMLElement {
    return this.overlayContainerElement.querySelector('#question-scripture-end-helper-text > div');
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
    const segment = this.quillEditor.querySelector('usx-segment[data-segment=verse_1_' + verse + ']');
    return segment.classList.toString().includes('highlight-segment-target');
  }

  setAudioStatus(status: 'denied' | 'processed' | 'recording' | 'reset' | 'stopped' | 'uploaded') {
    const audio: AudioAttachment = { status: status };
    this.component.processAudio(audio);
  }

  private createTextDoc(): TextDoc {
    const delta = new Delta();
    delta.insert({ chapter: { number: '1', style: 'c' } });
    delta.insert({ verse: { number: '1', style: 'v' } });
    delta.insert('target: chapter 1, verse 1.', { segment: 'verse_1_1' });
    delta.insert({ verse: { number: '2', style: 'v' } });
    delta.insert({ blank: 'normal' }, { segment: 'verse_1_2' });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ verse: { number: '3', style: 'v' } });
    delta.insert(`target: chapter 1, verse 3.`, { segment: 'verse_1_3' });
    delta.insert({ verse: { number: '4', style: 'v' } });
    delta.insert(`target: chapter 1, verse 4.`, { segment: 'verse_1_4' });
    delta.insert('\n', { para: { style: 'p' } });
    delta.insert({ blank: 'initial' }, { segment: 'verse_1_4/p_1' });
    delta.insert({ verse: { number: '5', style: 'v' } });
    delta.insert(`target: chapter 1, `, { segment: 'verse_1_5' });
    delta.insert('\n', { para: { style: 'p' } });
    const adapter = new MemoryRealtimeDocAdapter(
      TextDoc.COLLECTION,
      getTextDocId('project01', 42, 1, 'target'),
      delta,
      RichText.type
    );
    return new TextDoc(this.offlineStore, adapter);
  }
}
