import { MdcDialog } from '@angular-mdc/web/dialog';
import { ErrorHandler, Injectable, Injector, NgZone } from '@angular/core';
import { translate } from '@ngneat/transloco';
import cloneDeep from 'lodash/cloneDeep';
import { User } from 'realtime-server/lib/common/models/user';
import { environment } from '../environments/environment';
import { CONSOLE } from './browser-globals';
import { ErrorReportingService } from './error-reporting.service';
import { ErrorAlert, ErrorComponent } from './error/error.component';
import { I18nService } from './i18n.service';
import { UserDoc } from './models/user-doc';
import { NoticeService } from './notice.service';
import { UserService } from './user.service';
import { objectId, promiseTimeout } from './utils';

type UserForReport = User & { id: string };

@Injectable()
export class ExceptionHandlingService implements ErrorHandler {
  // Use injected console when it's available, for the sake of tests, but fall back to window.console if injection fails
  private console = window.console;
  private alertQueue: ErrorAlert[] = [];
  private dialogOpen = false;
  private currentUser?: UserDoc;
  private constructionTime = Date.now();

  constructor(private readonly injector: Injector) {}

  async handleError(error: any) {
    // Angular error handlers are instantiated before all other providers, so we cannot inject dependencies. Instead we
    // use the "Injector" to get the dependencies in this method. At this point, providers should have been
    // instantiated.
    let ngZone: NgZone;
    let noticeService: NoticeService;
    let dialog: MdcDialog;
    let errorReportingService: ErrorReportingService;
    let userService: UserService;
    let i18nService: I18nService;
    try {
      ngZone = this.injector.get(NgZone);
      noticeService = this.injector.get(NoticeService);
      dialog = this.injector.get(MdcDialog);
      errorReportingService = this.injector.get(ErrorReportingService);
      userService = this.injector.get(UserService);
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

    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
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
        this.sendReport(errorReportingService, error, eventId, locale, await this.getUserForReporting(userService));
      }
    } finally {
      // Error logging occurs after error reporting so it won't show up as noise in Bugsnag's breadcrumbs
      this.console.log(`Error occurred. Reported to Bugsnag with release stage set to ${environment.releaseStage}:`);
      this.console.error(error);
    }
  }

  /**
   * Returns a promise that will resolve to a ReportStyleUser representing the current user, or, if the user isn't
   * available within a reasonable time (within three seconds of the service being constructed), it will resolve with
   * null.
   */
  private async getUserForReporting(userService: UserService): Promise<UserForReport | undefined> {
    if (!this.currentUser) {
      try {
        this.currentUser = await promiseTimeout(
          userService.getCurrentUser(),
          Math.max(0, this.constructionTime + 3000 - Date.now())
        );
        if (!this.currentUser) {
          return undefined;
        }
      } catch {
        return undefined;
      }
    }
    const user = cloneDeep(this.currentUser.data) as UserForReport;
    user.id = this.currentUser.id;
    return user;
  }

  private sendReport(
    errorReportingService: ErrorReportingService,
    error: any,
    eventId: string,
    locale: string,
    user?: UserForReport
  ) {
    errorReportingService.notify(error, { user, eventId, locale }, err => {
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
