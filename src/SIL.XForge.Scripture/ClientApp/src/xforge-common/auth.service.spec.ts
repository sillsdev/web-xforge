import { discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { CookieService } from 'ngx-cookie-service';
import { Subject } from 'rxjs';
import { anyString, anything, capture, instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { GenericError, RedirectLoginOptions, TimeoutError } from '@auth0/auth0-spa-js';
import { Auth0Client } from '@auth0/auth0-spa-js';
import { MockConsole } from 'xforge-common/mock-console';
import {
  AuthDetails,
  AuthService,
  AuthState,
  EXPIRES_AT_SETTING,
  ID_TOKEN_SETTING,
  ROLE_SETTING,
  USER_ID_SETTING,
  XF_ROLE_CLAIM,
  XF_USER_ID_CLAIM
} from './auth.service';
import { Auth0Service } from './auth0.service';
import { BugsnagService } from './bugsnag.service';
import { CommandError, CommandErrorCode, CommandService } from './command.service';
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
const mockedWebAuth = mock(Auth0Client);
const mockedConsole: MockConsole = MockConsole.install();

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

  beforeEach(() => {
    mockedConsole.reset();
  });

  it('should change password', fakeAsync(() => {
    const env = new TestEnvironment();
    const email = 'test@example.com';

    env.service.changePassword(email);

    verify(mockedAuth0Service.changePassword(anything())).once();
    const [changePasswordOptions] = capture(mockedAuth0Service.changePassword).last();
    expect(changePasswordOptions).toBeDefined();
    if (changePasswordOptions != null) {
      expect(changePasswordOptions).toEqual(email);
    }
  }));

  it('should not check online authentication if not logged in', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: true });
    expect(env.isLoggedIn).withContext('setup').toBe(false);
    resetCalls(mockedPwaService);

    env.service.checkOnlineAuth();

    tick();
    verify(mockedPwaService.checkOnline()).never();
  }));

  it('should check online authentication if newly logged in', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: true, isNewlyLoggedIn: true });

    expect(env.isLoggedIn).withContext('setup').toBe(true);
    verify(mockedPwaService.checkOnline()).once();
    verify(mockedWebAuth.getTokenSilently(anything())).once();
    verify(mockedWebAuth.loginWithRedirect(anything())).never();
    env.discardTokenExpiryTimer();
  }));

  it('check session is valid after returning online and login if session has expired', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: false, isLoggedIn: true });
    expect(env.isAuthenticated).toBe(true);
    verify(mockedWebAuth.loginWithRedirect(anything())).never();

    env.setLoginRequiredResponse();
    env.setOnline();
    // Should still be true as the expiry set is still in the future
    expect(env.isAuthenticated).toBe(true);
    verify(mockedWebAuth.loginWithRedirect(anything())).never();

    env.setOnline(false);
    env.service.expireToken();
    // Should still be authenticated as we were logged in and are now offline so can't do a renewal
    expect(env.isAuthenticated).toBe(true);
    verify(mockedWebAuth.loginWithRedirect(anything())).never();

    env.setOnline();
    // Should now renew tokens as expired timer is reached
    expect(env.isAuthenticated).toBe(false);
    verify(mockedWebAuth.loginWithRedirect(anything())).once();
  }));

  it('should log out and clear data', fakeAsync(() => {
    const env = new TestEnvironment({
      isOnline: true,
      isLoggedIn: true
    });
    expect(env.isAuthenticated).withContext('logged in isAuthenticated').toBe(true);
    expect(env.service.currentUserId).withContext('logged in currentUserId').toBe(TestEnvironment.userId);
    expect(env.service.idToken).withContext('logged in idToken').toBe(env.auth0Response!.token.id_token);
    expect(env.service.currentUserRole).withContext('logged in currentUserRole').toBe(SystemRole.SystemAdmin);
    expect(env.accessToken).withContext('logged in accessToken').toBe(env.auth0Response!.token.access_token);
    expect(env.service.expiresAt)
      .withContext('logged in expiresAt')
      .toBeGreaterThan(env.auth0Response!.token.expires_in!);

    env.logOut();
    tick();
    expect(env.service.idToken).withContext('logged out idToken').toBeUndefined();
    expect(env.service.currentUserRole).withContext('logged out currentUserRole').toBeUndefined();
    expect(env.accessToken).withContext('logged out accessToken').toBeUndefined();
    expect(env.service.expiresAt).withContext('logged out expiresAt').toBeUndefined();
    verify(mockedWebAuth.logout(anything())).once();
    const [logoutOptions] = capture(mockedWebAuth.logout).last();
    expect(logoutOptions).withContext('logged out logoutOptions').toBeDefined();
    if (logoutOptions != null) {
      expect(logoutOptions.returnTo).withContext('logged out returnTo').toBeDefined();
    }
  }));

  it('should expire token', fakeAsync(() => {
    const env = new TestEnvironment();

    env.service.expireToken();

    verify(mockedLocalSettingsService.set(EXPIRES_AT_SETTING, anything())).once();
    expect().nothing();
  }));

  it('should authenticate if expired', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: true, isLoggedIn: true });
    expect(env.isAuthenticated).toBe(true);
    verify(mockedWebAuth.getTokenSilently()).once();
    resetCalls(mockedWebAuth);

    env.clearTokenExpiryTimer();
    verify(mockedWebAuth.getTokenSilently(anything())).once();
    env.discardTokenExpiryTimer();
  }));

  it('should renew tokens if expired and authenticating', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: true, isLoggedIn: true });
    expect(env.isAuthenticated).toBe(true);

    env.service.expireToken();
    expect(env.service.expiresAt).toBe(0);

    expect(env.isAuthenticated).toBe(true);
    expect(env.service.expiresAt).toBeGreaterThan(0);
    verify(mockedWebAuth.getTokenSilently()).once();
    verify(mockedWebAuth.getTokenSilently(anything())).once();
    env.discardTokenExpiryTimer();
  }));

  it('should renew tokens if expired and idle', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: true, isLoggedIn: true });
    expect(env.isAuthenticated).toBe(true);

    env.service.expireToken();
    expect(env.service.expiresAt).toBe(0);
    // expireToken() doesn't actually change the timer subscribed to
    //   normally isAuthenticated would be triggered next which would call renewTokens()
    // For this test we'll make sure the timer expires so renewTokens() is called
    //   to simulate someone using the app and the auth0 token expires
    env.clearTokenExpiryTimer();
    expect(env.service.expiresAt).toBeGreaterThan(0);
    verify(mockedWebAuth.getTokenSilently(anything())).once();
    env.discardTokenExpiryTimer();
  }));

  it('should attempt login via auth0', fakeAsync(() => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';

    env.service.logIn(returnUrl);

    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    const authOptions: RedirectLoginOptions | undefined = capture<RedirectLoginOptions | undefined>(
      mockedWebAuth.loginWithRedirect
    ).last()[0];
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.appState).toEqual(`{"returnUrl":"${returnUrl}"}`);
      expect(authOptions.language).toEqual(env.language);
      expect(authOptions.login_hint).toEqual(env.language);
      expect(authOptions.mode).toBeUndefined();
    }
  }));

  it('should login without signup', fakeAsync(() => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';
    const signUp = false;

    env.service.logIn(returnUrl, signUp);

    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    const authOptions: RedirectLoginOptions | undefined = capture<RedirectLoginOptions | undefined>(
      mockedWebAuth.loginWithRedirect
    ).last()[0];
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.language).toEqual(env.language);
      expect(authOptions.login_hint).toEqual(env.language);
      expect(authOptions.mode).toBeUndefined();
    }
  }));

  it('should login with signup', fakeAsync(() => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';
    const signUp = true;

    env.service.logIn(returnUrl, signUp);

    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    const authOptions: RedirectLoginOptions | undefined = capture<RedirectLoginOptions | undefined>(
      mockedWebAuth.loginWithRedirect
    ).last()[0];
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.language).toEqual(env.language);
      expect(authOptions.login_hint).toEqual(env.language);
      expect(authOptions.mode).toEqual('signUp');
    }
  }));

  it('should login with signup and locale', fakeAsync(() => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';
    const signUp = true;
    const locale = 'es';
    expect(locale).withContext('setup').not.toEqual(env.language);

    env.service.logIn(returnUrl, signUp, locale);

    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    const authOptions: RedirectLoginOptions | undefined = capture<RedirectLoginOptions | undefined>(
      mockedWebAuth.loginWithRedirect
    ).last()[0];
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.language).toEqual(env.language);
      expect(authOptions.login_hint).toEqual(locale);
      expect(authOptions.mode).toEqual('signUp');
    }
  }));

  it('should link with Paratext', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: true, isLoggedIn: true });
    const returnUrl = 'test-returnUrl';

    env.service.linkParatext(returnUrl);
    tick();

    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    const authOptions: RedirectLoginOptions | undefined = capture<RedirectLoginOptions | undefined>(
      mockedWebAuth.loginWithRedirect
    ).last()[0];
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.appState).toBeDefined();
      const state = JSON.parse(authOptions.appState!);
      expect(state.returnUrl).toEqual(returnUrl);
      expect(state.linking).toBe(true);
      expect(authOptions.language).toEqual(env.language);
      expect(authOptions.login_hint).toEqual(env.language);
    }
    env.discardTokenExpiryTimer();
  }));

  it('should update interface language if logged in', fakeAsync(() => {
    const env = new TestEnvironment();
    const interfaceLanguage = 'es';
    expect(interfaceLanguage).withContext('setup').not.toEqual(env.language);
    expect(env.isLoggedIn).withContext('setup').toBe(true);

    env.service.updateInterfaceLanguage(interfaceLanguage);

    tick();
    const [, method, params] = capture<string, string, any>(mockedCommandService.onlineInvoke).last();
    expect(method).toEqual('updateInterfaceLanguage');
    expect(params).toEqual({ language: interfaceLanguage });
  }));

  it('should not update interface language if logged out', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: true });
    const interfaceLanguage = 'es';
    expect(interfaceLanguage).withContext('setup').not.toEqual(env.language);
    expect(env.accessToken).toBeUndefined();
    expect(env.service.idToken).toBeUndefined();
    expect(env.service.expiresAt).toBeUndefined();
    expect(env.isLoggedIn).withContext('setup').toBe(false);

    env.service.updateInterfaceLanguage(interfaceLanguage);

    tick();
    verify(mockedCommandService.onlineInvoke(anything(), anything(), anything())).never();
  }));

  it('should clear data if user id has changed', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: true, isLoggedIn: true });
    expect(env.isAuthenticated).toBe(true);
    expect(env.service.currentUserId).toBe(TestEnvironment.userId);

    env.auth0Response!.token.access_token = TestEnvironment.encodeAccessToken({
      [XF_ROLE_CLAIM]: SystemRole.SystemAdmin,
      [XF_USER_ID_CLAIM]: 'user02'
    });
    env.clearTokenExpiryTimer();
    expect(env.service.currentUserId).toBe('user02');
    verify(mockedLocalSettingsService.clear()).once();
    env.discardTokenExpiryTimer();
  }));

  it('should log in while offline and previously authenticated', fakeAsync(() => {
    const env = new TestEnvironment({ isLoggedIn: true });
    expect(env.isAuthenticated).toBe(true);
    expect(env.service.currentUserId).toBe(TestEnvironment.userId);
    verify(mockedPwaService.checkOnline()).never();
    env.discardTokenExpiryTimer();
  }));

  it('should retry check session on timeout', fakeAsync(() => {
    const env = new TestEnvironment({ isLoggedIn: true });
    expect(env.isAuthenticated).toBe(true);

    env.setTimeoutResponse();
    mockedConsole.expectAndHide(/Error while renewing access token:/);
    env.service.expireToken();
    env.setOnline();
    expect(env.isAuthenticated).toBe(false);
    verify(mockedWebAuth.getTokenSilently(anything())).twice();
    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    mockedConsole.verify();
    env.discardTokenExpiryTimer();
  }));

  it('should display login error when auth0 times out', fakeAsync(() => {
    const callback = (env: TestEnvironment) => {
      env.setTimeoutResponse();
      mockedConsole.expectAndHide(/Timeout/);
    };
    const env = new TestEnvironment({ isOnline: true, isNewlyLoggedIn: true, callback });
    expect(env.isLoggedIn).toBe(false);
    verify(mockedWebAuth.getTokenSilently(anything())).twice();
    verify(mockedNoticeService.showMessageDialog(anything(), anything())).once();
    mockedConsole.verify();
  }));

  it('should link to paratext account on login', fakeAsync(() => {
    const env = new TestEnvironment({
      isOnline: true,
      isNewlyLoggedIn: true,
      loginState: {
        linking: true,
        currentSub: 'user01'
      }
    });
    expect(env.isAuthenticated).toBe(true);
    expect(env.authLinkedId).toEqual(env.auth0Response!.idToken!.sub);
    env.discardTokenExpiryTimer();
  }));

  it('should reload if an error occurred linking paratext user to another user', fakeAsync(() => {
    const env = new TestEnvironment({
      isOnline: true,
      isNewlyLoggedIn: true,
      loginState: {
        linking: true,
        currentSub: 'user01'
      },
      accountLinkingResponse: new CommandError(CommandErrorCode.Other, 'paratext-linked-to-another-user')
    });
    expect(env.isAuthenticated).toBe(true);
    verify(mockedLocationService.reload()).once();
    verify(mockedNoticeService.showMessageDialog(anything(), anything())).once();
    // handleOnlineAuth gets called a second time after the dialog is closed
    verify(mockedRouter.navigateByUrl('/projects', anything())).twice();

    env.discardTokenExpiryTimer();
  }));

  it('should redirect to url after successful login', fakeAsync(() => {
    const env = new TestEnvironment({
      isOnline: true,
      isNewlyLoggedIn: true,
      loginState: {
        returnUrl: '/projects'
      }
    });
    expect(env.isAuthenticated).toBe(true);
    verify(mockedRouter.navigateByUrl('/projects', anything())).once();
    env.discardTokenExpiryTimer();
  }));

  it('should be identified as newly logged in after parsing hash from auth0', fakeAsync(() => {
    const env = new TestEnvironment({
      isOnline: true,
      isLoggedIn: true,
      isNewlyLoggedIn: true
    });
    expect(env.isAuthenticated).toBe(true);
    expect(env.isNewlyLoggedIn).toBe(true);
    env.discardTokenExpiryTimer();
  }));

  it('should NOT be identified as newly logged when online and local settings are already set', fakeAsync(() => {
    const env = new TestEnvironment({
      isOnline: true,
      isLoggedIn: true
    });
    expect(env.isAuthenticated).toBe(true);
    expect(env.isNewlyLoggedIn).toBe(false);
    env.discardTokenExpiryTimer();
  }));

  it('should go to razor homepage if the user id changes to something else via a remote change', fakeAsync(() => {
    const env = new TestEnvironment({
      isOnline: true,
      isLoggedIn: true
    });

    expect(env.isAuthenticated).toBe(true);
    expect(env.service.currentUserId).toBe(TestEnvironment.userId);

    const event = new StorageEvent('storage', {
      key: USER_ID_SETTING,
      oldValue: TestEnvironment.userId,
      newValue: ''
    });
    env.triggerLocalSettingsEvent(event);
    verify(mockedLocationService.go('/')).once();
    env.discardTokenExpiryTimer();
  }));

  it('should try online login if local settings are available but have expired', fakeAsync(() => {
    const callback = (env: TestEnvironment) => {
      env.setLocalLoginData({ expiresAt: 0 });
    };
    const env = new TestEnvironment({ isOnline: true, isLoggedIn: true, callback });
    expect(env.isLoggedIn).toBe(true);
    expect(env.service.idToken).toBe(env.auth0Response!.token.id_token);
    expect(env.accessToken).toBe(env.auth0Response!.token.access_token);
    expect(env.service.expiresAt).toBeGreaterThan(env.auth0Response!.token.expires_in!);
    verify(mockedPwaService.checkOnline()).once();
    verify(mockedWebAuth.getTokenSilently(anything())).once();
    verify(mockedWebAuth.loginWithRedirect(anything())).never();
    env.discardTokenExpiryTimer();
  }));

  it('should schedule renewal when returning online', fakeAsync(() => {
    const env = new TestEnvironment({ isLoggedIn: true });
    expect(env.isLoggedIn).toBe(true);
    verify(mockedPwaService.checkOnline()).never();

    spyOn<any>(env.service, 'scheduleRenewal');
    env.service.checkOnlineAuth();
    tick();
    expect(env.service['scheduleRenewal']).toHaveBeenCalledTimes(0);

    env.setOnline();
    env.service.checkOnlineAuth();
    tick();
    expect(env.service['scheduleRenewal']).toHaveBeenCalledTimes(1);
    env.discardTokenExpiryTimer();
  }));

  it('should retrieve a fresh token silently if online, logged in, but expired', fakeAsync(() => {
    const callback = (env: TestEnvironment) => {
      env.resetTokenExpireAt();
    };
    const env = new TestEnvironment({ isOnline: true, isLoggedIn: true, callback });
    verify(mockedPwaService.checkOnline()).once();
    verify(mockedWebAuth.getTokenSilently(anything())).once();
    expect(env.isAuthenticated).toBe(true);
    expect(env.service.expiresAt).toBeGreaterThan(0);
    env.discardTokenExpiryTimer();
  }));
});

