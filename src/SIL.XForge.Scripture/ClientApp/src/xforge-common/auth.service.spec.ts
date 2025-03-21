import { discardPeriodicTasks, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Router, RouterModule } from '@angular/router';
import {
  Auth0Client,
  GenericError,
  GetTokenSilentlyVerboseResponse,
  RedirectLoginOptions,
  TimeoutError
} from '@auth0/auth0-spa-js';
import { CookieService } from 'ngx-cookie-service';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { Subject } from 'rxjs';
import { anyString, anything, capture, instance, mock, resetCalls, spy, verify, when } from 'ts-mockito';
import { MockConsole } from 'xforge-common/mock-console';
import {
  AuthDetails,
  AuthService,
  AuthState,
  EXPIRES_AT_SETTING,
  ID_TOKEN_SETTING,
  ROLE_SETTING,
  ROLES_SETTING,
  USER_ID_SETTING,
  XF_ROLE_CLAIM,
  XF_USER_ID_CLAIM
} from './auth.service';
import { Auth0Service, TransparentAuthenticationCookie } from './auth0.service';
import { BugsnagService } from './bugsnag.service';
import { CommandError, CommandErrorCode, CommandService } from './command.service';
import { DialogService } from './dialog.service';
import { ErrorReportingService } from './error-reporting.service';
import { LocalSettingsService } from './local-settings.service';
import { LocationService } from './location.service';
import { MemoryOfflineStore } from './memory-offline-store';
import { MemoryRealtimeRemoteStore } from './memory-realtime-remote-store';
import { OfflineStore } from './offline-store';
import { OnlineStatusService } from './online-status.service';
import { SharedbRealtimeRemoteStore } from './sharedb-realtime-remote-store';
import { TestOnlineStatusModule } from './test-online-status.module';
import { TestOnlineStatusService } from './test-online-status.service';
import { configureTestingModule, TestTranslocoModule } from './test-utils';
import { aspCultureCookieValue } from './utils';

