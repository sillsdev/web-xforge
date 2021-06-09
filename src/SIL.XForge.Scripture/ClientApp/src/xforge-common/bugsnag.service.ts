import { Injectable } from '@angular/core';
import Bugsnag, { BreadcrumbType, BrowserConfig, Client } from '@bugsnag/js';
import { NodeConfig } from '@bugsnag/node';

/**
 * Wrapper around Bugsnag. This injectable service can be mocked to make dependencies of it testable.
 */
@Injectable()
export class BugsnagService {
  start(apiKeyOrOpts: string | BrowserConfig | NodeConfig): Client {
    return Bugsnag.start(apiKeyOrOpts);
  }

  leaveBreadcrumb(message: string, metadata?: { [key: string]: any }, type?: BreadcrumbType): void {
    Bugsnag.leaveBreadcrumb(message, metadata, type);
  }

  setUser(id?: string, email?: string, name?: string): void {
    Bugsnag.setUser(id, email, name);
  }
}
