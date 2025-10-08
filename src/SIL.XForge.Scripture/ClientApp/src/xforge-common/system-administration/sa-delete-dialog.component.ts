import { Component, Inject } from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogTitle,
  MatDialogContent,
  MatDialogActions,
  MatDialogClose
} from '@angular/material/dialog';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { AvatarComponent } from '../avatar/avatar.component';
import { MatButton } from '@angular/material/button';

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
