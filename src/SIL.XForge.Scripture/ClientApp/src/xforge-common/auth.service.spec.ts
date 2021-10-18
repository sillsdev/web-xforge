import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { WebAuth } from 'auth0-js';
import { CookieService } from 'ngx-cookie-service';
import { of } from 'rxjs';
import { anyString, anything, capture, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { AuthService, EXPIRES_AT_SETTING } from './auth.service';
import { Auth0Service } from './auth0.service';
import { BugsnagService } from './bugsnag.service';
import { CommandService } from './command.service';
import { ErrorReportingService } from './error-reporting.service';
import { LocalSettingsService } from './local-settings.service';
import { LocationService } from './location.service';
import { MemoryOfflineStore } from './memory-offline-store';
import { MemoryRealtimeRemoteStore } from './memory-realtime-remote-store';
import { NoticeService } from './notice.service';
import { OfflineStore } from './offline-store';
import { PwaService } from './pwa.service';
import { SharedbRealtimeRemoteStore } from './sharedb-realtime-remote-store';
import { configureTestingModule } from './test-utils';
import { aspCultureCookieValue } from './utils';

const mockedAuth0Service = mock(Auth0Service);
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
      { provide: SharedbRealtimeRemoteStore, useClass: MemoryRealtimeRemoteStore },
      { provide: OfflineStore, useClass: MemoryOfflineStore },
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

  it('should change password', () => {
    const env = new TestEnvironment();
    const email = 'test@example.com';

    env.service.changePassword(email);

    verify(mockedWebAuth.changePassword(anything(), anything())).once();
    const [changePasswordOptions] = capture(mockedWebAuth.changePassword).last();
    expect(changePasswordOptions).toBeDefined();
    if (changePasswordOptions != null) {
      expect(changePasswordOptions.connection).not.toBeNull();
      expect(changePasswordOptions.email).toEqual(email);
    }
  });

  it('should not check online authentication if not logged in', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: true });
    let isLoggedIn: boolean = true;
    env.service.isLoggedIn.then(result => (isLoggedIn = result));
    tick();
    expect(isLoggedIn).toBe(false, 'setup');
    resetCalls(mockedPwaService);

    env.service.checkOnlineAuth();

    tick();
    verify(mockedPwaService.checkOnline()).never();
  }));

  it('should check online authentication if logged in', fakeAsync(() => {
    const env = new TestEnvironment();
    let isLoggedIn: boolean = false;
    env.service.isLoggedIn.then(result => (isLoggedIn = result));
    tick();
    expect(isLoggedIn).toBe(true, 'setup');
    resetCalls(mockedPwaService);

    env.service.checkOnlineAuth();

    tick();
    verify(mockedPwaService.checkOnline()).once();
    verify(mockedWebAuth.authorize(anything())).never();
  }));

  it('should expire token', fakeAsync(() => {
    const env = new TestEnvironment();

    env.service.expireToken();

    verify(mockedLocalSettingsService.set(EXPIRES_AT_SETTING, anything())).once();
    expect().nothing();
  }));

  it('should authenticate if expired', fakeAsync(() => {
    const env = new TestEnvironment();
    let isAuthenticated: boolean = false;

    env.service.isAuthenticated().then((result: boolean) => (isAuthenticated = result));

    tick();
    expect(isAuthenticated).toBe(true);
    verify(mockedWebAuth.checkSession(anything(), anything())).once();
  }));

  it('should authenticate if not expired', fakeAsync(() => {
    const env = new TestEnvironment({ expiresIn: 10 });
    let isAuthenticated: boolean = false;

    env.service.isAuthenticated().then((result: boolean) => (isAuthenticated = result));

    tick();
    expect(isAuthenticated).toBe(true);
    verify(mockedWebAuth.checkSession(anything(), anything())).never();
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

  it('should link with Paratext', () => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';

    env.service.linkParatext(returnUrl);

    verify(mockedWebAuth.authorize(anything())).once();
    const [authOptions] = capture(mockedWebAuth.authorize).last();
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.state).toBeDefined();
      const state = JSON.parse(authOptions.state!);
      expect(state.returnUrl).toEqual(returnUrl);
      expect(state.linking).toBe(true);
      expect(authOptions.language).toEqual(env.language);
      expect(authOptions.login_hint).toEqual(env.language);
    }
  });

  it('should log out', fakeAsync(() => {
    const env = new TestEnvironment();

    env.service.logOut();

    tick();
    verify(mockedLocalSettingsService.clear()).once();
    verify(mockedWebAuth.logout(anything())).once();
    const [logoutOptions] = capture(mockedWebAuth.logout).last();
    expect(logoutOptions).toBeDefined();
    if (logoutOptions != null) {
      expect(logoutOptions.returnTo).toBeDefined();
    }
  }));

  it('should update interface language only if logged in', fakeAsync(() => {
    const env = new TestEnvironment();
    const interfaceLanguage = 'es';
    expect(interfaceLanguage).not.toEqual(env.language, 'setup');
    let isLoggedIn: boolean = false;
    env.service.isLoggedIn.then(result => (isLoggedIn = result));
    tick();
    expect(isLoggedIn).toBe(true, 'setup');

    env.service.updateInterfaceLanguage(interfaceLanguage);

    tick();
    verify(mockedCommandService.onlineInvoke(anyString(), anyString(), anything())).once();
  }));

  it('should not update interface language if logged out', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: true });
    const interfaceLanguage = 'es';
    expect(interfaceLanguage).not.toEqual(env.language, 'setup');
    let isLoggedIn: boolean = true;
    env.service.isLoggedIn.then(result => (isLoggedIn = result));
    tick();
    expect(env.service.accessToken).toBeNull();
    expect(env.service.idToken).toBeNull();
    expect(env.service.expiresAt).toBeNull();
    expect(isLoggedIn).toBe(false, 'setup');

    env.service.updateInterfaceLanguage(interfaceLanguage);

    tick();
    verify(mockedCommandService.onlineInvoke(anything(), anything(), anything())).never();
  }));
});

interface TestEnvironmentConstructorArgs {
  isOnline?: boolean;
  expiresIn?: number;
}

class TestEnvironment {
  readonly service: AuthService;
  readonly language = 'fr';

  constructor({ isOnline = false, expiresIn }: TestEnvironmentConstructorArgs = {}) {
    resetCalls(mockedWebAuth);
    this.setOnline(isOnline);
    when(mockedWebAuth.checkSession(anything(), anything())).thenCall((_options, callback) => callback(undefined, {}));
    when(mockedCookieService.get(anyString())).thenReturn(aspCultureCookieValue(this.language));
    when(mockedLocalSettingsService.remoteChanges$).thenReturn(of());
    if (expiresIn) {
      const expiresAt = expiresIn * 1000 + Date.now();
      when(mockedLocalSettingsService.get<number>(EXPIRES_AT_SETTING)).thenReturn(expiresAt);
    }

    when(mockedAuth0Service.init(anything())).thenReturn(instance(mockedWebAuth));
    this.service = TestBed.inject(AuthService);
  }

  private setOnline(isOnline: boolean = true) {
    when(mockedPwaService.checkOnline()).thenResolve(isOnline);
    if (isOnline) {
      when(mockedWebAuth.parseHash(anything())).thenCall(callback => callback({}));
    } else {
      when(mockedWebAuth.parseHash(anything())).thenResolve(); // results in "Error: Object{}"
    }
  }
}