const mockedAuth0Service = mock(Auth0Service);
const mockedLocationService = mock(LocationService);
const mockedCommandService = mock(CommandService);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
const mockedRouter = mock(Router);
const mockedLocalSettingsService = mock(LocalSettingsService);
const mockedDialogService = mock(DialogService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedWebAuth = mock(Auth0Client);
const mockedConsole: MockConsole = MockConsole.install();

describe('AuthService', () => {
  configureTestingModule(() => ({
    imports: [RouterModule.forRoot([]), TestOnlineStatusModule.forRoot(), TestTranslocoModule],
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
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: DialogService, useMock: mockedDialogService },
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
    resetCalls(env.testOnlineStatusServiceSpy);

    env.service.checkOnlineAuth();

    tick();
    verify(env.testOnlineStatusServiceSpy.checkOnline()).never();
  }));

  it('should check online authentication if newly logged in', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: true, isNewlyLoggedIn: true });

    expect(env.isLoggedIn).withContext('setup').toBe(true);
    verify(env.testOnlineStatusServiceSpy.checkOnline()).once();
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
    expect(env.service.currentUserRoles.length).withContext('logged in currentUserRoles').toBe(1);
    expect(env.service.currentUserRoles[0]).withContext('logged in currentUserRole').toBe(SystemRole.SystemAdmin);
    expect(env.accessToken).withContext('logged in accessToken').toBe(env.auth0Response!.token.access_token);
    expect(env.service.expiresAt)
      .withContext('logged in expiresAt')
      .toBeGreaterThan(env.auth0Response!.token.expires_in!);

    env.logOut();
    tick();
    expect(env.service.idToken).withContext('logged out idToken').toBeUndefined();
    expect(env.service.currentUserRoles.length).withContext('logged out currentUserRoles').toBe(0);
    expect(env.accessToken).withContext('logged out accessToken').toBeUndefined();
    expect(env.service.expiresAt).withContext('logged out expiresAt').toBeUndefined();
    verify(mockedWebAuth.logout(anything())).once();
    verify(mockedCookieService.deleteAll('/')).once();
    verify(mockedDialogService.confirm(anything(), anything(), anything())).never();
    const [logoutOptions] = capture(mockedWebAuth.logout).last();
    expect(logoutOptions).withContext('logged out logoutOptions').toBeDefined();
    if (logoutOptions != null) {
      expect(logoutOptions.logoutParams!.returnTo).withContext('logged out returnTo').toBeDefined();
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

  it('should allow the old role value', fakeAsync(() => {
    const env = new TestEnvironment({
      isOnline: true,
      isLoggedIn: true
    });
    env.localSettings.clear();
    expect(env.service.currentUserRoles.length).toBe(0);
    env.localSettings.set(ROLE_SETTING, SystemRole.SystemAdmin);
    expect(env.service.currentUserRoles.length).toBe(1);
    env.discardTokenExpiryTimer();
  }));

  it('should handle a null role value', fakeAsync(() => {
    const env = new TestEnvironment({
      isOnline: true,
      isNewlyLoggedIn: true,
      auth0Response: {
        token: {
          id_token: '12345',
          access_token: TestEnvironment.encodeAccessToken({
            [XF_ROLE_CLAIM]: undefined,
            [XF_USER_ID_CLAIM]: TestEnvironment.userId
          }),
          expires_in: 720
        },
        idToken: { __raw: '1', sub: '7890', email: 'test@example.com' },
        loginResult: {
          appState: JSON.stringify({ returnUrl: '' })
        }
      }
    });

    expect(env.isLoggedIn).withContext('setup').toBe(true);
    expect(env.localSettings.get(ROLES_SETTING)).toEqual([]);
    env.discardTokenExpiryTimer();
  }));

  it('should handle a single role value', fakeAsync(() => {
    const env = new TestEnvironment({
      isOnline: true,
      isNewlyLoggedIn: true,
      auth0Response: {
        token: {
          id_token: '12345',
          access_token: TestEnvironment.encodeAccessToken({
            [XF_ROLE_CLAIM]: SystemRole.SystemAdmin,
            [XF_USER_ID_CLAIM]: TestEnvironment.userId
          }),
          expires_in: 720
        },
        idToken: { __raw: '1', sub: '7890', email: 'test@example.com' },
        loginResult: {
          appState: JSON.stringify({ returnUrl: '' })
        }
      }
    });

    expect(env.isLoggedIn).withContext('setup').toBe(true);
    expect(env.localSettings.get(ROLES_SETTING)).toEqual([SystemRole.SystemAdmin]);
    env.discardTokenExpiryTimer();
  }));

  it('should handle a role array', fakeAsync(() => {
    const env = new TestEnvironment({
      isOnline: true,
      isNewlyLoggedIn: true,
      auth0Response: {
        token: {
          id_token: '12345',
          access_token: TestEnvironment.encodeAccessToken({
            [XF_ROLE_CLAIM]: [SystemRole.SystemAdmin, SystemRole.User],
            [XF_USER_ID_CLAIM]: TestEnvironment.userId
          }),
          expires_in: 720
        },
        idToken: { __raw: '1', sub: '7890', email: 'test@example.com' },
        loginResult: {
          appState: JSON.stringify({ returnUrl: '' })
        }
      }
    });

    expect(env.isLoggedIn).withContext('setup').toBe(true);
    expect(env.localSettings.get(ROLES_SETTING)).toEqual([SystemRole.SystemAdmin, SystemRole.User]);
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

    env.service.logIn({ returnUrl });

    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    const authOptions: RedirectLoginOptions | undefined = capture<RedirectLoginOptions | undefined>(
      mockedWebAuth.loginWithRedirect
    ).last()[0];
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.appState).toEqual(`{"returnUrl":"${returnUrl}"}`);
      expect(authOptions.authorizationParams!.language).toEqual(env.language);
      expect(authOptions.authorizationParams!.login_hint).toEqual(env.language);
      expect(authOptions.authorizationParams!.mode).toBeUndefined();
    }
  }));

  it('should login without signup', fakeAsync(() => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';
    const signUp = false;

    env.service.logIn({ returnUrl, signUp });

    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    const authOptions: RedirectLoginOptions | undefined = capture<RedirectLoginOptions | undefined>(
      mockedWebAuth.loginWithRedirect
    ).last()[0];
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.authorizationParams!.language).toEqual(env.language);
      expect(authOptions.authorizationParams!.login_hint).toEqual(env.language);
      expect(authOptions.authorizationParams!.mode).toBeUndefined();
    }
  }));

  it('should login with signup', fakeAsync(() => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';
    const signUp = true;

    env.service.logIn({ returnUrl, signUp });

    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    const authOptions: RedirectLoginOptions | undefined = capture<RedirectLoginOptions | undefined>(
      mockedWebAuth.loginWithRedirect
    ).last()[0];
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.authorizationParams!.language).toEqual(env.language);
      expect(authOptions.authorizationParams!.login_hint).toEqual(env.language);
      expect(authOptions.authorizationParams!.mode).toEqual('signUp');
    }
  }));

  it('should login with signup and locale', fakeAsync(() => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';
    const signUp = true;
    const locale = 'es';
    expect(locale).withContext('setup').not.toEqual(env.language);

    env.service.logIn({ returnUrl, signUp, locale });

    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    const authOptions: RedirectLoginOptions | undefined = capture<RedirectLoginOptions | undefined>(
      mockedWebAuth.loginWithRedirect
    ).last()[0];
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.authorizationParams!.language).toEqual(env.language);
      expect(authOptions.authorizationParams!.login_hint).toEqual(locale);
      expect(authOptions.authorizationParams!.mode).toEqual('signUp');
    }
  }));

  it('should login with passwordless enabled', fakeAsync(() => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';

    env.service.logIn({ returnUrl });

    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    const authOptions: RedirectLoginOptions | undefined = capture<RedirectLoginOptions | undefined>(
      mockedWebAuth.loginWithRedirect
    ).last()[0];
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.authorizationParams!.enablePasswordless).toEqual(true);
      expect(authOptions.authorizationParams!.promptPasswordlessLogin).toBeUndefined();
    }
  }));

  it('should login with passwordless enabled and prompt for passwordless login', fakeAsync(() => {
    const env = new TestEnvironment();
    const returnUrl = 'test-returnUrl';
    when(mockedLocationService.pathname).thenReturn('/join/sharekey');

    env.service.logIn({ returnUrl });

    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    const authOptions: RedirectLoginOptions | undefined = capture<RedirectLoginOptions | undefined>(
      mockedWebAuth.loginWithRedirect
    ).last()[0];
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.authorizationParams!.enablePasswordless).toEqual(true);
      expect(authOptions.authorizationParams!.promptPasswordlessLogin).toEqual(true);
    }
  }));

  it('should login with defined logo', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedLocationService.origin).thenReturn('https://scriptureforge.org');

    env.service.logIn({ returnUrl: 'test-returnUrl' });

    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    const authOptions: RedirectLoginOptions | undefined = capture<RedirectLoginOptions | undefined>(
      mockedWebAuth.loginWithRedirect
    ).last()[0];
    expect(authOptions).toBeDefined();
    if (authOptions != null) {
      expect(authOptions.authorizationParams!.logo).toBeDefined();
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
      expect(authOptions.authorizationParams!.ui_locales).toEqual(env.language);
      expect(authOptions.authorizationParams!.login_hint).toEqual(env.language);
    }
    env.discardTokenExpiryTimer();
  }));

  it('should update interface language if logged in', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: true, isLoggedIn: true });
    const interfaceLanguage = 'es';
    expect(interfaceLanguage).withContext('setup').not.toEqual(env.language);
    expect(env.isLoggedIn).withContext('setup').toBe(true);

    env.service.updateInterfaceLanguage(interfaceLanguage);

    tick();
    const [, method, params] = capture<string, string, any>(mockedCommandService.onlineInvoke).last();
    expect(method).toEqual('updateInterfaceLanguage');
    expect(params).toEqual({ language: interfaceLanguage });
    env.discardTokenExpiryTimer();
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

  it('should not update interface language while offline', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: false, isLoggedIn: true });
    const interfaceLanguage = 'es';
    expect(interfaceLanguage).withContext('setup').not.toEqual(env.language);
    expect(env.isLoggedIn).withContext('setup').toBe(true);

    env.service.updateInterfaceLanguage(interfaceLanguage);

    tick();
    verify(mockedCommandService.onlineInvoke(anything(), 'updateInterfaceLanguage', anything())).never();

    env.setOnline(true);
    tick();
    verify(mockedCommandService.onlineInvoke(anything(), 'updateInterfaceLanguage', anything())).once();
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
    verify(env.testOnlineStatusServiceSpy.checkOnline()).never();
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
    const callback = (env: TestEnvironment): void => {
      env.setTimeoutResponse();
      mockedConsole.expectAndHide(/Timeout/);
    };
    const env = new TestEnvironment({ isOnline: true, isNewlyLoggedIn: true, callback });
    expect(env.isLoggedIn).toBe(false);
    verify(mockedWebAuth.getTokenSilently(anything())).twice();
    verify(mockedDialogService.message(anything(), anything())).once();
    mockedConsole.verify();
  }));

  it('should link to paratext account on login', fakeAsync(() => {
    const env = new TestEnvironment({
      isOnline: true,
      isNewlyLoggedIn: true,
      loginState: {
        returnUrl: '',
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
        returnUrl: '',
        linking: true,
        currentSub: 'user01'
      },
      accountLinkingResponse: new CommandError(CommandErrorCode.Other, 'paratext-linked-to-another-user')
    });
    expect(env.isAuthenticated).toBe(true);
    verify(mockedLocationService.reload()).once();
    verify(mockedDialogService.message(anything(), anything())).once();
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
    const callback = (env: TestEnvironment): void => {
      env.setLocalLoginData({ expiresAt: 0 });
    };
    const env = new TestEnvironment({ isOnline: true, isLoggedIn: true, callback });
    expect(env.isLoggedIn).toBe(true);
    expect(env.service.idToken).toBe(env.auth0Response!.token.id_token);
    expect(env.accessToken).toBe(env.auth0Response!.token.access_token);
    expect(env.service.expiresAt).toBeGreaterThan(env.auth0Response!.token.expires_in!);
    verify(env.testOnlineStatusServiceSpy.checkOnline()).once();
    verify(mockedWebAuth.getTokenSilently(anything())).once();
    verify(mockedWebAuth.loginWithRedirect(anything())).never();
    env.discardTokenExpiryTimer();
  }));

  it('should schedule renewal when returning online', fakeAsync(() => {
    const env = new TestEnvironment({ isLoggedIn: true });
    expect(env.isLoggedIn).toBe(true);
    verify(env.testOnlineStatusServiceSpy.checkOnline()).never();

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
    const callback = (env: TestEnvironment): void => {
      env.resetTokenExpireAt();
    };
    const env = new TestEnvironment({ isOnline: true, isLoggedIn: true, callback });
    verify(env.testOnlineStatusServiceSpy.checkOnline()).once();
    verify(mockedWebAuth.getTokenSilently(anything())).once();
    expect(env.isAuthenticated).toBe(true);
    expect(env.service.expiresAt).toBeGreaterThan(0);
    env.discardTokenExpiryTimer();
  }));

  it('prompt on log out if transparent authentication cookie is set', fakeAsync(() => {
    const env = new TestEnvironment({ isOnline: true, isLoggedIn: true, setTransparentAuthenticationCookie: true });
    expect(env.isAuthenticated).toBe(true);
    expect(env.isLoggedInUserAnonymous).toBe(true);
    env.service.logOut();
    tick();
    verify(mockedDialogService.confirm(anything(), anything(), anything())).once();
    env.discardTokenExpiryTimer();
  }));

  it('should authenticate transparently when joining', fakeAsync(() => {
    const callback = (env: TestEnvironment): void => {
      when(mockedLocationService.pathname).thenReturn('/join/shareKey');
      when(mockedAuth0Service.tryTransparentAuthentication()).thenResolve(env.validToken);
    };
    const env = new TestEnvironment({
      isOnline: true,
      setTransparentAuthenticationCookie: true,
      callback
    });
    verify(mockedAuth0Service.tryTransparentAuthentication()).once();
    verify(mockedWebAuth.getTokenSilently(anything())).never();
    verify(mockedWebAuth.loginWithRedirect(anything())).never();
    expect(env.isAuthenticated).toBeTrue();
    env.discardTokenExpiryTimer();
  }));

  it('should renew tokens to verify if user is still logged in and join project without transparent authentication', fakeAsync(() => {
    const callback = (env: TestEnvironment): void => {
      when(mockedLocationService.pathname).thenReturn('/join/shareKey');
      when(mockedWebAuth.getTokenSilently(anything())).thenResolve(env.validToken);
      env.localSettings.set(ID_TOKEN_SETTING, '12345');
    };
    const env = new TestEnvironment({
      isOnline: true,
      callback
    });
    verify(mockedAuth0Service.tryTransparentAuthentication()).never();
    verify(mockedWebAuth.loginWithRedirect(anything())).never();
    verify(mockedWebAuth.getTokenSilently(anything())).once();
    expect(env.isAuthenticated).toBeTrue();
    env.discardTokenExpiryTimer();
  }));

  it('should redirect to auth0 if renew tokens fails to verify if a user who was previously logged in when and is trying to join a project', fakeAsync(() => {
    const shareKeyPath = '/join/shareKey';
    const callback = (env: TestEnvironment): void => {
      when(mockedLocationService.pathname).thenReturn(shareKeyPath);
      when(mockedLocationService.search).thenReturn('');
      env.setLoginRequiredResponse();
      env.localSettings.set(ID_TOKEN_SETTING, '12345');
    };
    new TestEnvironment({
      isOnline: true,
      callback
    });
    verify(mockedAuth0Service.tryTransparentAuthentication()).never();
    verify(mockedWebAuth.loginWithRedirect(anything())).once();
    const authOptions: RedirectLoginOptions | undefined = capture<RedirectLoginOptions | undefined>(
      mockedWebAuth.loginWithRedirect
    ).last()[0];
    expect(authOptions?.appState).toEqual(JSON.stringify({ returnUrl: shareKeyPath }));
  }));

  it('should log the user out if they click the log out button when requesting Paratext credential update', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
    env.service.requestParatextCredentialUpdate();
    tick();

    verify(mockedDialogService.confirm(anything(), anything())).once();
    verify(mockedWebAuth.logout(anything())).once();
    expect(capture(mockedWebAuth.logout).last()).toBeDefined();
  }));

  it('should not log the user out if they click cancel when requesting Paratext credential update', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(false);
    env.service.requestParatextCredentialUpdate();
    tick();

    verify(mockedDialogService.confirm(anything(), anything())).once();
    verify(mockedWebAuth.logout(anything())).never();
    expect().nothing();
  }));

  it('should execute the callback if the user clicks cancel when requesting Paratext credential update', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(false);
    let callbackExecuted = false;
    env.service.requestParatextCredentialUpdate(() => (callbackExecuted = true));
    tick();

    verify(mockedDialogService.confirm(anything(), anything())).once();
    verify(mockedWebAuth.logout(anything())).never();
    expect(callbackExecuted).toBe(true);
  }));

  it('should not execute the callback if the user clicks log out when requesting Paratext credential update', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
    let callbackExecuted = false;
    env.service.requestParatextCredentialUpdate(() => (callbackExecuted = true));
    tick();

    verify(mockedDialogService.confirm(anything(), anything())).once();
    verify(mockedWebAuth.logout(anything())).once();
    expect(callbackExecuted).toBe(false);
  }));
});

