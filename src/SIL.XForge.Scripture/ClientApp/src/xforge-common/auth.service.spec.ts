import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { WebAuth } from 'auth0-js';
import { CookieService } from 'ngx-cookie-service';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { AuthService } from './auth.service';
import { Auth0Service } from './auth0.service';
import { BugsnagService } from './bugsnag.service';
import { CommandService } from './command.service';
import { ErrorReportingService } from './error-reporting.service';
import { LocalSettingsService } from './local-settings.service';
import { LocationService } from './location.service';
import { NoticeService } from './notice.service';
import { OfflineStore } from './offline-store';
import { PwaService } from './pwa.service';
import { SharedbRealtimeRemoteStore } from './sharedb-realtime-remote-store';
import { configureTestingModule } from './test-utils';

const mockedAuth0Service = mock(Auth0Service);
const mockedWebAuth = mock(WebAuth);
const mockedSharedbRealtimeRemoteStore = mock(SharedbRealtimeRemoteStore);
const mockedOfflineStore = mock(OfflineStore);
const mockedLocationService = mock(LocationService);
const mockedCommandService = mock(CommandService);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
const mockedRouter = mock(Router);
const mockedLocalSettingsService = mock(LocalSettingsService);
const mockedPwaService = mock(PwaService);
const mockedNoticeService = mock(NoticeService);
const mockedErrorReportingService = mock(ErrorReportingService);

describe('AuthService', () => {
  configureTestingModule(() => ({
    imports: [RouterTestingModule],
    providers: [
      AuthService,
      { provide: Auth0Service, useMock: mockedAuth0Service },
      { provide: SharedbRealtimeRemoteStore, useMock: mockedSharedbRealtimeRemoteStore },
      { provide: OfflineStore, useMock: mockedOfflineStore },
      { provide: LocationService, useMock: mockedLocationService },
      { provide: CommandService, useMock: mockedCommandService },
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: Router, useMock: mockedRouter },
      { provide: LocalSettingsService, useMock: mockedLocalSettingsService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService }
    ]
  }));

  it('should create the test environment', () => {
    const env = new TestEnvironment();
    expect(env).toBeDefined();
    expect(env.service).toBeDefined();
  });
});

class TestEnvironment {
  readonly service: AuthService;

  constructor() {
    when(mockedAuth0Service.init).thenReturn(() => instance(mockedWebAuth));
    when(mockedLocalSettingsService.remoteChanges$).thenReturn(of());
    this.service = TestBed.inject(AuthService);
  }
}
