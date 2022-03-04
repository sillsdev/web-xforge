import { MdcDialogRef, MDC_DIALOG_DATA } from '@angular-mdc/web';
import { Component, Inject } from '@angular/core';

export interface ImportQuestionsConfirmationDialogData {
  questions: EditedQuestion[];
}

export type ImportQuestionsConfirmationDialogResult = boolean[];

export interface EditedQuestion {
  before: string;
  after: string;
  answerCount: number;
  checked: boolean;
}

@Component({
  templateUrl: './import-questions-confirmation-dialog.component.html',
  styleUrls: ['./import-questions-confirmation-dialog.component.scss']
})
export class ImportQuestionsConfirmationDialogComponent {
  allSelected: boolean = false;
  questions: EditedQuestion[];

  constructor(
    @Inject(MDC_DIALOG_DATA) data: ImportQuestionsConfirmationDialogData,
    private readonly dialogRef: MdcDialogRef<
      ImportQuestionsConfirmationDialogComponent,
      ImportQuestionsConfirmationDialogResult
    >
  ) {
    this.questions = data.questions;
    this.updateAllSelected();
  }

  updateAllSelected() {
    this.allSelected = this.questions.every(question => question.checked);
  }

  someSelected(): boolean {
    return this.questions.filter(question => question.checked).length > 0 && !this.allSelected;
  }

  selectAll(checked: boolean): void {
    this.questions.forEach(question => (question.checked = checked));
  }

  submit() {
    this.dialogRef.close(this.questions.map(question => question.checked));
  }
}