interface TestEnvironmentConstructorArgs {
  isOnline?: boolean;
  isLoggedIn?: boolean;
  isNewlyLoggedIn?: boolean;
  loginState?: AuthState;
  accountLinkingResponse?: CommandError;
  callback?: (env: TestEnvironment) => void;
}

interface Auth0AccessToken {
  [XF_ROLE_CLAIM]?: SystemRole;
  [XF_USER_ID_CLAIM]?: string;
}

interface LocalSettings {
  accessToken?: string;
  idToken?: string;
  userId?: string;
  role?: SystemRole;
  expiresAt?: number;
}

class TestEnvironment {
  static userId = 'user01';
  auth0Response: AuthDetails | undefined = {
    idToken: undefined,
    loginResult: { appState: JSON.stringify({}) },
    token: { id_token: '', access_token: '', expires_in: 0 }
  };
  readonly service: AuthService;
  readonly language = 'fr';
  private tokenExpiryTimer = 720; // 2 hours
  private localSettings = new Map<string, string | number>();
  private _localeSettingsRemoveChanges = new Subject<StorageEvent>();
  private _loginLinkedAccountId: string | undefined;
  private readonly _authLoginState: string;

  static encodeAccessToken(token: Auth0AccessToken) {
    // The response from auth0 contains 3 parts separated by a dot
    // jwtDecode does a base64 decode on a JSON string after the first dot
    return '.' + btoa(JSON.stringify(token));
  }

