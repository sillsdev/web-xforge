import { Injectable } from '@angular/core';
import { GoogleTagManagerService } from 'angular-google-tag-manager';
import { OnlineStatusService } from './online-status.service';

interface TagEvent {
  event: TagEventType;
}

export interface PageViewEvent extends TagEvent {
  event: TagEventType.PageView;
  pageName: string;
  title?: string;
}

export enum TagEventType {
  PageView = 'virtualPageView'
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  constructor(
    private readonly onlineStatus: OnlineStatusService,
    private gtmService: GoogleTagManagerService
  ) {}

  /**
   * Logs the page navigation event to the analytics service. This method is responsible for sanitizing the URL before
   * logging it.
   * @param event The URL of the page that was navigated to.
   */
  logNavigation(event: PageViewEvent): void {
    event.event = TagEventType.PageView;
    event.pageName = sanitizeUrl(event.pageName);
    this.gtmService.pushTag(event);
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
 * Redacts sensitive information from the given URL. Currently, this only redacts the access token and the join key, so
 * if relying on this method in the future, be sure to check that it is still redacting everything you need it to.
 * @param url The URL to sanitize.
 * @returns A sanitized version of the URL.
 */
export function sanitizeUrl(url: string): string {
  return redactAccessToken(redactJoinKey(url));
}
