import { MdcDialog } from '@angular-mdc/web/dialog';
import { Injectable, Injector, NgZone } from '@angular/core';
import Bugsnag from '@bugsnag/js';
import { BugsnagErrorHandler } from '@bugsnag/plugin-angular';
import { translate } from '@ngneat/transloco';
import { environment } from '../environments/environment';
import { CONSOLE } from './browser-globals';
import { ErrorReportingService } from './error-reporting.service';
import { ErrorAlert, ErrorComponent } from './error/error.component';
import { I18nService } from './i18n.service';
import { NoticeService } from './notice.service';
import { objectId } from './utils';

export class AppError extends Error {
  constructor(message: string, private readonly data?: any) {
    super(message);
    Bugsnag.leaveBreadcrumb(message, data, 'log');
  }
}

@Injectable()
export class ExceptionHandlingService extends BugsnagErrorHandler {
  // Use injected console when it's available, for the sake of tests, but fall back to window.console if injection fails
  private console = window.console;
  private alertQueue: ErrorAlert[] = [];
  private dialogOpen = false;

  constructor(private readonly injector: Injector) {
    super();
  }

  async handleError(error: any) {
    // Angular error handlers are instantiated before all other providers, so we cannot inject dependencies. Instead we
    // use the "Injector" to get the dependencies in this method. At this point, providers should have been
    // instantiated.
    let ngZone: NgZone;
    let noticeService: NoticeService;
    let dialog: MdcDialog;
    let errorReportingService: ErrorReportingService;
    let i18nService: I18nService;
    try {
      ngZone = this.injector.get(NgZone);
      noticeService = this.injector.get(NoticeService);
      dialog = this.injector.get(MdcDialog);
      errorReportingService = this.injector.get(ErrorReportingService);
      i18nService = this.injector.get(I18nService);
      this.console = this.injector.get(CONSOLE);
    } catch (err) {
      this.console.log(`Error occurred. Unable to report to Bugsnag, because dependency injection failed.`);
      this.console.error(error);
      return;
    }

    if (typeof error !== 'object' || error === null || Array.isArray(error)) {
      // using String(value) rather than plain string concatenation, because concatenating a symbol throws an error
      error = new Error('Unknown error: ' + String(error));
    }

    // If a promise was rejected with an error, we want to report that error, because it is more likely to have a useful
    // stack trace.
    error = error.rejection ? error.rejection : error;

    // There's no exact science here. We're looking for XMLHttpRequests that failed, but not due to HTTP response codes.
    if (error.error && error.error.target instanceof XMLHttpRequest && error.error.target.status === 0) {
      ngZone.run(() => noticeService.showError(translate('exception_handling_service.network_request_failed')));
      return;
    }

    if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'DataError')) {
      ngZone.run(() => noticeService.showError(translate('exception_handling_service.out_of_space')));
      return;
    }

    if (
      typeof error === 'object' &&
      // these are the properties Bugsnag checks for, and will have problems if they don't exist
      !(
        (typeof error.name === 'string' || typeof error.errorClass === 'string') &&
        (typeof error.message === 'string' || typeof error.errorMessage === 'string')
      )
    ) {
      // JSON.stringify will throw if there are recursive references, and this needs to be bulletproof
      try {
        error = new Error('Unknown error: ' + JSON.stringify(error));
      } catch {
        error = new Error('Unknown error (with circular references): ' + String(error));
      }
    }

    // some rejection objects from Auth0 use errorDescription or error_description for the rejection message
    const messageKeys = ['message', 'errorDescription', 'error_description'];
    const messageKey = messageKeys.find(key => typeof error[key] === 'string');
    let message =
      messageKey == null
        ? translate('exception_handling_service.unknown_error')
        : (error[messageKey] as string).split('\n')[0];

    if (
      message.includes('A mutation operation was attempted on a database that did not allow mutations.') &&
      window.navigator.userAgent.includes('Gecko/')
    ) {
      message = translate('exception_handling_service.firefox_private_browsing_or_no_space');
    }

    // try/finally blocks are to prevent an exception from preventing reporting or logging of an error
    // Since this is the error handler, we're being paranoid. If anything goes wrong here, we may not find out about it
    try {
      const eventId = objectId();
      try {
        this.handleAlert(ngZone, dialog, { message, stack: error.stack, eventId });
      } finally {
        const locale = i18nService ? i18nService.localeCode : 'unknown';
        this.sendReport(errorReportingService, error, eventId, locale);
      }
    } finally {
      // Error logging occurs after error reporting so it won't show up as noise in Bugsnag's breadcrumbs
      this.console.log(`Error occurred. Reported to Bugsnag with release stage set to ${environment.releaseStage}:`);
      this.console.error(error);
    }
  }

  private sendReport(errorReportingService: ErrorReportingService, error: any, eventId: string, locale: string) {
    errorReportingService.notify(error, { eventId, locale }, err => {
      if (err) {
        this.console.error('Sending error report failed:');
        this.console.error(err);
      }
    });
  }

  private handleAlert(ngZone: NgZone, dialog: MdcDialog, error: ErrorAlert) {
    if (!this.alertQueue.some(alert => alert.message === error.message)) {
      this.alertQueue.unshift(error);
      this.showAlert(ngZone, dialog);
    }
  }

  private showAlert(ngZone: NgZone, dialog: MdcDialog) {
    if (!this.dialogOpen && this.alertQueue.length) {
      ngZone.run(() => {
        this.dialogOpen = true;
        const dialogRef = dialog.open(ErrorComponent, {
          autoFocus: false,
          data: this.alertQueue[this.alertQueue.length - 1]
        });
        dialogRef.afterClosed().subscribe(() => {
          this.alertQueue.pop();
          this.dialogOpen = false;
          this.showAlert(ngZone, dialog);
        });
      });
    }
  }
}
