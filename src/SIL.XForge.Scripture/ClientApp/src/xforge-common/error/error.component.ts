import { MdcDialogRef, MDC_DIALOG_DATA } from '@angular-mdc/web/dialog';
import { Component, Inject } from '@angular/core';
import { browserLinks, getLinkHTML, issuesEmailTemplate, supportedBrowser } from 'xforge-common/utils';
import { environment } from '../../environments/environment';

export interface ErrorAlert {
  message: string;
  stack?: string;
  eventId: string;
}

@Component({
  templateUrl: './error.component.html',
  styleUrls: ['./error.component.scss']
})
export class ErrorComponent {
  showDetails: boolean = false;
  browserUnsupported = !supportedBrowser();

  constructor(public dialogRef: MdcDialogRef<ErrorComponent>, @Inject(MDC_DIALOG_DATA) public data: ErrorAlert) {}

  get issueEmailLink() {
    return getLinkHTML(environment.issueEmail, issuesEmailTemplate(this.data.eventId));
  }

  get browserLinks() {
    return browserLinks();
  }
}
