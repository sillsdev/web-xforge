import { CdkScrollable } from '@angular/cdk/scrolling';
import { Component, Inject } from '@angular/core';
import { MatButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle
} from '@angular/material/dialog';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { AvatarComponent } from '../avatar/avatar.component';

export interface SaDeleteUserDialogData {
  user: User;
}

@Component({
  templateUrl: './sa-delete-dialog.component.html',
  styleUrls: ['./sa-delete-dialog.component.scss'],
  imports: [
    MatDialogTitle,
    CdkScrollable,
    MatDialogContent,
    AvatarComponent,
    MatDialogActions,
    MatButton,
    MatDialogClose
  ]
})
export class SaDeleteDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: SaDeleteUserDialogData) {}
}
