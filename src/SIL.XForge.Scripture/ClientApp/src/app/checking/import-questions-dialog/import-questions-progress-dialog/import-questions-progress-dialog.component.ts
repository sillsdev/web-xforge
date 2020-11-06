import { MDC_DIALOG_DATA, MdcDialog } from '@angular-mdc/web/dialog';
import { Component, Inject } from '@angular/core';

export interface ImportQuestionsProgressDialogData {
  count: number;
}

@Component({
  templateUrl: './import-questions-progress-dialog.component.html'
})
export class ImportQuestionsProgressDialogComponent {
  constructor(@Inject(MDC_DIALOG_DATA) readonly data: ImportQuestionsProgressDialogData, readonly dialog: MdcDialog) {}
}
