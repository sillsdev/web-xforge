import { Component, Inject } from '@angular/core';
import { MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA } from '@angular/material/legacy-dialog';
import { User } from 'realtime-server/lib/esm/common/models/user';

export interface SaDeleteUserDialogData {
  user: User;
}

@Component({
  templateUrl: './sa-delete-dialog.component.html',
  styleUrls: ['./sa-delete-dialog.component.scss']
})
export class SaDeleteDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: SaDeleteUserDialogData) {}
}
