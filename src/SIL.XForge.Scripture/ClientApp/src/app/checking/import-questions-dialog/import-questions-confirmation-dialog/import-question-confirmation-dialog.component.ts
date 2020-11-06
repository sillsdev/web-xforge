import { MDC_DIALOG_DATA, MDCDataTableRowSelectionChangedEvent, MdcDialogRef } from '@angular-mdc/web';
import { Component, Inject } from '@angular/core';

export interface ImportQuestionsConfirmationDialogData {
  questions: EditedQuestion[];
}

export interface ImportQuestionsConfirmationDialogResult {
  questions: EditedQuestion[];
}

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
  questions: EditedQuestion[];

  constructor(
    @Inject(MDC_DIALOG_DATA) data: ImportQuestionsConfirmationDialogData,
    private readonly dialogRef: MdcDialogRef<
      ImportQuestionsConfirmationDialogComponent,
      ImportQuestionsConfirmationDialogResult
    >
  ) {
    this.questions = data.questions;
  }

  onSelectionChanged(event: MDCDataTableRowSelectionChangedEvent): void {
    this.questions[event.index].checked = event.selected;
  }

  selectAll(checked: boolean): void {
    this.questions.forEach(question => (question.checked = checked));
  }

  submit() {
    this.dialogRef.close({ questions: this.questions });
  }
}
