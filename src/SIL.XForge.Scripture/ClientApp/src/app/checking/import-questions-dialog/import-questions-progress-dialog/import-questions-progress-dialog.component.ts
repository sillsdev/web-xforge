import { MdcDialog, MDC_DIALOG_DATA } from '@angular-mdc/web/dialog';
import { Component, Inject } from '@angular/core';

export interface ImportQuestionsProgressDialogData {
  count: number;
  completed: number;
}

@Component({
  templateUrl: './import-questions-progress-dialog.component.html'
})
export class ImportQuestionsProgressDialogComponent {
  constructor(@Inject(MDC_DIALOG_DATA) readonly data: ImportQuestionsProgressDialogData, readonly dialog: MdcDialog) {}
}
