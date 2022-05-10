import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';

export interface ShareDialogData {
  projectId: string;
  defaultRole: SFProjectRole;
}

@Component({
  templateUrl: './share-dialog.component.html',
  styleUrls: ['./share-dialog.component.scss']
})
export class ShareDialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public readonly data: ShareDialogData) {}
}
