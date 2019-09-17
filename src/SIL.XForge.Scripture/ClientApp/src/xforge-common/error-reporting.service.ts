import { Injectable } from '@angular/core';
import bugsnag from '@bugsnag/js';
import { version } from '../../../version.json';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ErrorReportingService {
  /**
   * We don't `import { Bugsnag } from '@bugsnag/js';` because production builds fail. So below `any` is used.
   * Bugsnag is not properly packaged so we can't use it's types in production.
   */
  static createBugsnagClient(): any {
    const config: any = {
      apiKey: environment.bugsnagApiKey,
      appVersion: version,
      appType: 'angular',
      notifyReleaseStages: ['live', 'qa'],
      releaseStage: environment.releaseStage,
      autoNotify: false,
      trackInlineScripts: false
    };
    if (environment.releaseStage === 'dev') {
      config.logger = null;
    }
    return bugsnag(config);
  }

  private readonly bugsnagClient = ErrorReportingService.createBugsnagClient();

  notify(error: any, opts?: any, cb?: (err: any, report: any) => void): void {
    this.bugsnagClient.notify(error, opts, cb);
  }
}
