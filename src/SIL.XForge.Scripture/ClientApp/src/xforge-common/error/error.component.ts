import { MDC_DIALOG_DATA, MdcDialogRef } from '@angular-mdc/web';
import { ChangeDetectorRef, Component, Inject } from '@angular/core';

export interface ErrorAlert {
  message: string;
  stack: string;
}

@Component({
  templateUrl: './error.component.html',
  styleUrls: ['./error.component.scss']
})
export class ErrorComponent {
  showDetails: boolean = false;

  constructor(
    public dialogRef: MdcDialogRef<ErrorComponent>,
    @Inject(MDC_DIALOG_DATA) public data: ErrorAlert,
    private readonly cd: ChangeDetectorRef
  ) {}

  toggleStack() {
    this.showDetails = !this.showDetails;
    // Without this the view doesn't get updated when the "Show details" link is clicked. Using this.cd.markForCheck()
    // instead does not solve the problem. It's unclear what the cause of this is.
    // The same issue occured when the error handler routed to /error
    this.cd.detectChanges();
  }
}
