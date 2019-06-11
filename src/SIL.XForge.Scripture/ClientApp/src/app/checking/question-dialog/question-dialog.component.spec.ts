import { MdcDialog, MdcDialogConfig, MdcDialogRef, OverlayContainer } from '@angular-mdc/web';
import { CommonModule } from '@angular/common';
import { Component, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { instance, mock } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { Question } from '../../core/models/question';
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
  imports: [CommonModule, UICommonModule],
  declarations: [ViewContainerDirective, ChildViewContainerComponent, QuestionDialogComponent],
  exports: [ViewContainerDirective, ChildViewContainerComponent, QuestionDialogComponent],
  entryComponents: [ChildViewContainerComponent, QuestionDialogComponent]
})
class DialogTestModule {}

class TestEnvironment {
  fixture: ComponentFixture<ChildViewContainerComponent>;
  component: QuestionDialogComponent;
  dialogRef: MdcDialogRef<QuestionDialogComponent>;
  overlayContainerElement: HTMLElement;
  afterCloseCallback: jasmine.Spy;

  mockedAuthService: AuthService = mock(AuthService);

  constructor() {
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule, FormsModule, DialogTestModule, UICommonModule],
      providers: [{ provide: AuthService, useFactory: () => instance(this.mockedAuthService) }]
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
    this.fixture.detectChanges();
  }

  get saveButton(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector('#question-save-btn');
  }

  get cancelButton(): HTMLButtonElement {
    return this.overlayContainerElement.querySelector('#question-cancel-btn');
  }

  get scriptureStartInput(): HTMLInputElement {
    return this.overlayContainerElement.querySelector('#scripture-start');
  }

  get scriptureStartValidationMsg(): HTMLElement {
    return this.overlayContainerElement.querySelector('#question-scripture-start-helper-text > div');
  }

  get scriptureEndInput(): HTMLInputElement {
    return this.overlayContainerElement.querySelector('#scripture-end');
  }

  inputValue(element: HTMLElement, value: string) {
    const inputElem = element.querySelector('input') as HTMLInputElement;
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
