import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { Breadcrumb, NotifiableError } from '@bugsnag/js';
import { CookieService } from 'ngx-cookie-service';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { of } from 'rxjs';
import { anything, capture, instance, mock, verify, when } from 'ts-mockito';
import { AuthService } from './auth.service';
import { CONSOLE } from './browser-globals';
import { DialogService } from './dialog.service';
import { ErrorDialogComponent } from './error-dialog/error-dialog.component';
import { ErrorReportingService } from './error-reporting.service';
import { ExceptionHandlingService } from './exception-handling.service';
import { FeatureFlagService } from './feature-flags/feature-flag.service';
import { UserDoc } from './models/user-doc';
import { NoticeService } from './notice.service';
import { PwaService } from './pwa.service';
import { configureTestingModule, TestTranslocoModule } from './test-utils';
import { UserService } from './user.service';

const mockedAuthService = mock(AuthService);
const mockedDialogService = mock(DialogService);
const mockedUserService = mock(UserService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedNoticeService = mock(NoticeService);
const mockedPwaService = mock(PwaService);
const mockedCookieService = mock(CookieService);
const mockedFeatureFlagService = mock(FeatureFlagService);

// suppress any expected logging so it won't be shown in the test results
class MockConsole {
  log(val: any): void {
    if (val !== 'Error occurred. Reported to Bugsnag with release stage set to dev:') {
      console.log(val);
    }
  }
  error(val: any): void {
    if (
      ![
        '',
        'Test error',
        'Original error',
        'Http failure response for (unknown url): 400 Bad Request',
        'Http failure response for http://localhost:5000/command-api/some-end-point: 504 Gateway Timeout',
        'Http failure response for http://localhost:5000/machine-api/v3/translation/engines/some-end-point: 504 Gateway Timeout'
      ].includes(val.message) &&
      !val.message?.startsWith('Unknown error')
    ) {
      console.error(val);
    }
  }
}
describe('ExceptionHandlingService', () => {
  configureTestingModule(() => ({
    declarations: [HostComponent],
    providers: [
      ExceptionHandlingService,
      { provide: AuthService, useMock: mockedAuthService },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: UserService, useMock: mockedUserService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: CONSOLE, useValue: new MockConsole() },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: FeatureFlagService, useMock: mockedFeatureFlagService }
    ],
    imports: [TestTranslocoModule]
  }));

  it('should not crash on anything', fakeAsync(() => {
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
    Promise.all(values.map(value => env.handleError(value)));
    expect(env.errorReports.length).toBe(values.length);
  }));

  it('should unwrap a rejection from a promise', fakeAsync(() => {
    const env = new TestEnvironment();
    env.handleError({
      message: 'This is the outer message',
      stack: 'Stack trace trace to promise implementation',
      rejection: {
        message: 'Original error',
        name: 'Original error name'
      }
    });

    expect(env.oneAndOnlyReport.error.message).toBe('Original error');
    expect(env.oneAndOnlyReport.error.name).toBe('Original error name');
  }));

  it('should handle arbitrary objects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.handleError({
      a: 1
    });
    expect(env.oneAndOnlyReport.error.message).toBe('Unknown error: {"a":1}');
  }));

  it('should handle circular objects', fakeAsync(() => {
    const env = new TestEnvironment();
    const z = { z: {} };
    z.z = z;
    expect(() => JSON.stringify(z)).toThrow();
    env.handleError(z);
    expect(env.oneAndOnlyReport.error.message).toBe('Unknown error (with circular references): [object Object]');
  }));

  it('should handle storage quota exceeded errors', fakeAsync(() => {
    const env = new TestEnvironment();
    env.handleError(new DOMException('error', 'QuotaExceededError'));

    verify(mockedNoticeService.showError(anything())).once();
    expect().nothing();
  }));

  it('should silently report 504 errors from machine-api or command-api', fakeAsync(() => {
    const env = new TestEnvironment();
    spyOn<any>(env.service, 'handleAlert');

    env.handleError(
      new HttpErrorResponse({
        status: 504,
        statusText: 'Gateway Timeout',
        url: 'http://localhost:5000/machine-api/v3/translation/engines/some-end-point'
      })
    );
    env.handleError(
      new HttpErrorResponse({
        status: 504,
        statusText: 'Gateway Timeout',
        url: 'http://localhost:5000/command-api/some-end-point'
      })
    );

    expect(env.service['handleAlert']).not.toHaveBeenCalled();

    env.handleError(new HttpErrorResponse({ status: 400, statusText: 'Bad Request' }));

    expect(env.service['handleAlert']).toHaveBeenCalled();
    verify(mockedNoticeService.showError(anything())).never();
  }));

  describe('Bugsnag', () => {
    it('should extract text from button', fakeAsync(() => {
      const env = new TestEnvironment();
      const tests: BreadcrumbTests[] = [
        {
          selector: 'BUTTON.mdc-button.plain-text',
          expectedText: 'Plain text',
          expectedSelector: 'BUTTON.mdc-button.plain-text'
        },
        {
          selector: 'BUTTON.mdc-button.include-icon',
          expectedText: 'Inside span',
          expectedSelector: 'BUTTON.mdc-button.include-icon span'
        },
        {
          selector:
            'BUTTON#activated_button.mdc-ripple-upgraded.mdc-ripple-upgraded--background-focused' +
            '.mdc-ripple-upgraded--foreground-activation',
          expectedText: 'Button with ID',
          expectedSelector: 'BUTTON#activated_button span'
        },
        {
          selector: 'DIV.mdc-button__ripple',
          expectedText: 'Ripple text',
          expectedSelector: 'DIV.mdc-button__ripple'
        },
        {
          selector: 'BUTTON.mdc-button.child-element > i',
          expectedText: 'Child',
          expectedSelector: 'BUTTON.mdc-button.child-element span'
        }
      ];
      for (const test of tests) {
        const breadcrumb = env.addBreadcrumb(test.selector);
        expect(breadcrumb.metadata.targetText).toBe(test.expectedText);
        expect(breadcrumb.metadata.targetSelector).toBe(test.expectedSelector);
      }
    }));

    it('should report if pwa is installed', fakeAsync(() => {
      const env = new TestEnvironment();
      env.handleError({ message: 'Should report pwa installed' });
      verify(mockedErrorReportingService.addMeta(anything())).once();
      const [meta] = capture(mockedErrorReportingService.addMeta).first();
      expect(meta['isPwaInstalled']).toBeDefined();
    }));
  });
});

