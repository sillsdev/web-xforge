import { MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web/dialog';
import { Component, Inject } from '@angular/core';
import { issuesEmailTemplate } from 'xforge-common/utils';
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
  issueEmail = environment.issueEmail;
  showDetails: boolean = false;

  constructor(public dialogRef: MdcDialogRef<ErrorComponent>, @Inject(MDC_DIALOG_DATA) public data: ErrorAlert) {}

  get issueMailTo(): string {
    return issuesEmailTemplate(this.data.eventId);
  }
}
