import { MDC_DIALOG_DATA } from '@angular-mdc/web/dialog';
import { Component, Inject, ViewEncapsulation } from '@angular/core';

export interface ShareDialogData {
  projectId: string;
  isLinkSharingEnabled: boolean;
  defaultRole: string;
}

@Component({
  templateUrl: './share-dialog.component.html',
  styleUrls: ['./share-dialog.component.scss']
})
export class ShareDialogComponent {
  constructor(@Inject(MDC_DIALOG_DATA) public readonly data: ShareDialogData) {}
}
