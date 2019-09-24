import { ErrorReportingService } from './error-reporting.service';

interface Breadcrumb {
  type: string;
  metaData: {
    from: string;
    to: string;
  };
}

describe('ErrorReportingService', () => {
  it('should redact the access_token from the breadcrumb URL', async () => {
    const breadcrumbs: Breadcrumb[] = [
      {
        type: 'navigation',
        metaData: {
          from: '/somewhere&access_token=thing',
          to: '/projects'
        }
      },
      {
        type: 'navigation',
        metaData: {
          from: '/projects#access_token=secret',
          to: '/'
        }
      }
    ];

    const report = { breadcrumbs };

    ErrorReportingService.beforeSend(report);
    expect(report.breadcrumbs[0].metaData.from).toEqual('/somewhere&access_token=thing');
    expect(report.breadcrumbs[0].metaData.to).toEqual('/projects');
    expect(report.breadcrumbs[1].metaData.from).toEqual('/projects#access_token=redacted_for_error_report');
    expect(report.breadcrumbs[1].metaData.to).toEqual('/');
  });
});
