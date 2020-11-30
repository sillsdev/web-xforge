import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import Bugsnag from '@bugsnag/js';
import { translate } from '@ngneat/transloco';
import { Auth0DecodedHash, AuthorizeOptions, WebAuth } from 'auth0-js';
import jwtDecode from 'jwt-decode';
import { CookieService } from 'ngx-cookie-service';
import { SystemRole } from 'realtime-server/lib/common/models/system-role';
import { of, Subscription, timer } from 'rxjs';
import { filter, mergeMap } from 'rxjs/operators';
import { PwaService } from 'xforge-common/pwa.service';
import { environment } from '../environments/environment';
import { CommandService } from './command.service';
import { ErrorReportingService } from './error-reporting.service';
import { LocalSettingsService } from './local-settings.service';
import { LocationService } from './location.service';
import { NoticeService } from './notice.service';
import { OfflineStore } from './offline-store';
import { SharedbRealtimeRemoteStore } from './sharedb-realtime-remote-store';
import { USERS_URL } from './url-constants';
import { ASP_CULTURE_COOKIE_NAME, getAspCultureCookieLanguage, getI18nLocales } from './utils';

const XF_USER_ID_CLAIM = 'http://xforge.org/userid';
const XF_ROLE_CLAIM = 'http://xforge.org/role';

const ACCESS_TOKEN_SETTING = 'access_token';
const ID_TOKEN_SETTING = 'id_token';
const USER_ID_SETTING = 'user_id';
const ROLE_SETTING = 'role';
const EXPIRES_AT_SETTING = 'expires_at';

interface AuthState {
  returnUrl?: string;
  linking?: boolean;
}

interface LanguageOption {
  value: string;
  label?: string;
}

interface LoginResult {
  loggedIn: boolean;
  newlyLoggedIn: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private tryLogInPromise: Promise<LoginResult>;
  private refreshSubscription?: Subscription;

  private readonly auth0 = new WebAuth({
    clientID: environment.authClientId,
    domain: environment.authDomain,
    responseType: 'token id_token',
    redirectUri: this.locationService.origin + '/projects',
    scope: 'openid profile email ' + environment.scope,
    audience: environment.audience
  });

  private parsedHashPromise = new Promise<Auth0DecodedHash | null>((resolve, reject) =>
    this.auth0.parseHash((err, authResult) => (err != null ? reject(err) : resolve(authResult)))
  );

