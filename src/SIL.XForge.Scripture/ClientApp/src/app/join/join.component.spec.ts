import { HttpClientTestingModule } from '@angular/common/http/testing';
import { DebugElement } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { anything, capture, mock, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { AuthService } from 'xforge-common/auth.service';
import { I18nService } from 'xforge-common/i18n.service';
import { LocationService } from 'xforge-common/location.service';
import { AnonymousService } from 'xforge-common/anonymous.service';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { SFProjectService } from '../core/sf-project.service';
import { NoticeComponent } from '../shared/notice/notice.component';
import { JoinComponent } from './join.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedAnonymousService = mock(AnonymousService);
const mockedAuthService = mock(AuthService);
const mockedDialogService = mock(DialogService);
const mockedI18nService = mock(I18nService);
const mockedLocationService = mock(LocationService);
const mockedPwaService = mock(PwaService);
const mockedRouter = mock(Router);
const mockedSFProjectService = mock(SFProjectService);

describe('JoinComponent', () => {
  configureTestingModule(() => ({
    declarations: [JoinComponent, NoticeComponent],
    imports: [
      HttpClientTestingModule,
      NoopAnimationsModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      UICommonModule
    ],
    providers: [
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: AnonymousService, useMock: mockedAnonymousService },
      { provide: AuthService, useMock: mockedAuthService },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: LocationService, useMock: mockedLocationService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: Router, useMock: mockedRouter },
      { provide: SFProjectService, useMock: mockedSFProjectService }
    ]
  }));

  it('check sharing link passes shareKey', fakeAsync(() => {
    new TestEnvironment({ isLoggedIn: true });

    verify(mockedSFProjectService.onlineJoinWithShareKey('abc123')).once();
    verify(mockedDialogService.message(anything())).never();
    verify(mockedRouter.navigateByUrl('/projects/project01', anything())).once();
    expect().nothing();
  }));

  it('check sharing link forbidden', fakeAsync(() => {
    const callback = (_: TestEnvironment): void => {
      when(mockedSFProjectService.onlineJoinWithShareKey(anything())).thenReject(
        new CommandError(CommandErrorCode.Forbidden, 'Forbidden')
      );
    };
    new TestEnvironment({ callback, isLoggedIn: true });

    verify(mockedDialogService.message(anything())).once();
    verify(mockedRouter.navigateByUrl('/projects', anything())).once();
    expect().nothing();
  }));

  it('check sharing link project not found', fakeAsync(() => {
    const callback = (_: TestEnvironment): void => {
      when(mockedSFProjectService.onlineJoinWithShareKey(anything())).thenReject(
        new CommandError(CommandErrorCode.NotFound, 'NotFound')
      );
    };
    new TestEnvironment({ callback, isLoggedIn: true });

    verify(mockedDialogService.message(anything())).once();
    verify(mockedRouter.navigateByUrl('/projects', anything())).once();
    expect().nothing();
  }));

  it('check sharing link skipped offline', fakeAsync(() => {
    when(mockedDialogService.message(anything())).thenResolve();
    new TestEnvironment({ isOnline: false, isLoggedIn: true });
    verify(mockedSFProjectService.onlineJoinWithShareKey(anything())).never();
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

  describe('Anonymous', () => {
    it('invite text shows project and role', fakeAsync(() => {
      const env = new TestEnvironment();
      const [, details] = capture(mockedI18nService.translateAndInsertTags).first();
      expect(details).toEqual({ projectName: 'Test Project' });
      expect(env.joiningText).toBeTruthy();
    }));

    it('can not join project without entering a name', fakeAsync(() => {
      const env = new TestEnvironment();

      expect(env.displayName).toBe('');
      env.click(env.submitButton);
      expect(env.isFormValid).toBe(false);
      verify(mockedAnonymousService.generateAccount(anything(), anything(), anything())).never();

      env.displayName = 'Test Name';
      expect(env.isFormValid).toBe(true);
      env.click(env.submitButton);
      verify(mockedAnonymousService.generateAccount(anything(), anything(), anything())).once();
    }));

    it('can join a project and log in', fakeAsync(() => {
      when(mockedAnonymousService.generateAccount(anything(), anything(), anything())).thenCall(() => {
        when(mockedAuthService.isLoggedIn).thenResolve(true);
      });
      const env = new TestEnvironment();

      env.displayName = 'Test Name';
      env.click(env.submitButton);
      tick();
      verify(mockedRouter.navigateByUrl('/projects/project01', anything())).once();
      expect().nothing();
    }));

    it('redirect to home when using an invalid share link', fakeAsync(() => {
      const callback = (_: TestEnvironment): void => {
        when(mockedAnonymousService.checkShareKey(anything())).thenReject(
          new CommandError(CommandErrorCode.NotFound, 'NotFound')
        );
      };
      new TestEnvironment({ callback });

      verify(mockedDialogService.message(anything())).once();
      verify(mockedLocationService.go('/')).once();
      expect().nothing();
    }));

    it('disables form fields when joining', fakeAsync(() => {
      const env = new TestEnvironment();

      env.displayName = 'Test Name';
      expect(env.submitButton.nativeElement.disabled).toBeFalse();
      env.click(env.submitButton);
      expect(env.submitButton.nativeElement.disabled).toBeTrue();
    }));

    it('show dialog and enable form fields when joining fails', fakeAsync(() => {
      const env = new TestEnvironment();

      env.displayName = 'Test Name';
      env.click(env.submitButton);
      expect(env.submitButton.nativeElement.disabled).toBeTrue();
      tick();
      env.fixture.detectChanges();
      verify(mockedDialogService.message(anything(), anything())).once();
      expect(env.submitButton.nativeElement.disabled).toBeFalse();
    }));

    it('disable and enable form when online state changes', fakeAsync(() => {
      const env = new TestEnvironment();

      expect(env.offlineNotice).withContext('init').toBeFalsy();
      expect(env.displayNameInput.nativeElement.disabled).withContext('init').toBeFalse();
      expect(env.submitButton.nativeElement.disabled).withContext('init').toBeFalse();

      env.onlineStatus = false;
      expect(env.offlineNotice).withContext('offline').toBeTruthy();
      expect(env.displayNameInput.nativeElement.disabled).withContext('offline').toBeTrue();
      expect(env.submitButton.nativeElement.disabled).withContext('offline').toBeTrue();

      env.onlineStatus = true;
      expect(env.offlineNotice).withContext('online').toBeFalsy();
      expect(env.displayNameInput.nativeElement.disabled).withContext('online').toBeFalse();
      expect(env.submitButton.nativeElement.disabled).withContext('online').toBeFalse();
    }));
  });
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
  private readonly isOnline$: BehaviorSubject<boolean>;

  constructor({
    isOnline = true,
    isLoggedIn = false,
    shareKey = 'abc123',
    locale,
    callback
  }: TestEnvironmentConstructorArgs = {}) {
    when(mockedActivatedRoute.params).thenReturn(of({ shareKey, locale }));
    when(mockedAuthService.currentUserId).thenReturn(isLoggedIn ? 'user01' : undefined);
    if (isLoggedIn) {
      when(mockedAuthService.isLoggedIn).thenResolve(true);
    }
    when(mockedSFProjectService.onlineJoinWithShareKey(anything())).thenResolve('project01');
    when(mockedDialogService.message(anything())).thenResolve();

    this.isOnline$ = new BehaviorSubject<boolean>(isOnline);
    when(mockedPwaService.onlineStatus$).thenReturn(this.isOnline$.asObservable());
    when(mockedPwaService.isOnline).thenCall(() => this.isOnline$.getValue());
    when(mockedLocationService.origin).thenReturn('/');
    when(mockedAnonymousService.checkShareKey(anything())).thenResolve({
      shareKey,
      role: SFProjectRole.CommunityChecker,
      projectName: 'Test Project'
    });
    when(mockedI18nService.localizeRole(anything())).thenCall(r => r);

    if (callback != null) {
      callback(this);
    }

    this.fixture = TestBed.createComponent(JoinComponent);
    this.component = this.fixture.componentInstance;
    tick();
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  click(element: DebugElement): void {
    element.nativeElement.click();
    this.fixture.detectChanges();
  }

  get isFormValid(): boolean {
    return this.component.name.valid;
  }

  get joiningText(): DebugElement {
    return this.fixture.debugElement.query(By.css('p'));
  }

  get displayName(): string {
    return this.displayNameInput.nativeElement.value;
  }

  set displayName(name: string) {
    const inputElem: HTMLInputElement = this.displayNameInput.nativeElement;
    inputElem.value = name;
    inputElem.dispatchEvent(new Event('input'));
    inputElem.dispatchEvent(new Event('change'));
  }
  get displayNameInput(): DebugElement {
    return this.fixture.debugElement.query(By.css('mat-form-field input'));
  }

  get submitButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('button[type="submit"]'));
  }

  get offlineNotice(): DebugElement {
    return this.fixture.debugElement.query(By.css('app-notice'));
  }

  set onlineStatus(hasConnection: boolean) {
    this.isOnline$.next(hasConnection);
    tick();
    this.fixture.detectChanges();
  }
}
