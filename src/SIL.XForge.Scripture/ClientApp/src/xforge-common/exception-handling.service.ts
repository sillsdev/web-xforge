import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, Injector, NgZone } from '@angular/core';
import Bugsnag, { Breadcrumb, BrowserConfig } from '@bugsnag/js';
import { firstValueFrom } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import versionData from '../../../version.json';
import { MACHINE_API_BASE_URL } from '../app/machine-api/http-client';
import { environment } from '../environments/environment';
import { hasObjectProp, hasStringProp } from '../type-utils';
import { CONSOLE } from './browser-globals';
import { DialogService } from './dialog.service';
import { ErrorAlertData, ErrorDialogComponent } from './error-dialog/error-dialog.component';
import { ErrorReportingService } from './error-reporting.service';
import { FeatureFlagService } from './feature-flags/feature-flag.service';
import { NoticeService } from './notice.service';
import { PwaService } from './pwa.service';
import { COMMAND_API_NAMESPACE } from './url-constants';
import { objectId } from './utils';

export interface BreadcrumbSelector {
  element: string;
  selector: string;
  useParent?: boolean;
}

export class AppError extends Error {
  constructor(
    message: string,
    private readonly data?: any
  ) {
    super(message);
    if (Bugsnag.isStarted()) Bugsnag.leaveBreadcrumb(message, this.data, 'log');
    console.error(message, this.data);
  }
}

@Injectable()
export class ExceptionHandlingService {
  static initBugsnag(): void {
    const config: BrowserConfig = {
      apiKey: environment.bugsnagApiKey,
      appVersion: versionData.version,
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
  static handleBreadcrumb(breadcrumb: Breadcrumb): void {
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
        targetSelector = targetSelector.substring(0, targetSelector.indexOf('>')).trim();
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
  private alertQueue: ErrorAlertData[] = [];
  private dialogOpen = false;

  constructor(
    private readonly injector: Injector,
    private readonly i18n: I18nService
  ) {}

  async handleError(originalError: unknown, silently: boolean = false): Promise<void> {
    // Angular error handlers are instantiated before all other providers, so we cannot inject dependencies. Instead we
    // use the "Injector" to get the dependencies in this method. At this point, providers should have been
    // instantiated.
    let ngZone: NgZone;
    let noticeService: NoticeService;
    let dialogService: DialogService;
    let errorReportingService: ErrorReportingService;
    let pwaService: PwaService;
    let featureFlagService: FeatureFlagService;
    try {
      ngZone = this.injector.get(NgZone);
      noticeService = this.injector.get(NoticeService);
      dialogService = this.injector.get(DialogService);
      errorReportingService = this.injector.get(ErrorReportingService);
      pwaService = this.injector.get(PwaService);
      featureFlagService = this.injector.get(FeatureFlagService);
      this.console = this.injector.get(CONSOLE);
    } catch {
      this.console.log(`Error occurred. Unable to report to Bugsnag, because dependency injection failed.`);
      this.console.error(originalError);
      return;
    }

    // Error could be any value; if it's not an object turn it into one
    let error: object = ErrorReportingService.normalizeError(originalError);

    // If a promise was rejected with an error, we want to report that error, because it is more likely to have a useful
    // stack trace.
    error = hasObjectProp(error, 'rejection') ? error.rejection : error;

    // There's no exact science here. We're looking for XMLHttpRequests that failed, but not due to HTTP response codes.
    if (
      hasObjectProp(error, 'error') &&
      hasObjectProp(error.error, 'target') &&
      error.error.target instanceof XMLHttpRequest &&
      error.error.target.status === 0
    ) {
      ngZone.run(() =>
        noticeService.showError(this.i18n.translateStatic('exception_handling_service.network_request_failed'))
      );
      return;
    }

    if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'DataError')) {
      ngZone.run(() => noticeService.showError(this.i18n.translateStatic('exception_handling_service.out_of_space')));
      return;
    }

    if (
      error instanceof HttpErrorResponse &&
      error.status === 504 &&
      error.statusText === 'Gateway Timeout' &&
      error.url != null
    ) {
      // ignore 504 errors from ngsw-worker.js to machine-api or command-api (these happen when offline)
      const url = new URL(error.url);
      if (url.pathname.startsWith('/' + MACHINE_API_BASE_URL) || url.pathname.startsWith('/' + COMMAND_API_NAMESPACE)) {
        silently = true;
      }
    }

    if (
      // these are the properties Bugsnag checks for, and will have problems if they don't exist
      !(
        (hasStringProp(error, 'name') || hasStringProp(error, 'errorClass')) &&
        (hasStringProp(error, 'message') || hasStringProp(error, 'errorMessage'))
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
    const messages: string[] = messageKeys
      .map(key => (hasStringProp(error, key) ? error[key].split('\n')[0] : null))
      .filter((s): s is string => s != null);

    let message = messages[0] ?? this.i18n.translateStatic('exception_handling_service.unknown_error');
    if (
      message.includes('A mutation operation was attempted on a database that did not allow mutations.') &&
      window.navigator.userAgent.includes('Gecko/')
    ) {
      message = this.i18n.translateStatic('exception_handling_service.firefox_private_browsing_or_no_space');
    }

    // try/finally blocks are to prevent an exception from preventing reporting or logging of an error
    // Since this is the error handler, we're being paranoid. If anything goes wrong here, we may not find out about it
    try {
      const eventId = objectId();
      try {
        // Don't show a dialog if this is a silent error or that we just want sent to Bugsnag
        if (!silently) {
          const stack = hasStringProp(error, 'stack') ? error.stack : undefined;
          await this.handleAlert(ngZone, dialogService, { message, stack, eventId });
        }
      } finally {
        // add the pwa installed status here at the moment of reporting an error since the app can be
        // installed or uninstalled at any time
        errorReportingService.addMeta({
          eventId,
          isPwaInstalled: pwaService.isRunningInstalledApp,
          featureFlags: featureFlagService.getEnabledFlags().join(',')
        });
        this.sendReport(errorReportingService, error);
      }
    } finally {
      // Error logging occurs after error reporting so it won't show up as noise in Bugsnag's breadcrumbs
      this.console.log(`Error occurred. Reported to Bugsnag with release stage set to ${environment.releaseStage}:`);
      this.console.error(error);
    }
  }

  private sendReport(errorReportingService: ErrorReportingService, error: any): void {
    errorReportingService.notify(error, err => {
      if (err) {
        this.console.error('Sending error report failed:');
        this.console.error(err);
      }
    });
  }

  private async handleAlert(ngZone: NgZone, dialogService: DialogService, error: ErrorAlertData): Promise<void> {
    if (!this.alertQueue.some(alert => alert.message === error.message)) {
      this.alertQueue.unshift(error);
      await this.showAlert(ngZone, dialogService);
    }
  }

  private async showAlert(ngZone: NgZone, dialogService: DialogService): Promise<void> {
    if (!this.dialogOpen && this.alertQueue.length) {
      await ngZone.run(async () => {
        this.dialogOpen = true;
        const dialogRef = dialogService.openMatDialog(ErrorDialogComponent, {
          data: this.alertQueue[this.alertQueue.length - 1]
        });
        await firstValueFrom(dialogRef.afterClosed());
        this.alertQueue.pop();
        this.dialogOpen = false;
        await this.showAlert(ngZone, dialogService);
      });
    }
  }
}
