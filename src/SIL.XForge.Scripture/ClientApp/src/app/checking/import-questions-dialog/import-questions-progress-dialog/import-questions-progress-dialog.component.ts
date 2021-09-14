import { MdcDialog, MDC_DIALOG_DATA } from '@angular-mdc/web/dialog';
import { Component, Inject } from '@angular/core';

export interface ImportQuestionsProgressDialogData {
  count: number;
  completed: number;
  cancel: () => void;
}

@Component({
  templateUrl: './import-questions-progress-dialog.component.html',
  styleUrls: ['./import-questions-progress-dialog.component.scss']
})
export class ImportQuestionsProgressDialogComponent {
  canceled = false;

  constructor(@Inject(MDC_DIALOG_DATA) readonly data: ImportQuestionsProgressDialogData, readonly dialog: MdcDialog) {}

  cancel() {
    this.canceled = true;
    this.data.cancel();
  }
}
