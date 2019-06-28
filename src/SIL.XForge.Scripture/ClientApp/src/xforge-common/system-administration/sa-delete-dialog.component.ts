import { MDC_DIALOG_DATA } from '@angular-mdc/web';
import { Component, Inject } from '@angular/core';
import { User } from 'xforge-common/models/user';

export interface SaDeleteUserDialogData {
  user: User;
}

@Component({
  templateUrl: './sa-delete-dialog.component.html'
})
export class SaDeleteDialogComponent {
  constructor(@Inject(MDC_DIALOG_DATA) public data: SaDeleteUserDialogData) {}
}
