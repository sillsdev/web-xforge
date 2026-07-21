import { MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web/dialog';
import { Component, Inject } from '@angular/core';
import { translate } from '@ngneat/transloco';

export interface ConfirmDialogData {
  title: () => string;
  message?: () => string;
  confirmButton?: () => string;
  cancelButton?: () => string;
}

@Component({
  templateUrl: './confirm-dialog.component.html'
})
export class ConfirmDialogComponent {
  constructor(
    @Inject(MDC_DIALOG_DATA) private readonly data: ConfirmDialogData,
    public readonly dialogRef: MdcDialogRef<ConfirmDialogComponent>
  ) {}

  get title(): string {
    return this.data.title();
  }

  get message(): string | undefined {
    return this.data.message?.();
  }

  get confirmButtonText(): string {
    return this.data.confirmButton ? this.data.confirmButton() : translate('confirm_dialog.confirm');
  }

  get cancelButtonText(): string {
    return this.data.cancelButton ? this.data.cancelButton() : translate('confirm_dialog.cancel');
  }
}
