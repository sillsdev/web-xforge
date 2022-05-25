import { anything, capture, mock, when } from 'ts-mockito';
import { HttpClient } from '@angular/common/http';
import { configureTestingModule } from 'xforge-common/test-utils';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Auth0Service } from 'xforge-common/auth0.service';
import { Auth0ClientOptions } from '@auth0/auth0-spa-js';
import { of } from 'rxjs';

const mockedHttpClient = mock(HttpClient);

describe('Auth0Service', () => {
  configureTestingModule(() => ({
    providers: [{ provide: HttpClient, useMock: mockedHttpClient }]
  }));

  it('should init a new Auth0 Client', fakeAsync(() => {
    const env = new TestEnvironment();
    const options: Auth0ClientOptions = {
      client_id: '12345',
      domain: 'localhost:5000'
    };

    const client = env.service.init(options);
    expect(client).toBeDefined();
    client.buildAuthorizeUrl().then(authUrl => {
      const url = new URL(authUrl);
      expect(url.searchParams.get('client_id')).toBe(options.client_id);
    });
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
});

class TestEnvironment {
  readonly service: Auth0Service;

  constructor() {
    when(mockedHttpClient.post(anything(), anything(), anything())).thenReturn(of());
    this.service = TestBed.inject(Auth0Service);
  }
}
