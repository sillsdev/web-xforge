import { Injectable } from '@angular/core';
import { Auth0Client, Auth0ClientOptions } from '@auth0/auth0-spa-js';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

/**
 * Wrapper around WebAuth. This injectable service can be mocked to make dependencies of it testable.
 */
@Injectable({
  providedIn: 'root'
})
export class Auth0Service {
  constructor(private readonly http: HttpClient) {}

  init(options: Auth0ClientOptions): Auth0Client {
    return new Auth0Client(options);
  }

  changePassword(email: string): Promise<string> {
    const url = `https://${environment.authDomain}/dbconnections/change_password`;
    const body = { connection: 'Username-Password-Authentication', email };
    return this.http
      .post(url, body, { headers: { 'Content-Type': 'application/json' }, responseType: 'text' })
      .toPromise();
  }
}