  constructor({
    isOnline = false,
    isLoggedIn,
    isNewlyLoggedIn,
    loginState = {},
    accountLinkingResponse,
    callback
  }: TestEnvironmentConstructorArgs = {}) {
    resetCalls(mockedWebAuth);
    this._authLoginState = JSON.stringify(loginState);
    this.setOnline(isOnline);

    if (isLoggedIn || isNewlyLoggedIn) {
      this.setLoginResponse();
      // If logged in but not currently logging in then set local data
      if (isLoggedIn && !isNewlyLoggedIn) {
        this.setLocalLoginData();
      }
      if (isNewlyLoggedIn) {
        when(mockedWebAuth.handleRedirectCallback()).thenResolve(this.auth0Response!.loginResult);
      }
    } else {
      this.setLoginRequiredResponse();
    }
    when(mockedCookieService.get(anyString())).thenReturn(aspCultureCookieValue(this.language));
    when(mockedLocalSettingsService.remoteChanges$).thenReturn(this._localeSettingsRemoveChanges);
    when(mockedLocalSettingsService.get(anyString())).thenCall(key => this.localSettings.get(key));
    when(mockedLocalSettingsService.set(anyString(), anything())).thenCall((key, value) => {
      this.localSettings.set(key, value);
    });
    when(mockedLocalSettingsService.clear()).thenCall(() => {
      this.localSettings.clear();
    });
    when(mockedLocationService.origin).thenReturn('http://localhost:5000');
    if (isNewlyLoggedIn) {
      when(mockedLocationService.href).thenReturn('http://localhost:5000/callback/auth0?code=1234&state=abcd');
    } else {
      when(mockedLocationService.href).thenReturn('http://localhost:5000/projects');
    }
    when(mockedNoticeService.showMessageDialog(anything(), anything())).thenResolve();
    when(mockedAuth0Service.init(anything())).thenReturn(instance(mockedWebAuth));
    when(mockedAuth0Service.changePassword(anything())).thenReturn(new Promise(r => r));
    when(mockedCommandService.onlineInvoke(anything(), 'linkParatextAccount', anything())).thenCall(
      (_url, _method, params) => {
        if (accountLinkingResponse != null) {
          throw accountLinkingResponse;
        }
        if (params?.secondaryId != null) {
          this._loginLinkedAccountId = params.secondaryId;
        }
      }
    );
    if (callback != null) {
      callback(this);
    }
    this.service = TestBed.inject(AuthService);
    tick();
    if (isOnline && isLoggedIn) {
      this.service.checkOnlineAuth();
      tick();
    }
  }

