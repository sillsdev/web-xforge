import { Injectable } from '@angular/core';
import Bugsnag, { Event, NotifiableError } from '@bugsnag/js';

export interface EventMetadata {
  tab: object;
}

@Injectable({
  providedIn: 'root'
})
export class ErrorReportingService {
  static beforeSend(metaData: EventMetadata[], event: Event) {
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

    for (const tab in metaData) {
      if (metaData.hasOwnProperty(tab)) {
        event.addMetadata(tab, metaData[tab]);
      }
    }
  }

  private static redactAccessToken(url: string): string {
    return url.replace(/^(.*#access_token=).*$/, '$1redacted_for_error_report');
  }

  private metadata: EventMetadata[] = [];

  addMeta(data: object, tab: string = 'custom') {
    this.metadata[tab] = { ...this.metadata[tab], ...data };
  }

  notify(error: NotifiableError, callback?: (err: any, report: any) => void): void {
    Bugsnag.notify(error, event => ErrorReportingService.beforeSend(this.metadata, event), callback);
  }
}
