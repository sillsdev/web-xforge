import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { AuthorizeOptions, WebAuth } from 'auth0-js';
import jwtDecode from 'jwt-decode';
import { SystemRole } from 'realtime-server/lib/common/models/system-role';
import { of, Subscription, timer } from 'rxjs';
import { filter, mergeMap } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { CommandService } from './command.service';
import { LocalSettingsService } from './local-settings.service';
import { LocationService } from './location.service';
import { RealtimeOfflineStore } from './realtime-offline-store';
import { SharedbRealtimeRemoteStore } from './sharedb-realtime-remote-store';
import { USERS_URL } from './url-constants';

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

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private tryLogInPromise: Promise<boolean>;
  private refreshSubscription?: Subscription;

  private readonly auth0 = new WebAuth({
    clientID: environment.authClientId,
    domain: environment.authDomain,
    responseType: 'token id_token',
    redirectUri: this.locationService.origin + '/projects',
    scope: 'openid profile email ' + environment.scope,
    audience: environment.audience
  });

  constructor(
    private readonly remoteStore: SharedbRealtimeRemoteStore,
    private readonly offlineStore: RealtimeOfflineStore,
    private readonly locationService: LocationService,
    private readonly commandService: CommandService,
    private readonly router: Router,
    private readonly localSettings: LocalSettingsService
  ) {
    // listen for changes to the auth state
    // this indicates that a user has logged in/out on a different tab/window
    this.localSettings.remoteChanges$
      .pipe(filter(event => event.key === USER_ID_SETTING))
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

  get expiresAt(): number | undefined {
    return this.localSettings.get(EXPIRES_AT_SETTING);
  }

  get isLoggedIn(): Promise<boolean> {
    return this.tryLogInPromise;
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

  logIn(returnUrl: string): void {
    const state: AuthState = { returnUrl };
    const options: AuthorizeOptions = { state: JSON.stringify(state) };
    this.auth0.authorize(options);
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

  private async tryLogIn(): Promise<boolean> {
    try {
      let authResult = await this.parseHash();
      if (!(await this.handleAuth(authResult))) {
        this.clearState();
        authResult = await this.checkSession();
        if (!(await this.handleAuth(authResult))) {
          return false;
        }
      }
    } catch (err) {
      return false;
    }
    return true;
  }

  private async handleAuth(authResult: auth0.Auth0DecodedHash | null): Promise<boolean> {
    if (authResult == null || authResult.accessToken == null || authResult.idToken == null) {
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
      await this.localLogIn(authResult);
    }
    this.scheduleRenewal();
    this.remoteStore.init(() => this.accessToken);
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
      this.router.navigateByUrl(state.returnUrl);
    } else if (this.locationService.hash !== '') {
      this.router.navigateByUrl(this.locationService.pathname);
    }
    return true;
  }

  private scheduleRenewal(): void {
    if (!this.isAuthenticated) {
      return;
    }
    this.unscheduleRenwewal();

    const expiresAt = this.expiresAt!;
    const expiresIn$ = of(expiresAt).pipe(
      mergeMap(expAt => {
        const now = Date.now();
        return timer(Math.max(1, expAt - now));
      })
    );

    this.refreshSubscription = expiresIn$.subscribe(async () => {
      await this.renewTokens();
      this.scheduleRenewal();
    });
  }

  private unscheduleRenwewal(): void {
    if (this.refreshSubscription != null) {
      this.refreshSubscription.unsubscribe();
    }
  }

  private async renewTokens(): Promise<void> {
    try {
      const authResult = await this.checkSession();
      if (authResult != null && authResult.accessToken != null && authResult.idToken != null) {
        await this.localLogIn(authResult);
      }
    } catch (err) {
      await this.logOut();
    }
  }

  private parseHash(): Promise<auth0.Auth0DecodedHash | null> {
    return new Promise<auth0.Auth0DecodedHash | null>((resolve, reject) => {
      this.auth0.parseHash((err, authResult) => {
        if (err != null) {
          reject(err);
        } else {
          resolve(authResult);
        }
      });
    });
  }

  private checkSession(): Promise<auth0.Auth0DecodedHash> {
    return new Promise<auth0.Auth0DecodedHash>((resolve, reject) => {
      this.auth0.checkSession({ state: JSON.stringify({}) }, (err, authResult) => {
        if (err != null) {
          reject(err);
        } else {
          resolve(authResult);
        }
      });
    });
  }

  private async localLogIn(authResult: auth0.Auth0DecodedHash): Promise<void> {
    if (authResult.accessToken == null || authResult.expiresIn == null) {
      throw new Error('The auth result is invalid.');
    }
    const claims: any = jwtDecode(authResult.accessToken);
    const prevUserId = this.currentUserId;
    const userId = claims[XF_USER_ID_CLAIM];
    if (prevUserId != null && prevUserId !== userId) {
      await this.offlineStore.deleteDB();
      this.localSettings.clear();
    }

    const expiresAt = authResult.expiresIn * 1000 + Date.now();
    this.localSettings.set(ACCESS_TOKEN_SETTING, authResult.accessToken);
    this.localSettings.set(ID_TOKEN_SETTING, authResult.idToken);
    this.localSettings.set(EXPIRES_AT_SETTING, expiresAt);
    this.localSettings.set(USER_ID_SETTING, userId);
    this.localSettings.set(ROLE_SETTING, claims[XF_ROLE_CLAIM]);
  }

  private clearState(): void {
    this.localSettings.remove(ACCESS_TOKEN_SETTING);
    this.localSettings.remove(ID_TOKEN_SETTING);
    this.localSettings.remove(EXPIRES_AT_SETTING);
    this.localSettings.remove(USER_ID_SETTING);
    this.localSettings.remove(ROLE_SETTING);
  }
}
