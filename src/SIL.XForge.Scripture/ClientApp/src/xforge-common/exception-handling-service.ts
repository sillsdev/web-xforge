import { MdcDialog } from '@angular-mdc/web/dialog';
import { Injectable, Injector, NgZone } from '@angular/core';
import Bugsnag, { Breadcrumb, BrowserConfig } from '@bugsnag/js';
import { BugsnagErrorHandler } from '@bugsnag/plugin-angular';
import { translate } from '@ngneat/transloco';
import { version } from '../../../version.json';
import { environment } from '../environments/environment';
import { CONSOLE } from './browser-globals';
import { ErrorReportingService } from './error-reporting.service';
import { ErrorAlert, ErrorComponent } from './error/error.component';
import { NoticeService } from './notice.service';
import { objectId } from './utils';

export interface BreadcrumbSelector {
  element: string;
  selector: string;
  useParent?: boolean;
}

export class AppError extends Error {
  constructor(message: string, private readonly data?: any) {
    super(message);
    Bugsnag.leaveBreadcrumb(message, data, 'log');
    console.error(message, data);
  }
}

@Injectable()
export class ExceptionHandlingService extends BugsnagErrorHandler {
  static initBugsnag() {
    const config: BrowserConfig = {
      apiKey: environment.bugsnagApiKey,
      appVersion: version,
      appType: 'angular',
      enabledReleaseStages: ['live', 'qa'],
      releaseStage: environment.releaseStage,
      autoDetectErrors: false,
      onBreadcrumb: ExceptionHandlingService.handleBreadcrumb
    };
    if (environment.releaseStage === 'dev') {
      config.logger = null;
    }
    Bugsnag.start(config);
  }

  /**
   * Bugsnag doesn't always do well trying to get the actual text from some MDC elements e.g. buttons
   * This method does further investigation to try and determine the actual text before creating the breadcrumb
   */
  static handleBreadcrumb(breadcrumb: Breadcrumb) {
    if (
      !['targetSelector', 'targetText'].every(property => breadcrumb.metadata.hasOwnProperty(property)) ||
      breadcrumb.message !== 'UI click'
    ) {
      return;
    }
    let targetSelector: string = breadcrumb.metadata.targetSelector;
    let targetText: string = breadcrumb.metadata.targetText;
    // Only check for MDC selectors Bugsnag has trouble with
    const selectors: BreadcrumbSelector[] = [
      { element: 'BUTTON', selector: 'span' },
      { element: 'DIV.mdc-button__ripple', selector: 'span', useParent: true }
    ];
    const selector = selectors.find(bs => targetSelector.startsWith(bs.element));
    if (selector == null) {
      return;
    }
    let query: Node;
    const specificElement = selector.selector;
    // Sometimes Bugsnag narrows it down to a nested element so we need to use the parent node
    if (selector.useParent) {
      const node = document.querySelector(targetSelector)?.parentNode;
      if (node == null) {
        return;
      } else {
        query = node;
      }
    } else {
      // Strip out classes that are triggered on click
      const classes = [
        'mdc-ripple-upgraded--foreground-activation',
        'mdc-ripple-upgraded--background-focused',
        'mdc-ripple-upgraded'
      ];
      for (let cls of classes) {
        cls = '.' + cls;
        targetSelector = targetSelector.replace(cls, '');
      }
      // Remove CSS specific selectors that Bugsnag added as they aren't compatible with the querySelector
      if (targetSelector.includes('>')) {
        targetSelector = targetSelector.substr(0, targetSelector.indexOf('>')).trim();
      }
      // Check we can still query the element
      const node = document.querySelector(targetSelector);
      if (node == null) {
        return;
      } else {
        query = node;
      }
      // Append the more specific selector so long as something is still returned
      const specificQuery = document.querySelector(targetSelector + ' ' + specificElement);
      if (specificQuery != null) {
        targetSelector += ' ' + specificElement;
        query = specificQuery;
      }
    }
    // We only want the text part of this node
    if (!query.hasChildNodes) {
      return;
    }
    for (const node of Array.from(query.childNodes)) {
      // Only want text nodes or the specific node element
      if (
        (node.nodeType === Node.TEXT_NODE || node.nodeName.toLowerCase() === specificElement) &&
        node.textContent != null
      ) {
        targetText = node.textContent.trim();
        break;
      }
    }
    // If nothing useful is found then just use what Bugsnag already had as a fallback
    if (targetText === '') {
      return;
    }
    breadcrumb.metadata.targetText = targetText;
    breadcrumb.metadata.targetSelector = targetSelector;
  }

  // Use injected console when it's available, for the sake of tests, but fall back to window.console if injection fails
  private console = window.console;
  private alertQueue: ErrorAlert[] = [];
  private dialogOpen = false;

  constructor(private readonly injector: Injector) {
    super();
  }

  async handleError(error: any, silently: boolean = false) {
    // Angular error handlers are instantiated before all other providers, so we cannot inject dependencies. Instead we
    // use the "Injector" to get the dependencies in this method. At this point, providers should have been
    // instantiated.
    let ngZone: NgZone;
    let noticeService: NoticeService;
    let dialog: MdcDialog;
    let errorReportingService: ErrorReportingService;
    try {
      ngZone = this.injector.get(NgZone);
      noticeService = this.injector.get(NoticeService);
      dialog = this.injector.get(MdcDialog);
      errorReportingService = this.injector.get(ErrorReportingService);
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
        // Don't show a dialog if this is a silent error that we just want sent to Bugsnag
        if (!silently) {
          this.handleAlert(ngZone, dialog, { message, stack: error.stack, eventId });
        }
      } finally {
        errorReportingService.addMeta({ eventId });
        this.sendReport(errorReportingService, error);
      }
    } finally {
      // Error logging occurs after error reporting so it won't show up as noise in Bugsnag's breadcrumbs
      this.console.log(`Error occurred. Reported to Bugsnag with release stage set to ${environment.releaseStage}:`);
      this.console.error(error);
    }
  }

  private sendReport(errorReportingService: ErrorReportingService, error: any) {
    errorReportingService.notify(error, err => {
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
