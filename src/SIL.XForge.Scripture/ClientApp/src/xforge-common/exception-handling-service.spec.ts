import { MdcDialog, MdcDialogRef } from '@angular-mdc/web';
import { Bugsnag } from '@bugsnag/js';
import { User } from 'realtime-server/lib/common/models/user';
import { Observable } from 'rxjs';
import { anything, instance, mock, reset, when } from 'ts-mockito';
import { ErrorComponent } from './error/error.component';
import { ExceptionHandlingService } from './exception-handling-service';
import { UserDoc } from './models/user-doc';
import { UserService } from './user.service';

describe('ExceptionHandlingService', () => {
  it('should not crash on anything', async () => {
    const env = new TestEnvironment();
    const values = [undefined, null, NaN, Infinity, -1, 0, Symbol(), [] as any[], '', new Error()];
    await Promise.all(values.map(value => env.service.handleError(value)));
    expect(env.bugsnagReports.length).toBe(values.length);
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

class MockBugsnagClient {
  notify = (error: any, opts?: any, cb?: any): void => {};
}

class TestEnvironment {
  mockedMdcDialog = mock(MdcDialog);
  mockedUserService = mock(UserService);
  mockedBugsnagClient = mock(MockBugsnagClient);
  bugsnagReports: { error: any; opts: any; cb: any }[] = [];
  service: ExceptionHandlingService;
  rejectUser = false;
  timeoutUser = false;

  userDoc = {
    data: {
      authId: 'a',
      name: 'b',
      displayName: 'c',
      email: 'd'
    } as Readonly<User>,
    id: 'some id'
  } as UserDoc;

  constructor() {
    this.service = new ExceptionHandlingService(
      instance(this.mockedMdcDialog),
      instance(this.mockedUserService),
      instance(this.mockedBugsnagClient) as Bugsnag.Client
    );

    when(this.mockedMdcDialog.open(anything(), anything())).thenReturn({
      afterClosed: () => {
        return {
          subscribe: (cb: () => void) => {
            setTimeout(cb, 0);
          }
        } as Observable<{}>;
      }
    } as MdcDialogRef<ErrorComponent, {}>);

    when(this.mockedUserService.getCurrentUser()).thenCall(() => {
      return new Promise((resolve, reject) => {
        if (!this.timeoutUser) {
          this.rejectUser ? reject() : resolve(this.userDoc);
        }
      });
    });

    when(this.mockedBugsnagClient.notify(anything(), anything(), anything())).thenCall(
      (error: any, opts: Bugsnag.INotifyOpts, cb: any) => {
        this.bugsnagReports.push({
          error,
          opts,
          cb
        });
      }
    );
  }

  get oneAndOnlyReport() {
    expect(this.bugsnagReports.length).toEqual(1);
    return this.bugsnagReports[this.bugsnagReports.length - 1];
  }
}
