import { Injectable } from '@angular/core';
import Bugsnag, { Event, NotifiableError } from '@bugsnag/js';

export interface EventOptions {
  eventId: string;
  locale: string;
}

@Injectable({
  providedIn: 'root'
})
export class ErrorReportingService {
  static beforeSend(options: EventOptions, event: Event) {
    if (typeof event.request.url === 'string') {
      event.request.url = ErrorReportingService.redactAccessToken(event.request.url as string);
    }
    event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
      if (breadcrumb.type === 'navigation' && breadcrumb.metadata && typeof breadcrumb.metadata.from === 'string') {
        breadcrumb.metadata.from = ErrorReportingService.redactAccessToken(breadcrumb.metadata.from);
        breadcrumb.metadata.to = ErrorReportingService.redactAccessToken(breadcrumb.metadata.to);
      }
      return breadcrumb;
    });

    event.addMetadata('custom', {
      eventId: options.eventId,
      locale: options.locale
    });
  }

  private static redactAccessToken(url: string): string {
    return url.replace(/^(.*#access_token=).*$/, '$1redacted_for_error_report');
  }

  notify(error: NotifiableError, options: EventOptions, callback?: (err: any, report: any) => void): void {
    Bugsnag.notify(error, event => ErrorReportingService.beforeSend(options, event), callback);
  }
}
