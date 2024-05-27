import { Component, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { browserLinks, getLinkHTML, issuesEmailTemplate, supportedBrowser } from 'xforge-common/utils';
import { environment } from '../../environments/environment';

export interface ErrorAlertData {
  message: string;
  stack?: string;
  eventId: string;
}

@Component({
  templateUrl: './error-dialog.component.html',
  styleUrls: ['./error-dialog.component.scss']
})
export class ErrorDialogComponent {
  showDetails = false;
  browserUnsupported = !supportedBrowser();

  issueEmailLink = getLinkHTML(environment.issueEmail, issuesEmailTemplate(this.data.eventId));

  constructor(
    public dialogRef: MatDialogRef<ErrorDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: ErrorAlertData
  ) {}

  get browserLinks(): { chromeLink: string; firefoxLink: string; safariLink: string } {
    return browserLinks();
  }
}
