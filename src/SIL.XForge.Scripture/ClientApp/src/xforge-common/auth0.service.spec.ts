import { anything, capture, deepEqual, mock, resetCalls, verify, when } from 'ts-mockito';
import { HttpClient } from '@angular/common/http';
import { configureTestingModule } from 'xforge-common/test-utils';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Auth0Service, TransparentAuthenticationCookie } from 'xforge-common/auth0.service';
import { Auth0ClientOptions, GenericError, GetTokenSilentlyVerboseResponse } from '@auth0/auth0-spa-js';
import { of } from 'rxjs';
import { CookieService } from 'ngx-cookie-service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';

const mockedHttpClient = mock(HttpClient);
const mockedCookieService = mock(CookieService);
const mockedReportingService = mock(ErrorReportingService);

describe('Auth0Service', () => {
  configureTestingModule(() => ({
    providers: [
      { provide: HttpClient, useMock: mockedHttpClient },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: ErrorReportingService, useMock: mockedReportingService }
    ]
  }));

  it('should init a new Auth0 Client', fakeAsync(() => {
    const env = new TestEnvironment();
    const options: Auth0ClientOptions = {
      clientId: '12345',
      domain: 'localhost:5000'
    };

    const client = env.service.init(options);
    expect(client).toBeDefined();
    tick();
  }));

  it('should generate a new change password request', fakeAsync(() => {
    const env = new TestEnvironment();
    const email = 'test@example.com';
    env.service.changePassword(email);
    const httpOptions = capture(mockedHttpClient.post).last();
    expect(httpOptions[0].includes('dbconnections/change_password')).toBe(true);
    expect(httpOptions[1]).toEqual({ connection: 'Username-Password-Authentication', email });
  }));

  it('should authenticate transparently with a cookie', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupAuthenticationCookie();
    const expectedResponse: GetTokenSilentlyVerboseResponse = {
      id_token: '',
      access_token: '',
      scope: '',
      expires_in: 0
    };
    when(
      mockedHttpClient.post(
        anything(),
        anything(),
        deepEqual({
          headers: { 'Content-Type': 'application/json' },
          responseType: 'text'
        })
      )
    ).thenReturn(of(JSON.stringify(expectedResponse)));
    env.service.tryTransparentAuthentication().then(response => {
      expect(response).toEqual(expectedResponse);
      verify(mockedReportingService.silentError(anything(), anything())).never();
    });
    tick();
  }));

  it('should not try and authenticate transparently if no cookie is set', fakeAsync(() => {
    const env = new TestEnvironment();
    env.service.tryTransparentAuthentication().then(response => {
      verify(mockedCookieService.check(TransparentAuthenticationCookie)).once();
      verify(mockedCookieService.get(TransparentAuthenticationCookie)).never();
      expect(response).toBeUndefined();
      resetCalls(mockedCookieService);
    });
    tick();
  }));

  it('should silently return when authentication fails', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupAuthenticationCookie();
    when(mockedHttpClient.post(anything(), anything(), anything())).thenThrow(
      new GenericError('login_required', 'Not logged in')
    );
    env.service.tryTransparentAuthentication().then(response => {
      verify(mockedCookieService.check(TransparentAuthenticationCookie)).once();
      verify(mockedCookieService.get(TransparentAuthenticationCookie)).once();
      verify(mockedReportingService.silentError(anything(), anything())).once();
      expect(response).toBeUndefined();
    });
    tick();
  }));
});

class TestEnvironment {
  readonly service: Auth0Service;

  constructor() {
    when(mockedHttpClient.post(anything(), anything(), anything())).thenReturn(of({} as any));
    this.service = TestBed.inject(Auth0Service);
  }

  setupAuthenticationCookie(): void {
    when(mockedCookieService.check(TransparentAuthenticationCookie)).thenReturn(true);
    when(mockedCookieService.get(TransparentAuthenticationCookie)).thenReturn(
      JSON.stringify({
        Username: 'user01',
        Password: 'pass'
      })
    );
  }
}
