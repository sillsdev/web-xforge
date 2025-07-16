import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatTableDataSource } from '@angular/material/table';
import { I18nService } from 'xforge-common/i18n.service';

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
    styleUrls: ['./import-questions-confirmation-dialog.component.scss'],
    standalone: false
})
export class ImportQuestionsConfirmationDialogComponent {
  questions: EditedQuestion[];
  dataSource: MatTableDataSource<EditedQuestion>;

  constructor(
    @Inject(MAT_DIALOG_DATA) data: ImportQuestionsConfirmationDialogData,
    private readonly dialogRef: MatDialogRef<
      ImportQuestionsConfirmationDialogComponent,
      ImportQuestionsConfirmationDialogResult
    >,
    readonly i18n: I18nService
  ) {
    this.questions = data.questions;
    this.dataSource = new MatTableDataSource<EditedQuestion>(this.questions);
  }

  allSelected(): boolean {
    return this.questions.every(q => q.checked);
  }

  someSelected(): boolean {
    const numSelected: number = this.questions.filter(question => question.checked).length;
    return numSelected > 0 && numSelected < this.questions.length;
  }

  selectAll(checked: boolean): void {
    this.questions.forEach(question => (question.checked = checked));
  }

  submit(): void {
    this.dialogRef.close(this.questions.map(question => question.checked));
  }
}
