import { Injectable } from '@angular/core';
import { AuthOptions, WebAuth } from 'auth0-js';

/**
 * Wrapper around WebAuth. This injectable service can be mocked to make dependencies of it testable.
 */
@Injectable({
  providedIn: 'root'
})
export class Auth0Service {
  init(options: AuthOptions): WebAuth {
    return new WebAuth(options);
  }
}
