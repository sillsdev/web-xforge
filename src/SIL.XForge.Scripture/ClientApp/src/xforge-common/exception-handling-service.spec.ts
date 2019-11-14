import { MdcDialog, MdcDialogRef } from '@angular-mdc/web/dialog';
import { TestBed } from '@angular/core/testing';
import { User } from 'realtime-server/lib/common/models/user';
import { Observable } from 'rxjs';
import { anything, mock, when } from 'ts-mockito';
import { ErrorReportingService } from './error-reporting.service';
import { ErrorComponent } from './error/error.component';
import { ExceptionHandlingService } from './exception-handling-service';
import { UserDoc } from './models/user-doc';
import { NoticeService } from './notice.service';
import { configureTestingModule, TestTranslocoModule } from './test-utils';
import { UserService } from './user.service';

const mockedMdcDialog = mock(MdcDialog);
const mockedUserService = mock(UserService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedNoticeService = mock(NoticeService);

describe('ExceptionHandlingService', () => {
  configureTestingModule(() => ({
    providers: [
      ExceptionHandlingService,
      { provide: MdcDialog, useMock: mockedMdcDialog },
      { provide: UserService, useMock: mockedUserService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService },
      { provide: NoticeService, useMock: mockedNoticeService }
    ],
    imports: [TestTranslocoModule]
  }));

  it('should not crash on anything', async () => {
    const env = new TestEnvironment();
    const values = [undefined, null, NaN, Infinity, -1, 0, Symbol(), [] as any[], '', new Error()];
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
        stack: 'Original stack trace'
      }
    });

    expect(env.oneAndOnlyReport.error.message).toBe('Original error');
    expect(env.oneAndOnlyReport.error.stack).toBe('Original stack trace');
    expect(env.oneAndOnlyReport.opts.user.id).toBe('some id');
    expect(env.oneAndOnlyReport.opts.metaData.eventId).toMatch(/[\da-f]{24}/);
  });

  it('should handle undefined users', async () => {
    const env = new TestEnvironment();
    env.userDoc = undefined;
    await env.service.handleError({
      message: 'Error message',
      stack: 'Some stack trace'
    });

    expect(env.oneAndOnlyReport.error).toBeDefined();
    expect(env.oneAndOnlyReport.opts.metaData).toBeDefined();
    expect(env.oneAndOnlyReport.opts.user).toBeUndefined();
  });

  it('should handle user object being unavailable', done => {
    jasmine.clock().install();
    jasmine.clock().mockDate();
    const env = new TestEnvironment();
    env.timeoutUser = true;
    env.service.handleError(new Error('Some error')).then(() => {
      expect(env.oneAndOnlyReport.error).toBeDefined();
      expect(env.oneAndOnlyReport.opts).toBeDefined();
      expect(env.oneAndOnlyReport.opts.user).toBeUndefined();
      done();
    });
    jasmine.clock().tick(3000);
    jasmine.clock().uninstall();
  });

  it('should handle promise for user being rejected', async () => {
    const env = new TestEnvironment();
    env.rejectUser = true;
    await env.service.handleError(new Error('Misspelled word error'));

    expect(env.oneAndOnlyReport.error).toBeDefined();
    expect(env.oneAndOnlyReport.opts).toBeDefined();
    expect(env.oneAndOnlyReport.opts.user).toBeUndefined();
  });
});

class TestEnvironment {
  readonly errorReports: { error: any; opts: any; cb: any }[] = [];
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
          subscribe: (cb: () => void) => {
            setTimeout(cb, 0);
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
      (error: any, opts: any, cb: any) => {
        this.errorReports.push({
          error,
          opts,
          cb
        });
      }
    );
  }

  get oneAndOnlyReport() {
    expect(this.errorReports.length).toEqual(1);
    return this.errorReports[this.errorReports.length - 1];
  }
}
