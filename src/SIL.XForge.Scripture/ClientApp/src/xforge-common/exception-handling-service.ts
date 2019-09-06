import { MdcDialog } from '@angular-mdc/web';
import { ErrorHandler, Injectable } from '@angular/core';
import { ErrorAlert, ErrorComponent } from './error/error.component';

@Injectable()
export class ExceptionHandlingService implements ErrorHandler {
  private alertQueue: ErrorAlert[] = [];
  private dialogOpen = false;

  constructor(private readonly dialog: MdcDialog) {}

  handleError(error: any) {
    let message = error.rejection ? error.rejection.message || error.rejection : error.message;
    if (typeof message === 'string') {
      message = message.split('\n')[0];
    } else {
      message = 'Unknown error';
    }

    if (
      message.includes('A mutation operation was attempted on a database that did not allow mutations.') &&
      window.navigator.userAgent.includes('Gecko/')
    ) {
      message = 'Firefox private browsing mode is not supported because IndexedDB is not avilable.';
    }

    this.handleAlert({ message, stack: error.stack });
    // Using console.error results in logging 'Error: "[object Object]"', which isn't very helpful
    throw error;
  }

  private handleAlert(error: ErrorAlert) {
    this.alertQueue.unshift(error);
    this.showAlert();
  }

  private showAlert() {
    if (!this.dialogOpen && this.alertQueue.length) {
      this.dialogOpen = true;
      const dialog = this.dialog.open(ErrorComponent, { data: this.alertQueue.pop() });
      dialog.afterClosed().subscribe(() => {
        this.dialogOpen = false;
        this.showAlert();
      });
    }
  }
}
