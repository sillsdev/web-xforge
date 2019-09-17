import { MDC_DIALOG_DATA } from '@angular-mdc/web';
import { Component, Inject } from '@angular/core';

export interface MessageDialogData {
  message: string;
}

@Component({
  selector: 'app-message-dialog',
  templateUrl: './message-dialog.component.html'
})
export class MessageDialogComponent {
  constructor(@Inject(MDC_DIALOG_DATA) private readonly data: MessageDialogData) {}

  get message(): string {
    return this.data.message;
  }
}