  get accessToken(): string | undefined {
    let accessToken;
    this.service.getAccessToken().then(token => (accessToken = token));
    tick();
    return accessToken;
  }

  get authLinkedId(): string | undefined {
    return this._loginLinkedAccountId;
  }

  get isAuthenticated(): boolean {
    let isAuthenticated = false;
    this.service.isAuthenticated().then(authenticated => (isAuthenticated = authenticated));
    tick();
    if (!isAuthenticated) {
      this.setLoginRequiredResponse();
    }
    return isAuthenticated;
  }

  get isLoggedIn(): boolean {
    let isLoggedIn = false;
    this.service.isLoggedIn.then(loggedIn => (isLoggedIn = loggedIn));
    tick();
    return isLoggedIn;
  }

  get isNewlyLoggedIn(): boolean {
    let isNewlyLoggedIn = false;
    this.service.isNewlyLoggedIn.then(loggedIn => (isNewlyLoggedIn = loggedIn));
    tick();
    return isNewlyLoggedIn;
  }

  /**
   * Force the timer set for scheduled renewals to expire
   */
  clearTokenExpiryTimer() {
    tick(this.tokenExpiryTimer * 1000 - 30000);
  }

  /**
   * Discard periodic timers rather than tick which will keep restarting the timers
   * when the expiry token reaches zero and then attempts to renewTokens again
   */
  discardTokenExpiryTimer() {
    discardPeriodicTasks();
  }

