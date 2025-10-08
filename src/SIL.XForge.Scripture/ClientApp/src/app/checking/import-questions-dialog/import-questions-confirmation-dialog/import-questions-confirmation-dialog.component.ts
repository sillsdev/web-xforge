import { Component, Inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogRef,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions
} from '@angular/material/dialog';
import {
  MatTableDataSource,
  MatTable,
  MatColumnDef,
  MatHeaderCellDef,
  MatHeaderCell,
  MatCellDef,
  MatCell,
  MatHeaderRowDef,
  MatHeaderRow,
  MatRowDef,
  MatRow
} from '@angular/material/table';
import { I18nService } from 'xforge-common/i18n.service';
import { TranslocoModule } from '@ngneat/transloco';
import { Dir } from '@angular/cdk/bidi';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatButton } from '@angular/material/button';

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
  imports: [
    TranslocoModule,
    Dir,
    MatDialogTitle,
    CdkScrollable,
    MatDialogContent,
    MatTable,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatCheckbox,
    MatCellDef,
    MatCell,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow,
    MatDialogActions,
    MatButton
  ]
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
