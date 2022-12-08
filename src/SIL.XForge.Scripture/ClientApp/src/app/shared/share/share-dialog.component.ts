import { Component, Inject, ViewEncapsulation } from '@angular/core';
import {
  MatLegacyDialogRef as MatDialogRef,
  MAT_LEGACY_DIALOG_DATA as MAT_DIALOG_DATA
} from '@angular/material/legacy-dialog';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';

export interface ShareDialogData {
  projectId: string;
  defaultRole: SFProjectRole;
}

@Component({
  templateUrl: './share-dialog.component.html',
  styleUrls: ['./share-dialog.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class ShareDialogComponent {
  constructor(
    readonly dialogRef: MatDialogRef<ShareDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public readonly data: ShareDialogData
  ) {
    dialogRef.addPanelClass('share-dialog-component-panel');
  }
}
