import { Injectable } from '@angular/core';
import { environment } from '../environments/environment';
import { OnlineStatusService } from './online-status.service';

declare function gtag(...args: any): void;

interface CommandParams {}

enum GoogleCommands {
  Config = 'config',
  Event = 'event',
  JavaScript = 'js'
}

interface ConfigParams extends CommandParams {
  send_page_view?: boolean;
}

interface PageViewParams extends CommandParams {
  page_location?: string;
  page_title?: string;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private initiated?: Promise<void>;
  constructor(private readonly onlineStatus: OnlineStatusService) {
    if (typeof environment.googleTagId !== 'string') {
      return;
    }

    this.initiated = new Promise(resolve => {
      this.onlineStatus.online.then(() => {
        this.send(GoogleCommands.JavaScript, new Date());
        this.send(GoogleCommands.Config, environment.googleTagId, { send_page_view: false } as ConfigParams);
        resolve();
      });
    });
  }

  /**
   * Logs the page navigation event to the analytics service. This method is responsible for sanitizing the URL before
   * logging it.
   * @param url The URL of the page that was navigated to.
   */
  logNavigation(url: string): void {
    const sanitizedUrl = sanitizeUrl(url);
    this.send(GoogleCommands.Event, 'page_view', { page_location: sanitizedUrl } as PageViewParams);
  }

  private send(command: GoogleCommands, name: any, params?: CommandParams): void {
    Promise.all([this.initiated, this.onlineStatus.online]).then(() => gtag(command, name, params));
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
