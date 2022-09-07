import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';

export interface ConfirmationDialogData {
  message: string;
}

@Component({
  selector: 'app-confirmation-dialog',
  templateUrl: './confirmation-dialog.component.html'
})
export class ConfirmationDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) private data: ConfirmationDialogData) {}

  get message(): string {
    return this.data.message;
  }
}
