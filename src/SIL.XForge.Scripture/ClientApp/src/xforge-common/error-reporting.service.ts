import { Injectable } from '@angular/core';
import Bugsnag, { BrowserConfig, Client, Event, NotifiableError } from '@bugsnag/js';
import { version } from '../../../version.json';
import { environment } from '../environments/environment';

export interface EventOptions {
  user: any;
  eventId: string;
  locale: string;
}

@Injectable({
  providedIn: 'root'
})
export class ErrorReportingService {
  static createBugsnagClient(): Client {
    const config: BrowserConfig = {
      apiKey: environment.bugsnagApiKey,
      appVersion: version,
      appType: 'angular',
      enabledReleaseStages: ['live', 'qa'],
      releaseStage: environment.releaseStage,
      autoDetectErrors: false
    };
    if (environment.releaseStage === 'dev') {
      config.logger = null;
    }
    return Bugsnag.createClient(config);
  }

  static beforeSend(options: EventOptions, event: Event) {
    if (typeof event.request.url === 'string') {
      event.request.url = ErrorReportingService.redactAccessToken(event.request.url as string);
    }
    event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
      if (breadcrumb.type === 'navigation' && breadcrumb.metadata && typeof breadcrumb.metadata.from === 'string') {
        breadcrumb.metadata.from = ErrorReportingService.redactAccessToken(breadcrumb.metadata.from);
      }
      return breadcrumb;
    });

    event.setUser(options.user);
    event.addMetadata('custom', {
      eventId: options.eventId,
      locale: options.locale
    });
  }

  private static redactAccessToken(url: string): string {
    return url.replace(/^(.*#access_token=).*$/, '$1redacted_for_error_report');
  }

  private readonly bugsnagClient = ErrorReportingService.createBugsnagClient();

  notify(error: NotifiableError, options: EventOptions, callback?: (err: any, report: any) => void): void {
    this.bugsnagClient.notify(error, event => ErrorReportingService.beforeSend(options, event), callback);
  }
}