  logOut() {
    this.service.logOut();
    this.setLoginRequiredResponse();
  }

  resetTokenExpireAt() {
    this.localSettings.set(EXPIRES_AT_SETTING, 0);
  }

  setLocalLoginData({ idToken, userId, role, expiresAt }: LocalSettings = {}) {
    this.localSettings.set(ID_TOKEN_SETTING, idToken ?? this.auth0Response!.token.id_token);
    this.localSettings.set(USER_ID_SETTING, userId ?? TestEnvironment.userId);
    this.localSettings.set(ROLE_SETTING, role ?? SystemRole.SystemAdmin);
    this.localSettings.set(EXPIRES_AT_SETTING, expiresAt ?? (this.tokenExpiryTimer - 30) * 1000 + Date.now());
  }

  setLoginResponse(auth0Response?: AuthDetails | undefined) {
    if (auth0Response == null) {
      auth0Response = {
        token: {
          id_token: '12345',
          access_token: TestEnvironment.encodeAccessToken({
            [XF_ROLE_CLAIM]: SystemRole.SystemAdmin,
            [XF_USER_ID_CLAIM]: TestEnvironment.userId
          }),
          expires_in: this.tokenExpiryTimer
        },
        idToken: { __raw: '1', sub: '7890', email: 'test@example.com' },
        loginResult: {
          appState: this._authLoginState
        }
      };
    }
    this.auth0Response = auth0Response;
    when(mockedWebAuth.getTokenSilently()).thenResolve(this.auth0Response!.token.access_token);
    when(mockedWebAuth.getTokenSilently(anything())).thenResolve(this.auth0Response!.token);
    when(mockedWebAuth.getIdTokenClaims()).thenResolve(this.auth0Response!.idToken);
  }

  setLoginRequiredResponse() {
    const loginError = new GenericError('login_required', 'Not logged in');
    when(mockedWebAuth.getTokenSilently()).thenThrow(loginError);
    when(mockedWebAuth.getTokenSilently(anything())).thenThrow(loginError);
    when(mockedWebAuth.getIdTokenClaims()).thenThrow(loginError);
  }

  setOnline(isOnline: boolean = true): void {
    when(mockedPwaService.checkOnline()).thenResolve(isOnline);
    when(mockedPwaService.isOnline).thenReturn(isOnline);
  }

  setTimeoutResponse() {
    const timeoutError = new TimeoutError();
    when(mockedWebAuth.getTokenSilently()).thenThrow(timeoutError);
    when(mockedWebAuth.getTokenSilently(anything())).thenThrow(timeoutError);
    when(mockedWebAuth.getIdTokenClaims()).thenThrow(timeoutError);
    this.auth0Response = undefined;
  }

  triggerLocalSettingsEvent(event: StorageEvent) {
    this._localeSettingsRemoveChanges.next(event);
  }
}
