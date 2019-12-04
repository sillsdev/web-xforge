import { MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web/dialog';
import { Component, Inject } from '@angular/core';
import { translate } from '@ngneat/transloco';
import { issuesEmailTemplate, supportedBrowser } from 'xforge-common/utils';
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
    return this.getLinkHTML(environment.issueEmail, issuesEmailTemplate(this.data.eventId));
  }

  get chromeLink() {
    return this.getLinkHTML(translate('error.chrome'), 'https://www.google.com/chrome/');
  }

  get firefoxLink() {
    return this.getLinkHTML(translate('error.firefox'), 'https://firefox.com');
  }

  getLinkHTML(text: string, href: string) {
    const a = document.createElement('a');
    a.href = href;
    a.setAttribute('target', '_blank');
    a.textContent = text;
    return a.outerHTML;
  }
}
