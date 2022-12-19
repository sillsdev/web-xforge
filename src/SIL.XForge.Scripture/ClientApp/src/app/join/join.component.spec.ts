import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { BehaviorSubject, of } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { AuthService } from 'xforge-common/auth.service';
import { I18nService } from 'xforge-common/i18n.service';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { SFProjectService } from '../core/sf-project.service';
import { JoinComponent } from './join.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedAuthService = mock(AuthService);
const mockedDialogService = mock(DialogService);
const mockedI18nService = mock(I18nService);
const mockedPwaService = mock(PwaService);
const mockedRouter = mock(Router);
const mockedSFProjectService = mock(SFProjectService);
const mockedTranslocoService = mock(TranslocoService);

describe('JoinComponent', () => {
  configureTestingModule(() => ({
    declarations: [JoinComponent],
    imports: [UICommonModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: Router, useMock: mockedRouter },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: TranslocoService, useMock: mockedTranslocoService }
    ]
  }));

  it('check sharing link passes shareKey', fakeAsync(() => {
    new TestEnvironment();

    verify(mockedSFProjectService.onlineCheckLinkSharing('abc123')).once();
    verify(mockedDialogService.message(anything())).never();
    verify(mockedRouter.navigateByUrl('/projects/project01', anything())).once();
    expect().nothing();
  }));

  it('check sharing link forbidden', fakeAsync(() => {
    const callback = (_: TestEnvironment) => {
      when(mockedSFProjectService.onlineCheckLinkSharing(anything())).thenReject(
        new CommandError(CommandErrorCode.Forbidden, 'Forbidden')
      );
    };
    new TestEnvironment({ callback });

    verify(mockedDialogService.message(anything())).once();
    verify(mockedRouter.navigateByUrl('/projects', anything())).once();
    expect().nothing();
  }));

  it('check sharing link project not found', fakeAsync(() => {
    const callback = (_: TestEnvironment) => {
      when(mockedSFProjectService.onlineCheckLinkSharing(anything())).thenReject(
        new CommandError(CommandErrorCode.NotFound, 'NotFound')
      );
    };
    new TestEnvironment({ callback });

    verify(mockedDialogService.message(anything())).once();
    verify(mockedRouter.navigateByUrl('/projects', anything())).once();
    expect().nothing();
  }));

  it('check sharing link skipped offline', fakeAsync(() => {
    when(mockedDialogService.message(anything())).thenResolve();
    new TestEnvironment({ isOnline: false });
    verify(mockedSFProjectService.onlineCheckLinkSharing(anything())).never();
    verify(mockedDialogService.message(anything())).once();
    verify(mockedRouter.navigateByUrl('/projects', anything())).once();
    expect().nothing();
  }));

  it('sets locale when not logged in', fakeAsync(() => {
    new TestEnvironment({ isLoggedIn: false, locale: 'fr' });
    verify(mockedI18nService.setLocale('fr', anything())).once();
    expect().nothing();
  }));

  it('sets locale when not logged in and locale not supplied', fakeAsync(() => {
    new TestEnvironment({ isLoggedIn: false });
    verify(mockedI18nService.setLocale('en', anything())).once();
    expect().nothing();
  }));

  it('does not set locale when logged in', fakeAsync(() => {
    new TestEnvironment({ isLoggedIn: true });
    verify(mockedI18nService.setLocale(anything(), anything())).never();
    expect().nothing();
  }));
});

interface TestEnvironmentConstructorArgs {
  isOnline?: boolean;
  isLoggedIn?: boolean;
  shareKey?: string;
  locale?: string;
  callback?: (env: TestEnvironment) => void;
}

class TestEnvironment {
  readonly component: JoinComponent;
  readonly fixture: ComponentFixture<JoinComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private readonly isOnline: BehaviorSubject<boolean>;

  constructor({
    isOnline = true,
    isLoggedIn = false,
    shareKey = 'abc123',
    locale,
    callback
  }: TestEnvironmentConstructorArgs = {}) {
    when(mockedActivatedRoute.params).thenReturn(of({ shareKey, locale }));
    when(mockedAuthService.currentUserId).thenReturn(isLoggedIn ? 'user01' : undefined);
    when(mockedSFProjectService.onlineCheckLinkSharing(anything())).thenResolve('project01');
    when(mockedDialogService.message(anything())).thenResolve();

    this.isOnline = new BehaviorSubject<boolean>(isOnline);
    when(mockedPwaService.onlineStatus$).thenReturn(this.isOnline.asObservable());

    if (callback != null) {
      callback(this);
    }

    this.fixture = TestBed.createComponent(JoinComponent);
    this.component = this.fixture.componentInstance;
    tick();
  }

  set onlineStatus(hasConnection: boolean) {
    this.isOnline.next(hasConnection);
  }
}
