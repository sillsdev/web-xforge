import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import { OnlineStatusService } from './online-status.service';

declare function gtag(...args: any): void;

// Using a type rather than interface because I intend to turn in into a union type later for each type of event that
// can be reported.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type EventParams = {
  page_path: string;
};

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  constructor(private readonly onlineStatus: OnlineStatusService) {}

  /**
   * Logs the page navigation event to the analytics service. This method is responsible for sanitizing the URL before
   * logging it.
   * @param url The URL of the page that was navigated to.
   */
  logNavigation(url: string): void {
    const sanitizedUrl = sanitizeUrl(url);
    this.logEvent('page_view', { page_path: sanitizedUrl });
  }

  private logEvent(eventName: string, eventParams: EventParams): void {
    if (this.onlineStatus.isOnline && typeof environment.googleTagId === 'string') {
      gtag(eventName, environment.googleTagId, eventParams);
    }
  }
}

const redacted = 'redacted';

// redact access token from the hash
function redactAccessToken(url: string): string {
  const urlObj = new URL(url);
  const hash = urlObj.hash;

  if (hash === '') return url;

  const hashObj = new URLSearchParams(hash.slice(1));
  const accessToken = hashObj.get('access_token');

  if (accessToken === null) return url;

  hashObj.set('access_token', redacted);
  urlObj.hash = hashObj.toString();
  return urlObj.toString();
}

function redactJoinKey(url: string): string {
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/');
  const joinIndex = pathParts.indexOf('join');

  if (joinIndex === -1) {
    return url;
  }

  pathParts[joinIndex + 1] = redacted;
  urlObj.pathname = pathParts.join('/');
  return urlObj.toString();
}

/**
 * Redacts sensitive information from the given URL. Currently this only redacts the access token and the join key, so
 * if relying on this method in the future, be sure to check that it is still redacting everything you need it to.
 * @param url The URL to sanitize.
 * @returns A sanitized version of the URL.
 */
export function sanitizeUrl(url: string): string {
  return redactAccessToken(redactJoinKey(url));
}