interface BreadcrumbTests {
  selector: string;
  expectedText: string;
  expectedSelector: string;
}

@Component({
  selector: 'app-host',
  template: `
    <button class="mdc-button plain-text">Plain text</button>
    <button class="mdc-button include-icon"><i>icon_name</i><span>Inside span</span></button>
    <button class="mdc-button child-element"><i>icon_name</i><span>Child</span></button>
    <button
      id="activated_button"
      class="mdc-button mdc-ripple-upgraded mdc-ripple-upgraded--background-focused"
      class="mdc-ripple-upgraded--foreground-activation"
    >
      <span>Button with ID</span>
    </button>
    <button id="ripple_button">
      <div class="mdc-button__ripple"></div>
      <span>Ripple text</span>
    </button>
  `
})
class HostComponent {}

class TestEnvironment {
  readonly errorReports: { error: any }[] = [];
  readonly fixture: ComponentFixture<HostComponent>;
  readonly service: ExceptionHandlingService;
  readonly mockedDialogRef = mock<MatDialogRef<ErrorDialogComponent>>(MatDialogRef);

  userDoc: UserDoc | undefined = {
    data: createTestUser() as Readonly<User>,
    id: 'some id'
  } as UserDoc;

  constructor() {
    this.service = TestBed.inject(ExceptionHandlingService);
    this.fixture = TestBed.createComponent(HostComponent);
    this.fixture.detectChanges();

    when(mockedDialogService.openMatDialog(anything(), anything())).thenReturn(instance(this.mockedDialogRef));
    when(this.mockedDialogRef.afterClosed()).thenReturn(of({}));

    when(mockedPwaService.isRunningInstalledApp).thenReturn(false);

    when(mockedErrorReportingService.notify(anything(), anything())).thenCall((error: NotifiableError) =>
      this.errorReports.push({ error })
    );

    when(mockedFeatureFlagService.getEnabledFlags()).thenReturn([]);
  }

  get oneAndOnlyReport(): { error: any } {
    expect(this.errorReports.length).toEqual(1);
    return this.errorReports[this.errorReports.length - 1];
  }

  addBreadcrumb(targetSelector: string): Breadcrumb {
    const breadcrumb: Breadcrumb = {
      message: 'UI click',
      timestamp: new Date(),
      type: 'log',
      metadata: {
        targetSelector,
        targetText: '(...)'
      }
    };
    ExceptionHandlingService.handleBreadcrumb(breadcrumb);
    return breadcrumb;
  }

  handleError(error: any): void {
    this.service.handleError(error);
    flush();
  }
}
