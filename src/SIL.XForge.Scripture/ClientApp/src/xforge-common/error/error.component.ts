import { MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web';
import { Component, Inject } from '@angular/core';
import { environment } from 'src/environments/environment';

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
    return encodeURI(
      `mailto:${environment.issueEmail}?subject=${environment.siteName} issue&body=\n\nError id: ${
        this.data.eventId
      } (included so we can provide better support)`
    );
  }
}
