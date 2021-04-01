import { MdcDialog, MdcDialogRef } from '@angular-mdc/web/dialog';
import { CommonModule } from '@angular/common';
import { Component, Directive, NgModule, ViewChild, ViewContainerRef } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import {
  EditedQuestion,
  ImportQuestionsConfirmationDialogComponent,
  ImportQuestionsConfirmationDialogData,
  ImportQuestionsConfirmationDialogResult
} from './import-question-confirmation-dialog.component';

describe('ImportQuestionsConfirmationDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [ReactiveFormsModule, FormsModule, DialogTestModule]
  }));

  it('Allows selecting and unselecting all questions', fakeAsync(async () => {
    const env = new TestEnvironment();
    expect(env.questionRows.length).toBe(2);
    expect(env.rowCheckboxes.length).toBe(2);

    expect(env.selectAllCheckbox.checked).toBe(true);
    env.rowCheckboxes.forEach(n => expect(n.checked).toBe(true));

    env.click(env.selectAllCheckbox);
    expect(env.selectAllCheckbox.checked).toBe(false);
    env.rowCheckboxes.forEach(n => expect(n.checked).toBe(false));
    await env.closeDialog();
  }));

  it('Can handle a single question', fakeAsync(async () => {
    const env = new TestEnvironment(1);
    expect(env.questionRows.length).toBe(1);
    expect(env.rowCheckboxes.length).toBe(1);

    expect(env.selectAllCheckbox.checked).toBe(true);
    expect(env.rowCheckboxes[0].checked).toBe(true);

    env.click(env.rowCheckboxes[0]);
    expect(env.rowCheckboxes[0].checked).toBe(false);
    expect(env.selectAllCheckbox.checked).toBe(false);

    env.click(env.selectAllCheckbox);
    expect(env.selectAllCheckbox.checked).toBe(true);
    expect(env.rowCheckboxes[0].checked).toBe(true);
    const dialogResult: ImportQuestionsConfirmationDialogResult = await env.closeDialog();
    expect(dialogResult.questions).toEqual([
      {
        before: 'Original question 1',
        after: 'Edited question 1',
        answerCount: 0,
        checked: true
      }
    ]);
  }));

  it('Allows selecting a subset of questions', fakeAsync(async () => {
    const env = new TestEnvironment(3);
    expect(env.questionRows.length).toBe(3);
    expect(env.rowCheckboxes.length).toBe(3);

    expect(env.selectAllCheckbox.checked).toBe(true);
    env.click(env.selectAllCheckbox);
    expect(env.selectAllCheckbox.checked).toBe(false);

    env.click(env.rowCheckboxes[2]);
    expect(env.rowCheckboxes[2].checked).toBe(true);
    expect(env.selectAllCheckbox.indeterminate).toBe(true);

    const dialogResult: ImportQuestionsConfirmationDialogResult = await env.closeDialog();
    expect(dialogResult.questions).toEqual([
      {
        before: 'Original question 1',
        after: 'Edited question 1',
        answerCount: 0,
        checked: false
      },
      {
        before: 'Original question 2',
        after: 'Edited question 2',
        answerCount: 0,
        checked: false
      },
      {
        before: 'Original question 3',
        after: 'Edited question 3',
        answerCount: 0,
        checked: true
      }
    ]);
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
  imports: [CommonModule, UICommonModule, TestTranslocoModule],
  declarations: [ViewContainerDirective, ChildViewContainerComponent, ImportQuestionsConfirmationDialogComponent],
  exports: [ViewContainerDirective, ChildViewContainerComponent, ImportQuestionsConfirmationDialogComponent]
})
class DialogTestModule {}

class TestEnvironment {
  fixture: ComponentFixture<ChildViewContainerComponent>;
  component: ImportQuestionsConfirmationDialogComponent;
  dialogRef: MdcDialogRef<ImportQuestionsConfirmationDialogComponent>;

  constructor(questionCount: number = 2) {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const configData: ImportQuestionsConfirmationDialogData = { questions: this.getQuestions(questionCount) };
    this.dialogRef = TestBed.inject(MdcDialog).open(ImportQuestionsConfirmationDialogComponent, { data: configData });
    this.component = this.dialogRef.componentInstance;
    tick();
    this.fixture.detectChanges();
    flush();
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get dialogTitle(): HTMLElement {
    return this.overlayContainerElement.querySelector('mdc-dialog-title') as HTMLElement;
  }

  get table(): HTMLElement {
    return this.overlayContainerElement.querySelector('table') as HTMLElement;
  }

  get selectAllCheckbox(): HTMLInputElement {
    return this.table.querySelector('thead tr th mdc-checkbox input') as HTMLInputElement;
  }

  get questionRows(): HTMLElement[] {
    return Array.from(this.table.querySelectorAll('tbody tr')).map(r => r as HTMLElement);
  }

  get rowCheckboxes(): HTMLInputElement[] {
    return Array.from(this.table.querySelectorAll('tbody tr td mdc-checkbox input'));
  }

  get closeButton(): HTMLInputElement {
    return this.overlayContainerElement.querySelector('mdc-dialog-actions button') as HTMLInputElement;
  }

  get closeValuePromise(): Promise<ImportQuestionsConfirmationDialogResult> {
    return this.dialogRef.afterClosed().toPromise();
  }

  click(element: HTMLElement) {
    element.click();
    tick();
    this.fixture.detectChanges();
  }

  getQuestions(count: number): EditedQuestion[] {
    return Array.from(new Array(count), (_, i) => ({
      before: `Original question ${i + 1}`,
      after: `Edited question ${i + 1}`,
      answerCount: 0,
      checked: true
    }));
  }

  closeDialog(): Promise<ImportQuestionsConfirmationDialogResult> {
    const promiseForResult = this.dialogRef.afterClosed().toPromise();
    this.click(this.closeButton);
    return promiseForResult;
  }
}