interface TestEnvironmentConstructorArgs {
  isOnline?: boolean;
  isLoggedIn?: boolean;
  isNewlyLoggedIn?: boolean;
  loginState?: AuthState;
  setTransparentAuthenticationCookie?: boolean;
  accountLinkingResponse?: CommandError;
  auth0Response?: AuthDetails | undefined;
  callback?: (env: TestEnvironment) => void;
}

interface Auth0AccessToken {
  [XF_ROLE_CLAIM]?: SystemRole | SystemRole[];
  [XF_USER_ID_CLAIM]?: string;
}

interface LocalSettings {
  accessToken?: string;
  idToken?: string;
  userId?: string;
  roles?: SystemRole[];
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
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;
  readonly testOnlineStatusServiceSpy: TestOnlineStatusService = spy(this.testOnlineStatusService);
  private tokenExpiryTimer = 720; // 2 hours
  readonly localSettings = new Map<string, string[] | string | number>();
  private _localeSettingsRemoveChanges = new Subject<StorageEvent>();
  private _loginLinkedAccountId: string | undefined;
  private readonly _authLoginState: string;

  static encodeAccessToken(token: Auth0AccessToken): string {
    // The response from auth0 contains 3 parts separated by a dot
    // jwtDecode does a base64 decode on a JSON string after the first dot
    return '.' + window.btoa(JSON.stringify(token));
  }

