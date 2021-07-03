import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { WebAuth } from 'auth0-js';
import { CookieService } from 'ngx-cookie-service';
import { of } from 'rxjs';
import { anyString, anything, capture, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { AuthService } from './auth.service';
import { Auth0Service } from './auth0.service';
import { BugsnagService } from './bugsnag.service';
import { CommandService } from './command.service';
import { ErrorReportingService } from './error-reporting.service';
import { LocalSettingsService } from './local-settings.service';
import { LocationService } from './location.service';
import { NoticeService } from './notice.service';
import { OfflineStore } from './offline-store';
import { PwaService } from './pwa.service';
import { SharedbRealtimeRemoteStore } from './sharedb-realtime-remote-store';
import { configureTestingModule } from './test-utils';
import { aspCultureCookieValue } from './utils';

const mockedAuth0Service = mock(Auth0Service);
const mockedSharedbRealtimeRemoteStore = mock(SharedbRealtimeRemoteStore);
const mockedOfflineStore = mock(OfflineStore);
const mockedLocationService = mock(LocationService);
const mockedCommandService = mock(CommandService);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
const mockedRouter = mock(Router);
const mockedLocalSettingsService = mock(LocalSettingsService);
const mockedPwaService = mock(PwaService);
const mockedNoticeService = mock(NoticeService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedWebAuth = mock(WebAuth);

describe('AuthService', () => {
  configureTestingModule(() => ({
    imports: [RouterTestingModule],
    providers: [
      AuthService,
      { provide: Auth0Service, useMock: mockedAuth0Service },
      { provide: SharedbRealtimeRemoteStore, useMock: mockedSharedbRealtimeRemoteStore },
      { provide: OfflineStore, useMock: mockedOfflineStore },
      { provide: LocationService, useMock: mockedLocationService },
      { provide: CommandService, useMock: mockedCommandService },
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: Router, useMock: mockedRouter },
      { provide: LocalSettingsService, useMock: mockedLocalSettingsService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService }
    ]
  }));

  it('should login', () => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';

    env.service.logIn(returnUrl);

    verify(mockedWebAuth.authorize(anything())).once();
    const [authOptions] = capture(mockedWebAuth.authorize).last();
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.state).toEqual(`{"returnUrl":"${returnUrl}"}`);
      expect(authOptions.language).toEqual(env.language);
      expect(authOptions.login_hint).toEqual(env.language);
      expect(authOptions.mode).toBeUndefined();
    }
  });

  it('should login without signup', () => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';
    const signUp = false;

    env.service.logIn(returnUrl, signUp);

    verify(mockedWebAuth.authorize(anything())).once();
    const [authOptions] = capture(mockedWebAuth.authorize).last();
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.language).toEqual(env.language);
      expect(authOptions.login_hint).toEqual(env.language);
      expect(authOptions.mode).toBeUndefined();
    }
  });

  it('should login with signup', () => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';
    const signUp = true;

    env.service.logIn(returnUrl, signUp);

    verify(mockedWebAuth.authorize(anything())).once();
    const [authOptions] = capture(mockedWebAuth.authorize).last();
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.language).toEqual(env.language);
      expect(authOptions.login_hint).toEqual(env.language);
      expect(authOptions.mode).toEqual('signUp');
    }
  });

  it('should login with signup and locale', () => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';
    const signUp = true;
    const locale = 'es';
    expect(locale).not.toEqual(env.language, 'setup');

    env.service.logIn(returnUrl, signUp, locale);

    verify(mockedWebAuth.authorize(anything())).once();
    const [authOptions] = capture(mockedWebAuth.authorize).last();
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.language).toEqual(env.language);
      expect(authOptions.login_hint).toEqual(locale);
      expect(authOptions.mode).toEqual('signUp');
    }
  });
});

class TestEnvironment {
  readonly service: AuthService;
  readonly language = 'fr';

  constructor() {
    resetCalls(mockedWebAuth);
    when(mockedAuth0Service.init(anything())).thenReturn(instance(mockedWebAuth));
    when(mockedLocalSettingsService.remoteChanges$).thenReturn(of());
    when(mockedCookieService.get(anyString())).thenReturn(aspCultureCookieValue(this.language));
    this.service = TestBed.inject(AuthService);
  }
}
