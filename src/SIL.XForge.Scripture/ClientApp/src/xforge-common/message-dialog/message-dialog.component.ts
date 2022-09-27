import { Component, Inject } from '@angular/core';
import { translate } from '@ngneat/transloco';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface MessageDialogData {
  message: () => string;
  closeButtonText?: () => string;
}

@Component({
  selector: 'app-message-dialog',
  templateUrl: './message-dialog.component.html'
})
export class MessageDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) private readonly data: MessageDialogData) {}

  get message(): string {
    return this.data.message();
  }

  get closeButtonText(): string {
    return this.data.closeButtonText ? this.data.closeButtonText() : translate('message_dialog.dismiss');
  }
}
