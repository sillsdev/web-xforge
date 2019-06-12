import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { RecordIdentity } from '@orbit/data';
import { AuthorizeOptions, WebAuth } from 'auth0-js';
import jwtDecode from 'jwt-decode';
import { of, Subscription, timer } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { JsonApiService } from './json-api.service';
import { LocationService } from './location.service';
import { SystemRole } from './models/system-role';
import { User } from './models/user';
import { OrbitService } from './orbit-service';
import { RealtimeService } from './realtime.service';

const XF_USER_ID_CLAIM = 'http://xforge.org/userid';
const XF_ROLE_CLAIM = 'http://xforge.org/role';

interface AuthState {
  returnUrl?: string;
  linking?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private tryLogInPromise: Promise<boolean>;
  private refreshSubscription: Subscription;

  private readonly auth0 = new WebAuth({
    clientID: environment.authClientId,
    domain: environment.authDomain,
    responseType: 'token id_token',
    redirectUri: this.locationService.origin + '/projects',
    scope: 'openid profile email ' + environment.scope,
    audience: environment.audience
  });

  constructor(
    private readonly orbitService: OrbitService,
    private readonly realtimeService: RealtimeService,
    private readonly locationService: LocationService,
    private readonly jsonApiService: JsonApiService,
    private readonly router: Router
  ) {}

  get currentUserId(): string {
    return localStorage.getItem('user_id');
  }

  get currentUserRole(): SystemRole {
    return localStorage.getItem('role') as SystemRole;
  }

  get accessToken(): string {
    return localStorage.getItem('access_token');
  }

  get expiresAt(): number {
    return Number(localStorage.getItem('expires_at'));
  }

  get isLoggedIn(): Promise<boolean> {
    return this.tryLogInPromise;
  }

  private get isAuthenticated(): boolean {
    return this.accessToken != null && Date.now() < this.expiresAt;
  }

  init(): void {
    this.tryLogInPromise = this.tryLogIn();
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

  logOut(): void {
    this.clearState();
    this.auth0.logout({ returnTo: this.locationService.origin + '/' });
  }

  private async tryLogIn(): Promise<boolean> {
    let authResult = await this.parseHash();
    if (!(await this.handleAuth(authResult))) {
      this.clearState();
      try {
        authResult = await this.checkSession();
        if (!(await this.handleAuth(authResult))) {
          return false;
        }
      } catch (err) {
        return false;
      }
    }
    return true;
  }

  private async handleAuth(authResult: auth0.Auth0DecodedHash): Promise<boolean> {
    if (authResult == null || authResult.accessToken == null || authResult.idToken == null) {
      return false;
    }

    const state: AuthState = JSON.parse(authResult.state);
    let secondaryId: string;
    if (state.linking != null && state.linking) {
      secondaryId = authResult.idTokenPayload.sub;
      if (!this.isAuthenticated) {
        await this.renewTokens();
      }
    } else {
      this.localLogIn(authResult);
    }
    this.scheduleRenewal();
    await this.orbitService.init(this.accessToken);
    await this.realtimeService.init(this.accessToken);
    const userIdentity: RecordIdentity = { type: User.TYPE, id: this.currentUserId };
    if (secondaryId != null) {
      await this.jsonApiService.onlineInvoke(userIdentity, 'linkParatextAccount', { authId: secondaryId });
    } else if (!environment.production) {
      try {
        await this.jsonApiService.onlineInvoke(userIdentity, 'pullAuthUserProfile');
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

    const expiresAt = this.expiresAt;
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
        this.localLogIn(authResult);
        this.orbitService.setAccessToken(this.accessToken);
        this.realtimeService.setAccessToken(this.accessToken);
      }
    } catch (err) {
      this.logOut();
    }
  }

  private parseHash(): Promise<auth0.Auth0DecodedHash> {
    return new Promise<auth0.Auth0DecodedHash>((resolve, reject) => {
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

  private localLogIn(authResult: auth0.Auth0DecodedHash): void {
    const expiresAt = authResult.expiresIn * 1000 + Date.now();
    localStorage.setItem('access_token', authResult.accessToken);
    localStorage.setItem('id_token', authResult.idToken);
    localStorage.setItem('expires_at', expiresAt.toString());
    const claims = jwtDecode(authResult.accessToken);
    localStorage.setItem('user_id', claims[XF_USER_ID_CLAIM]);
    localStorage.setItem('role', claims[XF_ROLE_CLAIM]);
  }

  private clearState(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('id_token');
    localStorage.removeItem('expires_at');
    localStorage.removeItem('user_id');
    localStorage.removeItem('role');
  }
}
