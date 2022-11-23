import { Injectable } from '@angular/core';
import Bugsnag, { Event, NotifiableError } from '@bugsnag/js';

export interface EventMetadata {
  [key: string]: object;
}

@Injectable({
  providedIn: 'root'
})
export class ErrorReportingService {
  static beforeSend(metaData: EventMetadata, event: Event) {
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

    for (const tabName in metaData) {
      if (metaData.hasOwnProperty(tabName)) {
        event.addMetadata(tabName, metaData[tabName]);
      }
    }
  }

  /**
   * Takes any value and normalizes it by converting it to an object. If it is already an object that is not null and is
   * not an array, the object is returned. Otherwise the value is converted to a string, an error is constructed with a
   * message that includes that string, and that error is returned.
   */
  static normalizeError(error: unknown): object {
    if (typeof error !== 'object' || error == null || Array.isArray(error)) {
      // using String(value) rather than plain string concatenation, because concatenating a symbol throws an error
      return new Error('Unknown error: ' + String(error));
    } else return error;
  }

  private static redactAccessToken(url: string): string {
    return url.replace(/^(.*#access_token=).*$/, '$1redacted_for_error_report');
  }

  private metadata: EventMetadata = {};

  addMeta(data: object, tabName: string = 'custom') {
    this.metadata[tabName] = { ...this.metadata[tabName], ...data };
  }

  notify(error: NotifiableError, callback?: (err: any, report: any) => void): void {
    Bugsnag.notify(error, event => ErrorReportingService.beforeSend(this.metadata, event), callback);
  }

  silentError(message: string, metadata?: object) {
    if (metadata != null) {
      this.addMeta(metadata);
    }
    this.notify({ name: 'Silent Error', message: message });
    console.error(message);
  }
}
