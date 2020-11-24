import { Event } from '@bugsnag/js';
import { ErrorReportingService } from './error-reporting.service';

describe('ErrorReportingService', () => {
  it('should redact the access_token from the breadcrumb and request URLs', async () => {
    const event = Event.create(
      new Error('some error'),
      false,
      {
        severity: 'error',
        unhandled: false,
        severityReason: {
          type: 'blah',
          blah: 'blah'
        }
      },
      'some component',
      3
    );

    event.breadcrumbs = [
      {
        type: 'navigation',
        metadata: {
          from: 'http://localhost:5000/somewhere&access_token=thing',
          to: 'http://localhost:5000/somewhere'
        },
        message: '',
        timestamp: new Date()
      },
      {
        type: 'navigation',
        metadata: {
          from: 'http://localhost:5000/projects#access_token=secret',
          to: 'http://localhost:5000/projects'
        },
        message: '',
        timestamp: new Date()
      }
    ];
    event.request = { url: 'http://localhost:5000/projects#access_token=12345' };

    ErrorReportingService.beforeSend({}, event);
    expect(event.breadcrumbs[0].metadata.from).toEqual('http://localhost:5000/somewhere&access_token=thing');
    expect(event.breadcrumbs[0].metadata.to).toEqual('http://localhost:5000/somewhere');
    expect(event.breadcrumbs[1].metadata.from).toEqual(
      'http://localhost:5000/projects#access_token=redacted_for_error_report'
    );
    expect(event.breadcrumbs[1].metadata.to).toEqual('http://localhost:5000/projects');
    expect(event.request.url).toEqual('http://localhost:5000/projects#access_token=redacted_for_error_report');
  });
});
