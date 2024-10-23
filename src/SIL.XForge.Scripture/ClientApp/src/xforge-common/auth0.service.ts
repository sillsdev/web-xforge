import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Auth0Client, Auth0ClientOptions, GetTokenSilentlyVerboseResponse } from '@auth0/auth0-spa-js';
import { CookieService } from 'ngx-cookie-service';
import { lastValueFrom } from 'rxjs';
import { AUTH0_SCOPE } from 'xforge-common/auth.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { environment } from '../environments/environment';

interface ResourceOwnerTokenEndpoint {
  audience: string;
  client_id: string;
  client_secret?: string;
  grant_type?: string;
  password: string;
  realm?: string;
  scope: string;
  username: string;
}

export const TransparentAuthenticationCookie = 'sf.transparent.authentication';
export interface TransparentAuthenticationCookieCredentials {
  Username: string;
  Password: string;
}

/**
 * Wrapper around WebAuth. This injectable service can be mocked to make dependencies of it testable.
 */
@Injectable({
  providedIn: 'root'
})
export class Auth0Service {
  constructor(
    private readonly http: HttpClient,
    private readonly cookieService: CookieService,
    private readonly reportingService: ErrorReportingService
  ) {}

  init(options: Auth0ClientOptions): Auth0Client {
    return new Auth0Client(options);
  }

  changePassword(email: string): Promise<string> {
    const body = { client_id: environment.authClientId, connection: 'Username-Password-Authentication', email };
    return this.post('dbconnections/change_password', body);
  }

  /**
   * Use resource owner password flow to log in with credentials set in a cookie
   * This is only relevant for sharing share keys for users who don't need to log in using traditional methods
   */
  async tryTransparentAuthentication(): Promise<undefined | GetTokenSilentlyVerboseResponse> {
    if (!this.cookieService.check(TransparentAuthenticationCookie)) {
      return undefined;
    }
    const credentials: TransparentAuthenticationCookieCredentials = JSON.parse(
      this.cookieService.get(TransparentAuthenticationCookie)
    );
    const body: ResourceOwnerTokenEndpoint = {
      client_id: environment.authClientId,
      scope: AUTH0_SCOPE,
      audience: environment.audience,
      grant_type: 'http://auth0.com/oauth/grant-type/password-realm',
      realm: 'Transparent-Authentication',
      username: credentials.Username,
      password: credentials.Password
    };
    try {
      const response = await this.post('oauth/token', body);
      return JSON.parse(response.toString());
    } catch (e) {
      // Silently report this as it is of no value to the user if it fails
      this.reportingService.silentError('Transparent Authentication Failed', {
        Username: credentials.Username,
        error: ErrorReportingService.normalizeError(e)
      });
      return undefined;
    }
  }

  private post(endPoint: string, body?: any): Promise<string> {
    const url: string = `https://${environment.authDomain}/${endPoint}`;
    return lastValueFrom(
      this.http.post(url, body, { headers: { 'Content-Type': 'application/json' }, responseType: 'text' })
    );
  }
}
