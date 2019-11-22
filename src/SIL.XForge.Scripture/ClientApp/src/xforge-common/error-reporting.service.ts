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
      trackInlineScripts: false,
      beforeSend: ErrorReportingService.beforeSend
    };
    if (environment.releaseStage === 'dev') {
      config.logger = null;
    }
    return bugsnag(config);
  }

  static beforeSend(report: any) {
    report.breadcrumbs = report.breadcrumbs.map((breadcrumb: any) => {
      if (
        breadcrumb.type === 'navigation' &&
        breadcrumb.metaData &&
        typeof breadcrumb.metaData.from === 'string' &&
        breadcrumb.metaData.from.includes('/projects#access_token=')
      ) {
        breadcrumb.metaData.from = '/projects#access_token=redacted_for_error_report';
      }
      return breadcrumb;
    });
  }

  private readonly bugsnagClient = ErrorReportingService.createBugsnagClient();

  notify(error: any, opts?: any, callback?: (err: any, report: any) => void): void {
    this.bugsnagClient.notify(error, opts, callback);
  }
}
