import { HTTP_INTERCEPTORS, HttpClient, HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { mock, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { AUTH_APIS, AuthHttpInterceptor } from 'xforge-common/auth-http-interceptor';
import { CommandErrorCode, JsonRpcResponse } from 'xforge-common/command.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { COMMAND_API_NAMESPACE, PROJECTS_URL, USERS_URL } from 'xforge-common/url-constants';

const mockedAuthService = mock(AuthService);

describe('AuthHttpInterceptor', () => {
  configureTestingModule(() => ({
    imports: [HttpClientTestingModule],
    providers: [
      { provide: HTTP_INTERCEPTORS, useClass: AuthHttpInterceptor, multi: true },
      { provide: AuthService, useMock: mockedAuthService }
    ]
  }));

  it('Sets authorization bearer only for valid auth apis', fakeAsync(() => {
    const env = new TestEnvironment({ isAuthenticated: true });
    const tests: { url: string; authorizationRequired: boolean }[] = [USERS_URL, PROJECTS_URL]
      .map(url => ({
        url,
        authorizationRequired: false
      }))
      .concat(AUTH_APIS.map(url => ({ url, authorizationRequired: true })));
    tests.forEach(test => {
      env.httpClient.get(test.url).toPromise();
      tick();
      env.httpMock.expectOne((request: HttpRequest<any>) => {
        expect(request.url).toEqual(test.url);
        if (test.authorizationRequired) {
          expect(request.headers.get('authorization'))
            .withContext(test.url)
            .toEqual(`Bearer ${TestEnvironment.accessToken}`);
        } else {
          expect(request.headers.get('authorization')).withContext(test.url).toBeNull();
        }
        return true;
      });
    });
    env.httpMock.verify();
  }));

  it('Converts JSON RPC errors to normal http response error and attempts to authenticate again with auth0', fakeAsync(() => {
    const env = new TestEnvironment({ isAuthenticated: true });
    const apiUrl = COMMAND_API_NAMESPACE;
    let result: any | undefined;
    env.httpClient
      .get(apiUrl)
      .toPromise()
      .then(r => (result = r));
    tick();
    const request = env.httpMock.expectOne((request: HttpRequest<any>) => {
      expect(request.url).toEqual(apiUrl);
      expect(request.headers.get('authorization')).toEqual(`Bearer ${TestEnvironment.accessToken}`);
      return true;
    });
    // JSON RPC response are returned via a 200 response but containing the error
    // The interceptor identifies this and throws a new error with the JSON error code and message
    // requiring the interceptor to parse the correct error and attempt authentication again
    const jsonRpcResponse: JsonRpcResponse<string> = {
      jsonrpc: '2.0',
      error: { code: CommandErrorCode.InvalidRequest, message: 'Unauthorized' },
      id: '1'
    };
    request.flush(jsonRpcResponse);
    tick();
    expect(result).toBeUndefined();
    verify(mockedAuthService.expireToken()).once();
    verify(mockedAuthService.isAuthenticated()).twice();
    // This is because a second call is made when the JSON response is handled and it needs to be flushed
    env.httpMock.expectOne({ url: apiUrl });
    env.httpMock.verify();
  }));

  it('Handles a 401 response and redirects to auth0 to login if unable to authenticate silently', fakeAsync(() => {
    const env = new TestEnvironment();
    const apiUrl = COMMAND_API_NAMESPACE;
    env.httpClient.get(apiUrl).toPromise();
    tick();
    verify(mockedAuthService.isAuthenticated()).once();
    // None should be available as it never completes due to isAuthenticated failing and auth0 redirecting
    env.httpMock.expectNone({ url: apiUrl });
    env.httpMock.verify();
    expect().nothing();
  }));

  it('Handles a normal error and throws it', fakeAsync(() => {
    const env = new TestEnvironment({ isAuthenticated: true });
    const apiUrl = COMMAND_API_NAMESPACE;
    let result: HttpErrorResponse | undefined;
    env.httpClient
      .get(apiUrl)
      .toPromise()
      .catch(r => (result = r));
    tick();
    const request = env.httpMock.expectOne((request: HttpRequest<any>) => {
      expect(request.url).toEqual(apiUrl);
      expect(request.headers.get('authorization')).toEqual(`Bearer ${TestEnvironment.accessToken}`);
      return true;
    });
    const mockError = new ProgressEvent('An error occurred');
    request.error(mockError);
    tick();
    expect(result!.error).toBe(mockError);
    env.httpMock.verify();
  }));

  it('Handle a normal JSON RPC response without throwing an error', fakeAsync(() => {
    const env = new TestEnvironment({ isAuthenticated: true });
    const apiUrl = COMMAND_API_NAMESPACE;
    let result: any | undefined;
    env.httpClient
      .get(apiUrl)
      .toPromise()
      .then(r => (result = r));
    tick();
    const request = env.httpMock.expectOne((request: HttpRequest<any>) => {
      expect(request.url).toEqual(apiUrl);
      expect(request.headers.get('authorization')).toEqual(`Bearer ${TestEnvironment.accessToken}`);
      return true;
    });
    const jsonRpcResponse: JsonRpcResponse<string> = {
      jsonrpc: '2.0',
      result: 'ok',
      id: '1'
    };
    request.flush(jsonRpcResponse);
    tick();
    expect(result).toBe(jsonRpcResponse);
    env.httpMock.verify();
  }));
});

interface TestEnvironmentConstructorArgs {
  isAuthenticated?: boolean;
}

class TestEnvironment {
  static accessToken = 'validAccessToken';
  readonly httpMock: HttpTestingController;
  readonly httpClient: HttpClient;

  constructor({ isAuthenticated = false }: TestEnvironmentConstructorArgs = {}) {
    this.httpMock = TestBed.inject(HttpTestingController);
    this.httpClient = TestBed.inject(HttpClient);

    when(mockedAuthService.isAuthenticated()).thenResolve(isAuthenticated);
    when(mockedAuthService.getAccessToken()).thenResolve(isAuthenticated === true ? TestEnvironment.accessToken : '');
  }
}
