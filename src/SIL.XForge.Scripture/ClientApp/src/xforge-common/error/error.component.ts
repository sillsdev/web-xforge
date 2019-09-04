import { MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web';
import { Component, Inject, NgZone } from '@angular/core';
import { environment } from 'src/environments/environment';

export interface ErrorAlert {
  message: string;
  stack: string;
}

@Component({
  templateUrl: './error.component.html',
  styleUrls: ['./error.component.scss']
})
export class ErrorComponent {
  issueEmail = environment.issueEmail;
  showDetails: boolean = false;

  constructor(
    public dialogRef: MdcDialogRef<ErrorComponent>,
    @Inject(MDC_DIALOG_DATA) public data: ErrorAlert,
    private readonly zone: NgZone
  ) {}

  get issueMailTo(): string {
    return encodeURI('mailto:' + environment.issueEmail + '?subject=Scripture Forge v2 Issue');
  }

  toggleStack() {
    this.zone.run(() => {
      this.showDetails = !this.showDetails;
    });
  }
}
