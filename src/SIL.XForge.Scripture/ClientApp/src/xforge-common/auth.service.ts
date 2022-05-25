import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { translate } from '@ngneat/transloco';
import {
  GetTokenSilentlyVerboseResponse,
  IdToken,
  LogoutOptions,
  RedirectLoginOptions,
  RedirectLoginResult
} from '@auth0/auth0-spa-js';
import jwtDecode from 'jwt-decode';
import { clone } from 'lodash-es';
import { CookieService } from 'ngx-cookie-service';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { of, Subscription, timer } from 'rxjs';
import { filter, mergeMap } from 'rxjs/operators';
import { PwaService } from 'xforge-common/pwa.service';
import { environment } from '../environments/environment';
import { Auth0Service } from './auth0.service';
import { BugsnagService } from './bugsnag.service';
import { CommandError, CommandService } from './command.service';
import { ErrorReportingService } from './error-reporting.service';
import { LocalSettingsService } from './local-settings.service';
import { LocationService } from './location.service';
import { NoticeService } from './notice.service';
import { OfflineStore } from './offline-store';
import { SharedbRealtimeRemoteStore } from './sharedb-realtime-remote-store';
import { USERS_URL } from './url-constants';
import { ASP_CULTURE_COOKIE_NAME, getAspCultureCookieLanguage } from './utils';

export const XF_USER_ID_CLAIM = 'http://xforge.org/userid';
export const XF_ROLE_CLAIM = 'http://xforge.org/role';

export const ID_TOKEN_SETTING = 'id_token';
export const USER_ID_SETTING = 'user_id';
export const ROLE_SETTING = 'role';
export const EXPIRES_AT_SETTING = 'expires_at';

export interface AuthState {
  returnUrl?: string;
  linking?: boolean;
}

export interface AuthDetails {
  idToken: IdToken | undefined;
  loginResult: RedirectLoginResult;
  token: GetTokenSilentlyVerboseResponse;
}

interface LoginResult {
  loggedIn: boolean;
  newlyLoggedIn: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  readonly ptLinkedToAnotherUserKey: string = 'paratext-linked-to-another-user';
  private tryLogInPromise: Promise<LoginResult>;
  private refreshSubscription?: Subscription;
  private renewTokenPromise?: Promise<void>;
  private checkSessionPromise?: Promise<GetTokenSilentlyVerboseResponse | null>;
  private readonly auth0 = this.auth0Service.init({
    client_id: environment.authClientId,
    domain: environment.authDomain,
    redirect_uri: this.locationService.origin + '/callback/auth0',
    scope: 'openid profile email ' + environment.scope,
    audience: environment.audience,
    cacheLocation: 'localstorage',
    useRefreshTokens: true
  });

  constructor(
    private readonly auth0Service: Auth0Service,
    private readonly remoteStore: SharedbRealtimeRemoteStore,
    private readonly offlineStore: OfflineStore,
    private readonly locationService: LocationService,
    private readonly commandService: CommandService,
    private readonly bugsnagService: BugsnagService,
    private readonly cookieService: CookieService,
    private readonly router: Router,
    private readonly localSettings: LocalSettingsService,
    private readonly pwaService: PwaService,
    private readonly noticeService: NoticeService,
    private readonly reportingService: ErrorReportingService
  ) {
    // Listen for changes to the auth state. If the user logs out in another tab/window, redirect to the home page.
    // When localStorage is cleared event.key is null. The logic below may be more specific than necessary, but we can't
    // assume very much about the browser's implementation and under what conditions the event will fire.
    // Safari 13.1 (but not 12.1 or most other browsers) fires the event even when the change occurred in this tab.
    // This issue has been reported in Webkit's bug tracker: https://bugs.webkit.org/show_bug.cgi?id=210512
    this.localSettings.remoteChanges$
      .pipe(
        filter(
          event =>
            event.key === null ||
            (event.key === USER_ID_SETTING && event.oldValue != null && event.oldValue !== event.newValue)
        )
      )
      .subscribe(() => this.locationService.go('/'));

    this.tryLogInPromise = this.tryLogIn();
  }

  get currentUserId(): string | undefined {
    return this.localSettings.get(USER_ID_SETTING);
  }

