import { MDC_DIALOG_DATA } from '@angular-mdc/web/dialog';
import { Component, Inject } from '@angular/core';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';

export interface ShareDialogData {
  projectId: string;
  isLinkSharingEnabled: boolean;
  defaultRole: SFProjectRole;
}

@Component({
  templateUrl: './share-dialog.component.html',
  styleUrls: ['./share-dialog.component.scss']
})
export class ShareDialogComponent {
  constructor(@Inject(MDC_DIALOG_DATA) public readonly data: ShareDialogData) {}
}
