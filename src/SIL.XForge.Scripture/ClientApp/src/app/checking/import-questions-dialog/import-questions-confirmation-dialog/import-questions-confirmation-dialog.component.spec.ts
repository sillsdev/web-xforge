import { CommonModule } from '@angular/common';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { firstValueFrom } from 'rxjs';
import { ChildViewContainerComponent, configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import {
  EditedQuestion,
  ImportQuestionsConfirmationDialogComponent,
  ImportQuestionsConfirmationDialogData,
  ImportQuestionsConfirmationDialogResult
} from './import-question-confirmation-dialog.component';

describe('ImportQuestionsConfirmationDialogComponent', () => {
  configureTestingModule(() => ({
    imports: [ReactiveFormsModule, FormsModule, DialogTestModule, NoopAnimationsModule]
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
    expect(dialogResult).toEqual([true]);
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
    expect(dialogResult).toEqual([false, false, true]);
  }));
});

@NgModule({
  declarations: [ImportQuestionsConfirmationDialogComponent],
  exports: [ImportQuestionsConfirmationDialogComponent],
  imports: [CommonModule, UICommonModule, TestTranslocoModule],
  providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
})
class DialogTestModule {}

class TestEnvironment {
  fixture: ComponentFixture<ChildViewContainerComponent>;
  component: ImportQuestionsConfirmationDialogComponent;
  dialogRef: MatDialogRef<ImportQuestionsConfirmationDialogComponent>;

  constructor(questionCount: number = 2) {
    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
    const configData: ImportQuestionsConfirmationDialogData = { questions: this.getQuestions(questionCount) };
    this.dialogRef = TestBed.inject(MatDialog).open(ImportQuestionsConfirmationDialogComponent, { data: configData });
    this.component = this.dialogRef.componentInstance;
    this.update();
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get dialogTitle(): HTMLElement {
    return this.overlayContainerElement.querySelector('mat-dialog-title') as HTMLElement;
  }

  get table(): HTMLElement {
    return this.overlayContainerElement.querySelector('table') as HTMLElement;
  }

  get selectAllCheckbox(): HTMLInputElement {
    return this.table.querySelector('thead tr th mat-checkbox input') as HTMLInputElement;
  }

  get questionRows(): HTMLElement[] {
    return Array.from(this.table.querySelectorAll('tbody tr')).map(r => r as HTMLElement);
  }

  get rowCheckboxes(): HTMLInputElement[] {
    return Array.from(this.table.querySelectorAll('tbody tr td mat-checkbox input'));
  }

  get closeButton(): HTMLInputElement {
    return this.overlayContainerElement.querySelector('mat-dialog-actions button') as HTMLInputElement;
  }

  get closeValuePromise(): Promise<ImportQuestionsConfirmationDialogResult> {
    return firstValueFrom(this.dialogRef.afterClosed());
  }

  click(element: HTMLElement): void {
    element.click();
    this.update();
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
    const promiseForResult = firstValueFrom(this.dialogRef.afterClosed());
    this.click(this.closeButton);
    return promiseForResult;
  }

  private update(): void {
    tick();
    this.fixture.detectChanges();
    flush();
  }
}