  get currentUserRole(): SystemRole | undefined {
    return this.localSettings.get(ROLE_SETTING);
  }

  get idToken(): string | undefined {
    return this.localSettings.get(ID_TOKEN_SETTING);
  }

  get expiresAt(): number | undefined {
    return this.localSettings.get(EXPIRES_AT_SETTING);
  }

  get isLoggedIn(): Promise<boolean> {
    return this.tryLogInPromise.then(result => result.loggedIn);
  }

  get isNewlyLoggedIn(): Promise<boolean> {
    return this.tryLogInPromise.then(result => result.newlyLoggedIn);
  }

  changePassword(email: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.auth0Service
        .changePassword(email)
        .then(result => {
          resolve(result);
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  /**
   * Triggered when app first loads and when returning from offline mode
   * Ensure renewal timer is initiated so tokens can be refreshed when expired
   */
  async checkOnlineAuth(): Promise<void> {
    if ((await this.isLoggedIn) && this.pwaService.isOnline) {
      this.scheduleRenewal();
    }
  }

  async expireToken(): Promise<void> {
    this.localSettings.set(EXPIRES_AT_SETTING, 0);
  }

  async getAccessToken(): Promise<string | undefined> {
    try {
      return await this.auth0!.getTokenSilently();
    } catch {
      return undefined;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    if ((await this.hasExpired()) && this.pwaService.isOnline) {
      await this.renewTokens();
      // If still expired then the user is logging in and we need to degrade nicely while that happens
      if (await this.hasExpired()) {
        return false;
      }
    }
    return true;
  }

  async logIn(returnUrl: string, signUp?: boolean, locale?: string): Promise<void> {
    const state: AuthState = { returnUrl };
    const language: string = getAspCultureCookieLanguage(this.cookieService.get(ASP_CULTURE_COOKIE_NAME));
    const ui_locales: string = language;
    const authOptions: RedirectLoginOptions = {
      appState: JSON.stringify(state),
      language,
      login_hint: ui_locales
    };
    if (signUp) {
      authOptions.mode = 'signUp';
      authOptions.login_hint = locale ?? ui_locales;
    }
    this.unscheduleRenewal();
    await this.auth0!.loginWithRedirect(authOptions);
  }

  async linkParatext(returnUrl: string): Promise<void> {
    const state: AuthState = { returnUrl, linking: true };
    const language: string = getAspCultureCookieLanguage(this.cookieService.get(ASP_CULTURE_COOKIE_NAME));
    const options: RedirectLoginOptions = {
      connection: 'paratext',
      appState: JSON.stringify(state),
      language,
      login_hint: language
    };
    await this.auth0!.loginWithRedirect(options);
  }

  async logOut(): Promise<void> {
    await this.offlineStore.deleteDB();
    this.localSettings.clear();
    this.unscheduleRenewal();
    this.auth0!.logout({ returnTo: this.locationService.origin + '/' } as LogoutOptions);
  }

  async updateInterfaceLanguage(language: string): Promise<void> {
    if (await this.isLoggedIn) {
      await this.commandService.onlineInvoke(USERS_URL, 'updateInterfaceLanguage', { language });
    }
  }

  private async getTokenDetails(): Promise<GetTokenSilentlyVerboseResponse> {
    return await this.auth0!.getTokenSilently({ detailedResponse: true });
  }

  private async hasExpired(): Promise<boolean> {
    if (this.renewTokenPromise != null) {
      await this.renewTokenPromise;
    }
    return this.expiresAt == null || Date.now() > this.expiresAt;
  }

  private async tryLogIn(): Promise<LoginResult> {
    try {
      const accessToken = await this.getAccessToken();
      // If we have no valid auth0 data then we have to validate online first
      if (
        accessToken == null ||
        this.idToken == null ||
        this.expiresAt == null ||
        (this.pwaService.isOnline && (await this.hasExpired()))
      ) {
        return await this.tryOnlineLogIn();
      }
      await this.remoteStore.init(() => accessToken);
      return { loggedIn: true, newlyLoggedIn: false };
    } catch (error) {
      await this.handleLoginError('tryLogIn', error);
      return { loggedIn: false, newlyLoggedIn: false };
    }
  }

  private async tryOnlineLogIn(): Promise<LoginResult> {
    try {
      if (await this.pwaService.checkOnline()) {
        // Check if this is a valid callback from auth0
        if (!this.isCallbackUrl(this.locationService.href)) {
          // Check session with auth0 as it may be able to renew silently
          const token = await this.checkSession();
          if (token == null) {
            this.clearState();
            return { loggedIn: false, newlyLoggedIn: false };
          }
          await this.localLogIn(token.access_token, token.id_token, token.expires_in);
          await this.remoteStore.init(() => token.access_token);
          return { loggedIn: true, newlyLoggedIn: false };
        }
        // Handle the callback response from auth0
        const loginResult: RedirectLoginResult = await this.auth0!.handleRedirectCallback();
        const token = await this.checkSession();
        if (token == null) {
          this.clearState();
          return { loggedIn: false, newlyLoggedIn: false };
        }
        const authDetails: AuthDetails = {
          loginResult,
          token,
          idToken: await this.auth0!.getIdTokenClaims()
        };
        if (!(await this.handleOnlineAuth(authDetails))) {
          this.clearState();
          return { loggedIn: false, newlyLoggedIn: false };
        } else {
          return { loggedIn: true, newlyLoggedIn: true };
        }
      }
      return { loggedIn: true, newlyLoggedIn: false };
    } catch (error) {
      await this.handleLoginError('tryOnlineLogIn', error);
      return { loggedIn: false, newlyLoggedIn: false };
    }
  }

  private async handleOnlineAuth(authDetails: AuthDetails): Promise<boolean> {
    if (
      authDetails == null ||
      authDetails.token.access_token == null ||
      authDetails.token.id_token == null ||
      authDetails.token.expires_in == null ||
      authDetails.loginResult.appState == null
    ) {
      return false;
    }

    let secondaryId: string | undefined;
    const state: AuthState = JSON.parse(authDetails.loginResult.appState);
    if (state.linking != null && state.linking) {
      if (!(await this.isAuthenticated()) || authDetails.idToken == null) {
        return false;
      }
      secondaryId = authDetails.idToken.sub;
    } else {
      await this.localLogIn(authDetails.token.access_token, authDetails.token.id_token, authDetails.token.expires_in);
    }
    await this.remoteStore.init(() => authDetails.token.access_token);
    if (secondaryId != null) {
      try {
        await this.commandService.onlineInvoke(USERS_URL, 'linkParatextAccount', { authId: secondaryId });
      } catch (err) {
        if (!(err instanceof CommandError) || !err.message.includes(this.ptLinkedToAnotherUserKey)) {
          console.error(err);
          return false;
        }
        this.noticeService
          .showMessageDialog(
            () =>
              translate('connect_project.paratext_account_linked_to_another_user', {
                email: authDetails.idToken?.email
              }),
            () => translate('connect_project.proceed')
          )
          .then(async () => {
            const withoutState = clone(authDetails);
            if (withoutState != null) {
              withoutState.loginResult.appState = undefined;
            }
            await this.handleOnlineAuth(withoutState);
            // Reload the app for the new current user id to take effect
            this.locationService.reload();
          });
      }
    } else if (!environment.production) {
      try {
        await this.commandService.onlineInvoke(USERS_URL, 'pullAuthUserProfile');
      } catch (err) {
        console.error(err);
        return false;
      }
    }
    // Ensure the return URL is one we want to return the user to
    if (this.isValidReturnUrl(state.returnUrl)) {
      this.router.navigateByUrl(state.returnUrl!, { replaceUrl: true });
    } else {
      this.router.navigateByUrl('/projects', { replaceUrl: true });
    }
    return true;
  }

  private isValidReturnUrl(returnUrl: string | undefined): boolean {
    return !(returnUrl == null || this.isCallbackUrl(returnUrl) || returnUrl === '/login');
  }

  private isCallbackUrl(callbackUrl: string | undefined): boolean {
    if (callbackUrl == null) {
      callbackUrl = this.locationService.href;
    }
    if (!callbackUrl.includes('://')) {
      callbackUrl = this.locationService.origin + callbackUrl;
    }
    const url = new URL(callbackUrl);
    return url.origin + url.pathname === this.locationService.origin + '/callback/auth0';
  }

  private scheduleRenewal(): void {
    this.unscheduleRenewal();

    const expiresAt = this.expiresAt!;
    const expiresIn$ = of(expiresAt).pipe(
      mergeMap(expAt => {
        const now = Date.now();
        return timer(Math.max(1, expAt - now));
      }),
      filter(() => this.pwaService.isOnline)
    );

    this.refreshSubscription = expiresIn$.subscribe(async () => {
      await this.renewTokens();
    });
  }

  private async handleLoginError(method: string, error: object): Promise<void> {
    console.error(error);
    this.reportingService.silentError(`Error occurred in ${method}`, error);
    await this.noticeService.showMessageDialog(
      () => translate('error_messages.error_occurred_login'),
      () => translate('error_messages.try_again')
    );
  }

  private unscheduleRenewal(): void {
    if (this.refreshSubscription != null) {
      this.refreshSubscription.unsubscribe();
    }
  }

  private async renewTokens(): Promise<void> {
    if (this.renewTokenPromise == null) {
      this.renewTokenPromise = new Promise<void>(async (resolve, reject) => {
        let success = false;
        try {
          const authResult = await this.checkSession();
          if (
            authResult != null &&
            authResult.access_token != null &&
            authResult.id_token != null &&
            authResult.expires_in != null
          ) {
            await this.localLogIn(authResult.access_token, authResult.id_token, authResult.expires_in);
            success = true;
            resolve();
          }
        } catch (err) {
          console.error('Error while renewing access token:', err);
          this.reportingService.silentError('Error while renewing access token', err);
          success = false;
        }
        if (!success) {
          reject();
        }
      })
        .catch(() => {
          this.logIn(this.locationService.pathname + this.locationService.search);
        })
        .then(() => {
          this.renewTokenPromise = undefined;
        });
    }
    return this.renewTokenPromise;
  }

  private async checkSession(retryUponTimeout: boolean = true): Promise<GetTokenSilentlyVerboseResponse | null> {
    if (this.checkSessionPromise == null) {
      this.checkSessionPromise = new Promise<GetTokenSilentlyVerboseResponse | null>(async (resolve, reject) => {
        try {
          const tokenResponse = await this.getTokenDetails();
          resolve(tokenResponse);
        } catch (err) {
          if (err.error === 'login_required') {
            resolve(null);
          } else if (retryUponTimeout && err.error === 'timeout') {
            this.checkSessionPromise = undefined;
            this.checkSession(false).then(resolve).catch(reject);
          } else {
            reject(err);
          }
        }
      }).finally(() => {
        this.checkSessionPromise = undefined;
      });
    }
    return this.checkSessionPromise;
  }

  private async localLogIn(accessToken: string, idToken: string, expiresIn: number): Promise<void> {
    const claims: any = jwtDecode(accessToken);
    const prevUserId = this.currentUserId;
    const userId = claims[XF_USER_ID_CLAIM];
    if (prevUserId != null && prevUserId !== userId) {
      await this.offlineStore.deleteDB();
      this.localSettings.clear();
    }

    // Expiry 30 seconds sooner than the actual expiry date to avoid any inflight expiry issues
    const expiresAt = (expiresIn - 30) * 1000 + Date.now();
    this.localSettings.set(ID_TOKEN_SETTING, idToken);
    this.localSettings.set(EXPIRES_AT_SETTING, expiresAt);
    this.localSettings.set(USER_ID_SETTING, userId);
    this.localSettings.set(ROLE_SETTING, claims[XF_ROLE_CLAIM]);
    this.scheduleRenewal();
    this.bugsnagService.leaveBreadcrumb(
      'Local Login',
      {
        userId: userId,
        ...(userId !== prevUserId && { prevUserId }),
        params: claims[XF_ROLE_CLAIM]
      },
      'log'
    );
    this.bugsnagService.setUser(this.currentUserId);
  }

  private clearState(): void {
    this.localSettings.remove(ID_TOKEN_SETTING);
    this.localSettings.remove(EXPIRES_AT_SETTING);
    this.localSettings.remove(USER_ID_SETTING);
    this.localSettings.remove(ROLE_SETTING);
  }
}
