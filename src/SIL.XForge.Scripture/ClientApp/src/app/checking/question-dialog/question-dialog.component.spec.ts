import { MdcDialog, MdcDialogConfig, MdcDialogRef, OverlayContainer } from '@angular-mdc/web';
import { CommonModule } from '@angular/common';
import { Component, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Question } from 'realtime-server/lib/scriptureforge/models/question';
import { VerseRefData } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { of } from 'rxjs';
import { anything, capture, instance, mock, spy, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import {
  ScriptureChooserDialogComponent,
  ScriptureChooserDialogData
} from '../../scripture-chooser-dialog/scripture-chooser-dialog.component';
import { CheckingModule } from '../checking.module';
import { QuestionDialogComponent } from './question-dialog.component';

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

  it('should validate start verse is after or same as end verse', fakeAsync(() => {
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
    expect(env.dataPassedToDialog.input).toEqual({
      book: 'MAT',
      chapter: '3',
      verse: '4',
      versification: undefined
    });
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
    expect(env.dataPassedToDialog.input).toEqual({
      book: 'GEN',
      chapter: '5',
      verse: '6',
      versification: undefined
    });
    // rangeStart should have been passed in, and from scriptureStart value.
    expect(env.dataPassedToDialog.rangeStart).toEqual({
      book: 'LUK',
      chapter: '1',
      verse: '1',
      versification: undefined
    });
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
    expect(env.dataPassedToDialog.input).toEqual({
      book: 'LUK',
      chapter: '1',
      verse: '1',
      versification: undefined
    });
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
  @ViewChild(ViewContainerDirective) viewContainer: ViewContainerDirective;

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
  mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);
  mockedUserService: UserService = mock(UserService);
  dialogSpy: MdcDialog;

  constructor() {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, FormsModule, DialogTestModule],
      providers: [
        { provide: AuthService, useFactory: () => instance(this.mockedAuthService) },
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) }
      ]
    });
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const viewContainerRef = this.fixture.componentInstance.childViewContainer;
    const config: MdcDialogConfig = {
      data: {
        editMode: false,
        question: {} as Question,
        textsByBook: {
          MAT: {
            id: 'text01',
            bookId: 'MAT',
            name: 'Matthew',
            chapters: [{ number: 1, lastVerse: 25 }, { number: 2, lastVerse: 23 }]
          },
          LUK: { id: 'text02', bookId: 'LUK', name: 'Luke', chapters: [{ number: 1, lastVerse: 80 }] }
        }
      },
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
    const chooserDialogResult: VerseRefData = { book: 'LUK', chapter: '1', verse: '2' };
    when(this.mockedScriptureChooserMdcDialogRef.afterClosed()).thenReturn(of(chooserDialogResult));
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
}