  constructor(
    private readonly remoteStore: SharedbRealtimeRemoteStore,
    private readonly offlineStore: OfflineStore,
    private readonly locationService: LocationService,
    private readonly commandService: CommandService,
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

  get accessToken(): string | undefined {
    return this.localSettings.get(ACCESS_TOKEN_SETTING);
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

  private get isAuthenticated(): boolean {
    return this.expiresAt != null && Date.now() < this.expiresAt;
  }

  changePassword(email: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.auth0.changePassword({ connection: 'Username-Password-Authentication', email }, (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result);
        }
      });
    });
  }

  async checkOnlineAuth(): Promise<void> {
    // Only need to check if the app has logged in via an offline state
    if (await this.isLoggedIn) {
      this.tryOnlineLogIn().then(result => {
        if (!result.loggedIn) {
          this.logIn(this.locationService.pathname + this.locationService.search);
        }
      });
    }
  }

  logIn(returnUrl: string, signUp?: boolean): void {
    const state: AuthState = { returnUrl };
    const tag = getAspCultureCookieLanguage(this.cookieService.get(ASP_CULTURE_COOKIE_NAME));
    const i18nLocales = getI18nLocales();
    const locales = environment.production ? i18nLocales.filter(locale => locale.production) : i18nLocales;
    const options: LanguageOption[] = locales.map(locale => {
      const result = { value: locale.canonicalTag, label: locale.localName };
      if (!environment.production && !locale.production) {
        result.label += ' *';
      }
      return result;
    });
    const authOptions: AuthorizeOptions = { state: JSON.stringify(state), language: JSON.stringify({ tag, options }) };
    if (signUp) {
      authOptions.login_hint = 'signUp';
    }
    this.auth0.authorize(authOptions);
  }

  linkParatext(returnUrl: string): void {
    const state: AuthState = { returnUrl, linking: true };
    const options: AuthorizeOptions = { connection: 'paratext', state: JSON.stringify(state) };
    this.auth0.authorize(options);
  }

  async logOut(): Promise<void> {
    await this.offlineStore.deleteDB();
    this.localSettings.clear();
    this.auth0.logout({ returnTo: this.locationService.origin + '/' });
  }

  async updateInterfaceLanguage(language: string): Promise<void> {
    if (await this.isLoggedIn) {
      await this.commandService.onlineInvoke(USERS_URL, 'updateInterfaceLanguage', { language });
    }
  }

  private async tryLogIn(): Promise<LoginResult> {
    try {
      // If we have no valid auth0 data then we have to validate online first
      if (this.accessToken == null || this.idToken == null || this.expiresAt == null) {
        return await this.tryOnlineLogIn();
      }
      // In offline mode check against the last known access
      if (!(await this.handleOfflineAuth())) {
        return { loggedIn: false, newlyLoggedIn: false };
      }
      return { loggedIn: true, newlyLoggedIn: false };
    } catch (error) {
      await this.handleLoginError('tryLogIn', error);
      return { loggedIn: false, newlyLoggedIn: false };
    }
  }

  private async tryOnlineLogIn(): Promise<LoginResult> {
    try {
      if (await this.pwaService.checkOnline()) {
        // In online mode do the normal checks with auth0
        let authResult = await this.parsedHashPromise;
        if (!(await this.handleOnlineAuth(authResult))) {
          authResult = await this.checkSession();
          if (!(await this.handleOnlineAuth(authResult))) {
            this.clearState();
            return { loggedIn: false, newlyLoggedIn: false };
          }
        } else {
          // TODO newlyLoggedIn is incorrect the second time this is called, because a user cannot be "newly" logged in
          // multiple times in a single session. The value is ignored though after the first time it's called.
          return { loggedIn: true, newlyLoggedIn: true };
        }
      }
      return { loggedIn: true, newlyLoggedIn: false };
    } catch (error) {
      await this.handleLoginError('tryOnlineLogIn', error);
      return { loggedIn: false, newlyLoggedIn: false };
    }
  }

  private async handleOnlineAuth(authResult: auth0.Auth0DecodedHash | null): Promise<boolean> {
    if (
      authResult == null ||
      authResult.accessToken == null ||
      authResult.idToken == null ||
      authResult.expiresIn == null
    ) {
      return false;
    }

    let secondaryId: string | undefined;
    const state: AuthState = authResult.state == null ? {} : JSON.parse(authResult.state);
    if (state.linking != null && state.linking) {
      secondaryId = authResult.idTokenPayload.sub;
      if (!this.isAuthenticated) {
        await this.renewTokens();
      }
    } else {
      await this.localLogIn(authResult.accessToken, authResult.idToken, authResult.expiresIn);
    }
    this.scheduleRenewal();
    await this.remoteStore.init(() => this.accessToken);
    if (secondaryId != null) {
      await this.commandService.onlineInvoke(USERS_URL, 'linkParatextAccount', { authId: secondaryId });
    } else if (!environment.production) {
      try {
        await this.commandService.onlineInvoke(USERS_URL, 'pullAuthUserProfile');
      } catch (err) {
        console.error(err);
        return false;
      }
    }
    if (state.returnUrl != null) {
      this.router.navigateByUrl(state.returnUrl, { replaceUrl: true });
    } else if (this.locationService.hash !== '') {
      this.router.navigateByUrl(this.locationService.pathname, { replaceUrl: true });
    }
    return true;
  }

  private async handleOfflineAuth(): Promise<boolean> {
    this.scheduleRenewal();
    await this.remoteStore.init(() => this.accessToken);
    return true;
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
      this.scheduleRenewal();
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
    let success = false;
    try {
      const authResult = await this.checkSession();
      if (
        authResult != null &&
        authResult.accessToken != null &&
        authResult.idToken != null &&
        authResult.expiresIn != null
      ) {
        await this.localLogIn(authResult.accessToken, authResult.idToken, authResult.expiresIn);
        success = true;
      }
    } catch (err) {
      console.error('Error while renewing access token:', err);
      success = false;
    }
    if (!success) {
      await this.logOut();
    }
  }

  private checkSession(retryUponTimeout: boolean = true): Promise<auth0.Auth0DecodedHash | null> {
    return new Promise<auth0.Auth0DecodedHash | null>((resolve, reject) => {
      this.auth0.checkSession({ state: JSON.stringify({}) }, (err, authResult) => {
        if (err != null) {
          if (err.code === 'login_required') {
            resolve(null);
          } else if (retryUponTimeout && err.code === 'timeout') {
            this.checkSession(false).then(resolve).catch(reject);
          } else {
            reject(err);
          }
        } else {
          resolve(authResult);
        }
      });
    });
  }

  private async localLogIn(accessToken: string, idToken: string, expiresIn: number): Promise<void> {
    const claims: any = jwtDecode(accessToken);
    const prevUserId = this.currentUserId;
    const userId = claims[XF_USER_ID_CLAIM];
    if (prevUserId != null && prevUserId !== userId) {
      await this.offlineStore.deleteDB();
      this.localSettings.clear();
    }

    const expiresAt = expiresIn * 1000 + Date.now();
    this.localSettings.set(ACCESS_TOKEN_SETTING, accessToken);
    this.localSettings.set(ID_TOKEN_SETTING, idToken);
    this.localSettings.set(EXPIRES_AT_SETTING, expiresAt);
    this.localSettings.set(USER_ID_SETTING, userId);
    this.localSettings.set(ROLE_SETTING, claims[XF_ROLE_CLAIM]);
    Bugsnag.leaveBreadcrumb(
      'Local Login',
      {
        userId: userId,
        ...(userId !== prevUserId && { prevUserId }),
        params: claims[XF_ROLE_CLAIM]
      },
      'log'
    );
    Bugsnag.setUser(this.currentUserId);
  }

  private clearState(): void {
    this.localSettings.remove(ACCESS_TOKEN_SETTING);
    this.localSettings.remove(ID_TOKEN_SETTING);
    this.localSettings.remove(EXPIRES_AT_SETTING);
    this.localSettings.remove(USER_ID_SETTING);
    this.localSettings.remove(ROLE_SETTING);
  }
}
