import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { User } from 'realtime-server/lib/esm/common/models/user';

export interface SaDeleteUserDialogData {
  user: User;
}

@Component({
  templateUrl: './sa-delete-dialog.component.html',
  styleUrls: ['./sa-delete-dialog.component.scss'],
  standalone: false
})
export class SaDeleteDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: SaDeleteUserDialogData) {}
}
