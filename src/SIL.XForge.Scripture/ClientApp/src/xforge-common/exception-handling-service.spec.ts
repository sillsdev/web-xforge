import { MdcDialog, MdcDialogRef } from '@angular-mdc/web/dialog';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { CookieService } from 'ngx-cookie-service';
import { User } from 'realtime-server/lib/common/models/user';
import { Observable } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { AuthService } from './auth.service';
import { CONSOLE } from './browser-globals';
import { ErrorReportingService } from './error-reporting.service';
import { ErrorComponent } from './error/error.component';
import { ExceptionHandlingService } from './exception-handling-service';
import { UserDoc } from './models/user-doc';
import { NoticeService } from './notice.service';
import { configureTestingModule, TestTranslocoModule } from './test-utils';
import { UserService } from './user.service';

const mockedAuthService = mock(AuthService);
const mockedMdcDialog = mock(MdcDialog);
const mockedUserService = mock(UserService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedNoticeService = mock(NoticeService);
const mockedCookieService = mock(CookieService);

// suppress any expected logging so it won't be shown in the test results
class MockConsole {
  log(val: any) {
    if (val !== 'Error occurred. Reported to Bugsnag with release stage set to dev:') {
      console.log(val);
    }
  }
  error(val: any) {
    if (
      !['', 'Test error', 'Original error'].includes(val.message) &&
      !(val.message != null && val.message.startsWith('Unknown error'))
    ) {
      console.error(val);
    }
  }
}

describe('ExceptionHandlingService', () => {
  configureTestingModule(() => ({
    providers: [
      ExceptionHandlingService,
      { provide: AuthService, useMock: mockedAuthService },
      { provide: MdcDialog, useMock: mockedMdcDialog },
      { provide: UserService, useMock: mockedUserService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: CONSOLE, useValue: new MockConsole() },
      { provide: CookieService, useMock: mockedCookieService }
    ],
    imports: [TestTranslocoModule]
  }));

  it('should not crash on anything', async () => {
    const env = new TestEnvironment();
    const values = [
      undefined,
      null,
      NaN,
      true,
      false,
      Infinity,
      -1,
      0,
      Symbol(),
      [],
      '',
      '\0',
      new Error(),
      () => {},
      BigInt(3)
    ];
    await Promise.all(values.map(value => env.service.handleError(value)));
    expect(env.errorReports.length).toBe(values.length);
  });

  it('should unwrap a rejection from a promise', async () => {
    const env = new TestEnvironment();
    await env.service.handleError({
      message: 'This is the outer message',
      stack: 'Stack trace trace to promise implementation',
      rejection: {
        message: 'Original error',
        name: 'Original error name'
      }
    });

    expect(env.oneAndOnlyReport.error.message).toBe('Original error');
    expect(env.oneAndOnlyReport.error.name).toBe('Original error name');
    expect(env.oneAndOnlyReport.opts.user.id).toBe('some id');
    expect(env.oneAndOnlyReport.opts.metaData.eventId).toMatch(/[\da-f]{24}/);
  });

  it('should handle arbitrary objects', async () => {
    const env = new TestEnvironment();
    await env.service.handleError({
      a: 1
    });
    expect(env.oneAndOnlyReport.error.message).toBe('Unknown error: {"a":1}');
  });

  it('should handle circular objects', async () => {
    const env = new TestEnvironment();
    const z = { z: {} };
    z.z = z;
    expect(() => JSON.stringify(z)).toThrow();
    await env.service.handleError(z);
    expect(env.oneAndOnlyReport.error.message).toBe('Unknown error (with circular references): [object Object]');
  });

  it('should handle undefined users', async () => {
    const env = new TestEnvironment();
    env.userDoc = undefined;
    await env.service.handleError({
      message: 'Test error',
      stack: 'Some stack trace'
    });

    expect(env.oneAndOnlyReport.error).toBeDefined();
    expect(env.oneAndOnlyReport.opts.metaData).toBeDefined();
    expect(env.oneAndOnlyReport.opts.user).toBeUndefined();
  });

  it('should handle user object being unavailable', fakeAsync(() => {
    const env = new TestEnvironment();
    env.timeoutUser = true;
    env.service.handleError(new Error('Test error'));
    tick(3000); // 3000ms is the time the exception handler waits for the user doc before timing out
    expect(env.oneAndOnlyReport.error).toBeDefined();
    expect(env.oneAndOnlyReport.opts).toBeDefined();
    expect(env.oneAndOnlyReport.opts.user).toBeUndefined();
  }));

  it('should handle promise for user being rejected', async () => {
    const env = new TestEnvironment();
    env.rejectUser = true;
    await env.service.handleError(new Error('Test error'));

    expect(env.oneAndOnlyReport.error).toBeDefined();
    expect(env.oneAndOnlyReport.opts).toBeDefined();
    expect(env.oneAndOnlyReport.opts.user).toBeUndefined();
  });

  it('should handle storage quota exceeded errors', async () => {
    const env = new TestEnvironment();
    await env.service.handleError(new DOMException('error', 'QuotaExceededError'));
    verify(mockedNoticeService.showError(anything())).once();
    expect().nothing();
  });
});

class TestEnvironment {
  readonly errorReports: { error: any; opts: any; callback: any }[] = [];
  readonly service: ExceptionHandlingService;
  rejectUser = false;
  timeoutUser = false;

  userDoc: UserDoc | undefined = {
    data: {
      authId: 'a',
      name: 'b',
      displayName: 'c',
      email: 'd'
    } as Readonly<User>,
    id: 'some id'
  } as UserDoc;

  constructor() {
    this.service = TestBed.get(ExceptionHandlingService);

    when(mockedMdcDialog.open(anything(), anything())).thenReturn({
      afterClosed: () => {
        return {
          subscribe: (callback: () => void) => {
            setTimeout(callback, 0);
          }
        } as Observable<{}>;
      }
    } as MdcDialogRef<ErrorComponent, {}>);

    when(mockedUserService.getCurrentUser()).thenCall(() => {
      return new Promise((resolve, reject) => {
        if (!this.timeoutUser) {
          this.rejectUser ? reject() : resolve(this.userDoc);
        }
      });
    });

    when(mockedErrorReportingService.notify(anything(), anything(), anything())).thenCall(
      (error: any, opts: any, callback: any) => {
        this.errorReports.push({
          error,
          opts,
          callback
        });
      }
    );
  }

  get oneAndOnlyReport() {
    expect(this.errorReports.length).toEqual(1);
    return this.errorReports[this.errorReports.length - 1];
  }
}