  constructor({
    isOnline = false,
    isLoggedIn,
    isNewlyLoggedIn,
    loginState = { returnUrl: '' },
    setTransparentAuthenticationCookie,
    accountLinkingResponse,
    auth0Response,
    callback
  }: TestEnvironmentConstructorArgs = {}) {
    resetCalls(mockedWebAuth);
    this._authLoginState = JSON.stringify(loginState);
    this.setOnline(isOnline);

    if (isLoggedIn || isNewlyLoggedIn) {
      this.setLoginResponse(auth0Response);
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
    when(mockedCookieService.check(TransparentAuthenticationCookie)).thenReturn(
      setTransparentAuthenticationCookie === true
    );
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
      when(mockedLocationService.pathname).thenReturn('/callback/auth0');
    } else {
      when(mockedLocationService.href).thenReturn('http://localhost:5000/projects');
      when(mockedLocationService.pathname).thenReturn('/projects');
    }
    when(mockedDialogService.message(anything(), anything())).thenResolve();
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

  get isLoggedInUserAnonymous(): boolean {
    let isLoggedInUserAnonymous = false;
    this.service.isLoggedInUserAnonymous.then(anonymous => (isLoggedInUserAnonymous = anonymous));
    tick();
    return isLoggedInUserAnonymous;
  }

  get isNewlyLoggedIn(): boolean {
    let isNewlyLoggedIn = false;
    this.service.isNewlyLoggedIn.then(loggedIn => (isNewlyLoggedIn = loggedIn));
    tick();
    return isNewlyLoggedIn;
  }

  get validToken(): GetTokenSilentlyVerboseResponse {
    return {
      id_token: '12345',
      access_token: TestEnvironment.encodeAccessToken({
        [XF_ROLE_CLAIM]: SystemRole.SystemAdmin,
        [XF_USER_ID_CLAIM]: TestEnvironment.userId
      }),
      expires_in: this.tokenExpiryTimer
    };
  }

  /**
   * Force the timer set for scheduled renewals to expire
   */
  clearTokenExpiryTimer(): void {
    tick(this.tokenExpiryTimer * 1000 - 30000);
  }

  /**
   * Discard periodic timers rather than tick which will keep restarting the timers
   * when the expiry token reaches zero and then attempts to renewTokens again
   */
  discardTokenExpiryTimer(): void {
    discardPeriodicTasks();
  }

  logOut(): void {
    this.service.logOut();
    this.setLoginRequiredResponse();
  }

  resetTokenExpireAt(): void {
    this.localSettings.set(EXPIRES_AT_SETTING, 0);
  }

  setLocalLoginData({ idToken, userId, roles, expiresAt }: LocalSettings = {}): void {
    this.localSettings.set(ID_TOKEN_SETTING, idToken ?? this.auth0Response!.token.id_token);
    this.localSettings.set(USER_ID_SETTING, userId ?? TestEnvironment.userId);
    this.localSettings.set(ROLES_SETTING, roles == null ? [SystemRole.SystemAdmin] : roles);
    this.localSettings.set(EXPIRES_AT_SETTING, expiresAt ?? (this.tokenExpiryTimer - 30) * 1000 + Date.now());
  }

  setLoginResponse(auth0Response?: AuthDetails | undefined): void {
    auth0Response ??= {
      token: this.validToken,
      idToken: { __raw: '1', sub: '7890', email: 'test@example.com' },
      loginResult: {
        appState: this._authLoginState
      }
    };
    this.auth0Response = auth0Response;
    when(mockedWebAuth.getTokenSilently()).thenResolve(this.auth0Response!.token.access_token);
    when(mockedWebAuth.getTokenSilently(anything())).thenResolve(this.auth0Response!.token);
    when(mockedWebAuth.getIdTokenClaims()).thenResolve(this.auth0Response!.idToken);
  }

  setLoginRequiredResponse(): void {
    const loginError = new GenericError('login_required', 'Not logged in');
    when(mockedWebAuth.getTokenSilently()).thenThrow(loginError);
    when(mockedWebAuth.getTokenSilently(anything())).thenThrow(loginError);
    when(mockedWebAuth.getIdTokenClaims()).thenThrow(loginError);
  }

  setMissingTokenResponse(): void {
    const tokenError = new GenericError('missing_refresh_token', 'Invalid token');
    when(mockedWebAuth.getTokenSilently()).thenThrow(tokenError);
    when(mockedWebAuth.getTokenSilently(anything())).thenThrow(tokenError);
    when(mockedWebAuth.getIdTokenClaims()).thenThrow(tokenError);
  }

  setOnline(isOnline: boolean = true): void {
    this.testOnlineStatusService.setIsOnline(isOnline);
  }

  setTimeoutResponse(): void {
    const timeoutError = new TimeoutError();
    when(mockedWebAuth.getTokenSilently()).thenThrow(timeoutError);
    when(mockedWebAuth.getTokenSilently(anything())).thenThrow(timeoutError);
    when(mockedWebAuth.getIdTokenClaims()).thenThrow(timeoutError);
    this.auth0Response = undefined;
  }

  triggerLocalSettingsEvent(event: StorageEvent): void {
    this._localeSettingsRemoveChanges.next(event);
  }
}
