import { BreakpointObserver } from '@angular/cdk/layout';
import { Location } from '@angular/common';
import { Component, DebugElement, NgZone } from '@angular/core';
import { ComponentFixture, discardPeriodicTasks, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Route, Router, RouterModule } from '@angular/router';
import { CookieService } from 'ngx-cookie-service';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { SFProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { createTestProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config-test-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { BehaviorSubject, filter, firstValueFrom, Subject } from 'rxjs';
import { anything, capture, mock, verify, when } from 'ts-mockito';
import { AuthService, LoginResult } from 'xforge-common/auth.service';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { FileService } from 'xforge-common/file.service';
import { I18nService } from 'xforge-common/i18n.service';
import { LocationService } from 'xforge-common/location.service';
import { FETCH_WITHOUT_SUBSCRIBE } from 'xforge-common/models/realtime-doc';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { PWA_BEFORE_PROMPT_CAN_BE_SHOWN_AGAIN, PwaService } from 'xforge-common/pwa.service';
import { TestBreakpointObserver } from 'xforge-common/test-breakpoint-observer';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { AppComponent } from './app.component';
import { SFProjectProfileDoc } from './core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from './core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from './core/models/sf-type-registry';
import { SFProjectService } from './core/sf-project.service';
import { NavigationComponent } from './navigation/navigation.component';
import { GlobalNoticesComponent } from './shared/global-notices/global-notices.component';
import { SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from './shared/project-router.guard';
import { paratextUsersFromRoles } from './shared/test-utils';

const mockedAuthService = mock(AuthService);
const mockedUserService = mock(UserService);
const mockedSettingsAuthGuard = mock(SettingsAuthGuard);
const mockedSyncAuthGuard = mock(SyncAuthGuard);
const mockedUsersAuthGuard = mock(UsersAuthGuard);
const mockedSFProjectService = mock(SFProjectService);
const mockedCookieService = mock(CookieService);
const mockedLocationService = mock(LocationService);
const mockedNoticeService = mock(NoticeService);
const mockedPwaService = mock(PwaService);
const mockedI18nService = mock(I18nService);
const mockedUrlService = mock(ExternalUrlService);
const mockedFileService = mock(FileService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedDialogService = mock(DialogService);

@Component({
  template: `<div>Mock</div>`
})
class MockComponent {}

const ROUTES: Route[] = [
  { path: 'projects/:projectId/settings', component: MockComponent },
  { path: 'projects/:projectId', component: MockComponent },
  { path: 'projects/:projectId/translate/:bookId', component: MockComponent },
  { path: 'projects/:projectId/translate', component: MockComponent },
  { path: 'projects/:projectId/draft-generation', component: MockComponent },
  { path: 'projects/:projectId/checking/:bookId', component: MockComponent },
  { path: 'projects/:projectId/checking', component: MockComponent },
  { path: 'projects', component: MockComponent },
  { path: 'my-account', component: MockComponent },
  { path: 'connect-project', component: MockComponent },
  { path: 'serval-administration', component: MockComponent },
  { path: 'serval-administration/:projectId', component: MockComponent }
];

describe('AppComponent', () => {
  configureTestingModule(() => ({
    declarations: [AppComponent, NavigationComponent],
    imports: [
      UICommonModule,
      NoopAnimationsModule,
      RouterModule.forRoot(ROUTES),
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      AvatarComponent,
      GlobalNoticesComponent
    ],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: UserService, useMock: mockedUserService },
      { provide: SettingsAuthGuard, useMock: mockedSettingsAuthGuard },
      { provide: SyncAuthGuard, useMock: mockedSyncAuthGuard },
      { provide: UsersAuthGuard, useMock: mockedUsersAuthGuard },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: LocationService, useMock: mockedLocationService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: I18nService, useMock: mockedI18nService },
      { provide: ExternalUrlService, useMock: mockedUrlService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: FileService, useMock: mockedFileService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService },
      { provide: BreakpointObserver, useClass: TestBreakpointObserver },
      { provide: DialogService, useMock: mockedDialogService }
    ]
  }));

  afterEach(() => {
    // suppress no expectations warning
    expect(1).toEqual(1);
  });

  it('navigate to last project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project01');
    // Translate | Overview | Edit & review | Community Checking | Manage questions | Questions & answers |
    // Synchronize | Users | Settings
    expect(env.menuLength).toEqual(9);
    verify(mockedUserService.setCurrentProjectId(anything(), 'project01')).once();
    tick();
  }));

  it('navigate to different project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project02']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project02');
    // Expect: Community Checking | Manage Questions | Overview | Sync | Settings | Users
    expect(env.menuLength).toEqual(6);
    verify(mockedUserService.setCurrentProjectId(anything(), 'project02')).once();
  }));

  it('close menu when navigating to a non-project route', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/my-account']);
    env.init();

    expect(env.isDrawerVisible).toEqual(false);
    expect(env.component.selectedProjectId).toBeUndefined();
  }));

  it('drawer disappears as appropriate in small viewport', fakeAsync(() => {
    // The user goes to a project. They are using an sm size viewport.
    const env = new TestEnvironment();
    env.breakpointObserver.emitObserveValue(false);
    env.navigateFully(['/projects', 'project01']);
    // (And we are not here calling env.init(), which would open the drawer.)

    // With a smaller viewport, at a project page, the drawer should not be visible. Although it is in the dom.
    expect(env.isDrawerVisible).toBe(false);
    expect(env.menuDrawer).not.toBeNull();
    // But the hamburger menu button will be visible.
    expect(env.hamburgerMenuButton).not.toBeNull();

    // The user clicks the hamburger button, revealing the drawer.
    env.click(env.hamburgerMenuButton);
    expect(env.isDrawerVisible).toBe(true);
    expect(env.menuDrawer).not.toBeNull();
    expect(env.hamburgerMenuButton).not.toBeNull();

    // Clicking the hamburger button again makes the drawer disappear (but is still in the dom.)
    env.click(env.hamburgerMenuButton);
    expect(env.isDrawerVisible).toBe(false);
    expect(env.menuDrawer).not.toBeNull();

    // The user opens the drawer again.
    env.click(env.hamburgerMenuButton);
    expect(env.isDrawerVisible).toBe(true);
    expect(env.component['isExpanded']).toBe(true);
    // The user clicks to navigate to the translate overview page.
    env.click(env.menuListItems[1]);
    // The drawer disappears, but is still in the dom.
    expect(env.isDrawerVisible).toBe(false);
    expect(env.menuDrawer).not.toBeNull();
    expect(env.component['isExpanded']).toBe(false);

    // The user opens the drawer.
    env.click(env.hamburgerMenuButton);
    expect(env.isDrawerVisible).toBe(true);
    expect(env.component['isExpanded']).toBe(true);
    // The user navigates to the My projects page by clicking the SF logo in the
    // toolbar (or from the My projects item in the avatar menu).
    env.click(env.sfLogoButton);
    // The drawer disappears, even from the dom. The hamburger menu icon is also gone.
    expect(env.isDrawerVisible).toBe(false);
    expect(env.menuDrawer).toBeNull();
    expect(env.hamburgerMenuButton).toBeNull();
    expect(env.component['isExpanded']).toBe(false);
    // The user clicks in the My projects component to open another project.
    env.navigateFully(['projects', 'project02']);
    // The drawer should not be showing, but is in the dom.
    expect(env.isDrawerVisible).toBe(false);
    expect(env.component['isExpanded']).toBe(false);
    expect(env.menuDrawer).not.toBeNull();
    expect(env.hamburgerMenuButton).not.toBeNull();
  }));

  it('does not set user locale when stored locale matches the browsing session', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    tick();
    env.fixture.detectChanges();
    verify(mockedAuthService.updateInterfaceLanguage(anything())).never();
  }));

  it('sets user locale when stored locale does not match the browsing session', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedAuthService.isNewlyLoggedIn).thenResolve(true);
    when(mockedI18nService.localeCode).thenReturn('es');
    env.navigate(['/projects', 'project01']);
    env.init();

    tick();
    env.fixture.detectChanges();
    verify(mockedI18nService.setLocale('en')).once();

    env.component.setLocale('pt-BR');
    tick();
    env.fixture.detectChanges();
    verify(mockedI18nService.setLocale('pt-BR')).once();
  }));

  it('should not set user locale when not newly logged in and stored locale does not match the browsing session', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedAuthService.isNewlyLoggedIn).thenResolve(false);
    when(mockedI18nService.localeCode).thenReturn('es');
    env.navigate(['/projects', 'project01']);
    env.init();

    tick();
    env.fixture.detectChanges();
    verify(mockedI18nService.setLocale('en')).never();
  }));

  it('set interface language when specifically setting locale', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    tick();
    env.fixture.detectChanges();

    env.component.setLocale('pt-BR');
    verify(mockedI18nService.setLocale('pt-BR')).once();
    verify(mockedAuthService.updateInterfaceLanguage('pt-BR')).once();
  }));

  it('response to remote project deletion', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project01');
    // SUT
    env.deleteProject('project01', false);
    verify(mockedDialogService.message(anything())).once();
    verify(mockedUserService.setCurrentProjectId(anything(), undefined)).once();
    // Get past setTimeout to navigation
    tick();
    env.fixture.detectChanges();
    tick();
    expect(env.isDrawerVisible).toEqual(false);
    expect(env.location.path()).toEqual('/projects');
  }));

  it('response to remote project deletion when no project selected', fakeAsync(() => {
    // If we are at the My Projects list at /projects, and a project is deleted, we should still be at the /projects
    // page. Note that one difference between some other project being deleted, vs the _current_ project being deleted,
    // is that AppComponent listens to the current project for its deletion.
    const env = new TestEnvironment();
    env.navigate(['/projects']);
    env.init();

    env.deleteProject('project01', false);
    // The drawer is not visible because we will be showing the project list.
    expect(env.isDrawerVisible).toEqual(false);
    expect(env.location.path()).toEqual('/projects');
  }));

  it('response to removed from project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.selectedProjectId).toEqual('project01');
    env.removeUserFromProject('project01');
    verify(mockedDialogService.message(anything())).once();
    // Get past setTimeout to navigation
    tick();
    expect(env.location.path()).toEqual('/projects');
  }));

  it('response to remote project change for serval admin', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setCurrentUser('user05');
    env.navigate(['/serval-administration', 'project01']);
    when(mockedLocationService.pathname).thenReturn('/serval-administration/project01');
    env.init();

    expect(env.selectedProjectId).toEqual('project01');
    env.updatePreTranslate('project01');
    verify(mockedDialogService.message(anything())).never();
  }));

  it('response to Commenter project role changed', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.setCurrentUser('user04');
    env.init();

    expect(env.selectedProjectId).toEqual('project01');
    when(mockedLocationService.pathname).thenReturn('/projects/project01/translate');
    env.changeUserRole('project01', 'user04', SFProjectRole.CommunityChecker);
    expect(env.location.path()).toEqual('/projects/project01');
    env.wait();
  }));

  it('response to Community Checker project role changed', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.setCurrentUser('user02');
    env.init();

    expect(env.selectedProjectId).toEqual('project01');
    when(mockedLocationService.pathname).thenReturn('/projects/project01/checking');
    env.changeUserRole('project01', 'user02', SFProjectRole.Viewer);
    expect(env.location.path()).toEqual('/projects/project01');
    discardPeriodicTasks();
  }));

  it('shows banner when update is available', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.refreshButton).toBeNull();
    env.hasUpdate$.next('update!');
    env.wait();
    expect(env.refreshButton).not.toBeNull();
    env.refreshButton.nativeElement.click();
    env.wait();
    verify(mockedPwaService.activateUpdates()).once();
    tick();
  }));

  it('shows install badge and option when installing is available', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.installBadge).toBeNull();
    expect(env.installButton).toBeNull();
    env.canInstall$.next(true);
    env.showHideUserMenu();
    expect(env.installBadge).not.toBeNull();
    expect(env.installButton).not.toBeNull();
    env.showHideUserMenu();
  }));

  it('hide install badge after avatar menu click', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    env.canInstall$.next(true);
    env.wait();
    expect(env.installBadge).not.toBeNull();

    when(mockedPwaService.installPromptLastShownTime).thenReturn(Date.now());
    env.showHideUserMenu();
    expect(env.installBadge).toBeNull();

    // The install badge should be visible again
    tick(PWA_BEFORE_PROMPT_CAN_BE_SHOWN_AGAIN);
    env.wait();
    expect(env.installBadge).not.toBeNull();

    env.showHideUserMenu();
  }));

  it('user data is set for Bugsnag', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();

    verify(mockedErrorReportingService.addMeta(anything(), 'user')).once();
    const [metadata] = capture(mockedErrorReportingService.addMeta).first();
    expect(metadata['id']).toEqual('user01');
  }));

  it('checks online auth status when browser comes online but app is not fully online', fakeAsync(() => {
    const env = new TestEnvironment('offline');
    env.init();

    expect(env.component['isAppOnline']).toBe(false);
    verify(mockedAuthService.checkOnlineAuth()).never();

    env.setBrowserOnlineStatus(true);
    tick();
    expect(env.component['isAppOnline']).toBe(false);
    verify(mockedAuthService.checkOnlineAuth()).once();
  }));

  it('hide avatar if not logged in', fakeAsync(() => {
    const env = new TestEnvironment('online', false);
    env.init();

    expect(env.avatarIcon).toBeNull();
  }));

  it('show avatar after user logs in', fakeAsync(() => {
    const env = new TestEnvironment('online', false);
    env.init();

    expect(env.avatarIcon).toBeNull();
    env.triggerLogin();
    expect(env.avatarIcon).not.toBeNull();
  }));

  it('navigate to the hangfire dashboard and set the cookie', fakeAsync(async () => {
    const env = new TestEnvironment();
    env.init();

    await env.component.hangfireDashboard();
    expect().nothing();
    verify(mockedCookieService.set(anything(), anything(), anything(), anything())).once();
    verify(mockedLocationService.openInNewTab(anything())).once();
  }));

  describe('Community Checking', () => {
    it('ensure local storage is cleared when removed from project', fakeAsync(() => {
      const env = new TestEnvironment();
      env.navigate(['/projects', 'project01']);
      env.init();

      const projectId = 'project01';
      expect(env.selectedProjectId).toEqual(projectId);
      env.removeUserFromProject(projectId);
      verify(mockedSFProjectService.localDelete(projectId)).once();
    }));

    it('users can edit their display name', fakeAsync(() => {
      const env = new TestEnvironment('online');
      env.init();

      env.showHideUserMenu();
      expect(env.userMenu).not.toBeNull();
      env.clickEditDisplayName();
      verify(mockedUserService.editDisplayName(false)).once();
    }));

    it('shows message when edit name button clicked while offline', fakeAsync(() => {
      const env = new TestEnvironment('offline');
      env.setCurrentUser('user02');
      env.init();

      env.showHideUserMenu();
      expect(env.userMenu).not.toBeNull();
      expect(env.editNameButton).not.toBeNull();
      env.clickEditDisplayName();
      verify(mockedNoticeService.show(anything())).once();
      verify(mockedUserService.editDisplayName(anything())).never();
    }));
  });

  describe('Serval Administrator', () => {
    it('shows serval administration menu item', fakeAsync(() => {
      const env = new TestEnvironment('online');
      when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
      env.init();

      // Show the user menu
      env.showHideUserMenu();

      // Verify the menu item is visible
      expect(env.component.isServalAdmin).toBe(true);
      expect(env.userMenu).not.toBeNull();
      expect(env.servalAdminButton).not.toBeNull();

      // Hide the user menu
      env.showHideUserMenu();
    }));

    it('does not show system administration menu item', fakeAsync(() => {
      const env = new TestEnvironment('online');
      when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
      env.init();

      // Show the user menu
      env.showHideUserMenu();

      // Verify the menu item is not visible
      expect(env.component.isSystemAdmin).toBe(false);
      expect(env.userMenu).not.toBeNull();
      expect(env.systemAdminButton).toBeNull();

      // Hide the user menu
      env.showHideUserMenu();
    }));

    it('does not show hangfire dashboard menu item', fakeAsync(() => {
      const env = new TestEnvironment('online');
      when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.ServalAdmin]);
      env.init();

      // Show the user menu
      env.showHideUserMenu();

      // Verify the menu item is not visible
      expect(env.component.isSystemAdmin).toBe(false);
      expect(env.userMenu).not.toBeNull();
      expect(env.hangfireDashboardButton).toBeNull();

      // Hide the user menu
      env.showHideUserMenu();
    }));
  });

  describe('System Administrator', () => {
    it('shows system administration menu item', fakeAsync(() => {
      const env = new TestEnvironment('online');
      when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.SystemAdmin]);
      env.init();

      // Show the user menu
      env.showHideUserMenu();

      // Verify the menu item is visible
      expect(env.component.isSystemAdmin).toBe(true);
      expect(env.userMenu).not.toBeNull();
      expect(env.systemAdminButton).not.toBeNull();

      // Hide the user menu
      env.showHideUserMenu();
    }));

    it('does not show serval administration menu item', fakeAsync(() => {
      const env = new TestEnvironment('online');
      when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.SystemAdmin]);
      env.init();

      // Show the user menu
      env.showHideUserMenu();

      // Verify the menu item is not visible
      expect(env.component.isServalAdmin).toBe(false);
      expect(env.userMenu).not.toBeNull();
      expect(env.servalAdminButton).toBeNull();

      // Hide the user menu
      env.showHideUserMenu();
    }));

    it('shows hangfire dashboard menu item', fakeAsync(() => {
      const env = new TestEnvironment('online');
      when(mockedAuthService.currentUserRoles).thenReturn([SystemRole.SystemAdmin]);
      env.init();

      // Show the user menu
      env.showHideUserMenu();

      // Verify the menu item is visible
      expect(env.component.isSystemAdmin).toBe(true);
      expect(env.userMenu).not.toBeNull();
      expect(env.hangfireDashboardButton).not.toBeNull();

      // Hide the user menu
      env.showHideUserMenu();
    }));
  });
});

class TestEnvironment {
  readonly component: AppComponent;
  readonly fixture: ComponentFixture<AppComponent>;
  readonly router: Router;
  readonly location: Location;
  readonly ngZone: NgZone;
  readonly canInstall$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  readonly canSync$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  readonly canSeeGenerateDraft$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  readonly canSeeSettings$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  readonly canSeeUsers$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  readonly hasUpdate$: Subject<any> = new Subject<any>();
  readonly loggedInState$: BehaviorSubject<LoginResult> = new BehaviorSubject<LoginResult>({
    loggedIn: true,
    newlyLoggedIn: false,
    anonymousUser: false
  });
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;
  readonly comesOnline$: Subject<void> = new Subject<void>();
  readonly breakpointObserver: TestBreakpointObserver = TestBed.inject(BreakpointObserver) as TestBreakpointObserver;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(initialConnectionStatus?: 'online' | 'offline', isLoggedIn: boolean = true) {
    if (!isLoggedIn) {
      this.loggedInState$.next({
        loggedIn: false,
        newlyLoggedIn: false,
        anonymousUser: false
      });
    }
    this.addUser('user01', 'User 01', 'paratext|user01');
    this.addUser('user02', 'User 02', 'auth0|user02');
    this.addUser('user03', 'User 03', 'sms|user03');
    this.addUser('user04', 'User 04', 'sms|user04');
    this.addUser('user05', 'User 05', 'paratext|user05', SystemRole.ServalAdmin);

    this.addProject(
      'project01',
      {
        user01: SFProjectRole.ParatextTranslator,
        user02: SFProjectRole.CommunityChecker,
        user03: SFProjectRole.CommunityChecker,
        user04: SFProjectRole.Commenter
      },
      [
        { bookNum: 40, hasSource: true, chapters: [], permissions: {} },
        { bookNum: 41, hasSource: false, chapters: [], permissions: {} }
      ]
    );
    // Books are out-of-order on purpose so that we can test that books are displayed in canonical order
    this.addProject('project02', { user01: SFProjectRole.CommunityChecker, user02: SFProjectRole.CommunityChecker }, [
      { bookNum: 43, hasSource: false, chapters: [], permissions: {} },
      { bookNum: 42, hasSource: false, chapters: [], permissions: {} }
    ]);
    this.addProject('project03', { user01: SFProjectRole.CommunityChecker, user02: SFProjectRole.CommunityChecker }, [
      { bookNum: 44, hasSource: true, chapters: [], permissions: {} },
      { bookNum: 45, hasSource: true, chapters: [], permissions: {} }
    ]);
    this.addProject('project04', {}, [
      { bookNum: 46, hasSource: true, chapters: [], permissions: {} },
      { bookNum: 47, hasSource: true, chapters: [], permissions: {} }
    ]);
    this.addProjectUserConfig('project01', 'user01');
    this.addProjectUserConfig('project01', 'user02');
    this.addProjectUserConfig('project01', 'user03');
    this.addProjectUserConfig('project01', 'user04');

    when(mockedSFProjectService.getProfile(anything(), anything())).thenCall((projectId, subscriber) =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, projectId, subscriber)
    );
    when(mockedSFProjectService.getUserConfig(anything(), anything())).thenCall((projectId, userId, subscriber) =>
      this.realtimeService.subscribe(SFProjectUserConfigDoc.COLLECTION, `${projectId}:${userId}`, subscriber)
    );
    when(mockedLocationService.pathname).thenReturn('/projects/project01/checking');

    when(mockedAuthService.currentUserRoles).thenReturn([]);
    when(mockedAuthService.getAccessToken()).thenReturn(Promise.resolve('access_token'));
    when(mockedAuthService.isLoggedIn).thenCall(() => Promise.resolve(this.loggedInState$.getValue().loggedIn));
    when(mockedAuthService.loggedIn).thenCall(() =>
      firstValueFrom(this.loggedInState$.pipe(filter((state: any) => state.loggedIn)))
    );
    when(mockedAuthService.loggedInState$).thenReturn(this.loggedInState$);
    if (isLoggedIn) {
      this.setCurrentUser('user01');
    }
    when(mockedUserService.currentProjectId(anything())).thenReturn('project01');
    when(mockedSettingsAuthGuard.allowTransition(anything())).thenReturn(this.canSeeSettings$);
    when(mockedSyncAuthGuard.allowTransition(anything())).thenReturn(this.canSync$);
    when(mockedUsersAuthGuard.allowTransition(anything())).thenReturn(this.canSeeUsers$);
    when(mockedI18nService.localeCode).thenReturn('en');
    when(mockedUrlService.helps).thenReturn('helps');
    when(mockedUrlService.announcementPage).thenReturn('community-announcements');
    when(mockedUrlService.communitySupport).thenReturn('community-support');
    when(mockedUrlService.manual).thenReturn('manual');

    if (initialConnectionStatus === 'offline') {
      this.goFullyOffline();
    } else {
      this.comesOnline$.next();
      this.goFullyOnline();
    }
    when(mockedFileService.notifyUserIfStorageQuotaBelow(anything())).thenResolve();
    when(mockedPwaService.hasUpdate$).thenReturn(this.hasUpdate$);
    when(mockedPwaService.canInstall$).thenReturn(this.canInstall$);

    this.router = TestBed.inject(Router);
    this.location = TestBed.inject(Location);
    this.ngZone = TestBed.inject(NgZone);
    this.fixture = TestBed.createComponent(AppComponent);
    this.component = this.fixture.componentInstance;
    this.ngZone.run(() => this.router.initialNavigation());
  }

  get menuDrawer(): DebugElement {
    return this.fixture.debugElement.query(By.css('#menu-drawer'));
  }

  get menuListItems(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('#menu-drawer .mdc-list-item'));
  }

  get userMenu(): DebugElement {
    return this.fixture.debugElement.query(By.css('.user-menu'));
  }

  get editNameButton(): DebugElement {
    return this.userMenu.query(By.css('#edit-name-btn'));
  }

  get hangfireDashboardButton(): DebugElement {
    return this.userMenu.query(By.css('#hangfire-dashboard-btn'));
  }

  get servalAdminButton(): DebugElement {
    return this.userMenu.query(By.css('#serval-admin-btn'));
  }

  get systemAdminButton(): DebugElement {
    return this.userMenu.query(By.css('#system-admin-btn'));
  }

  get navBar(): DebugElement {
    return this.fixture.debugElement.query(By.css('mat-toolbar'));
  }

  get avatarIcon(): DebugElement {
    return this.navBar.query(By.css('app-avatar'));
  }

  get installBadge(): DebugElement {
    return this.navBar.query(By.css('.install-badge'));
  }

  get installButton(): DebugElement {
    return this.navBar.query(By.css('.install-button'));
  }

  get refreshButton(): DebugElement {
    return this.navBar.query(By.css('.update-banner .mat-mdc-raised-button'));
  }

  get selectedProjectId(): string {
    return this.component.selectedProjectId!;
  }

  get menuLength(): number {
    return this.menuListItems.length;
  }

  get isDrawerVisible(): boolean {
    return this.menuDrawer?.componentInstance.opened ?? false;
  }

  get hamburgerMenuButton(): DebugElement {
    return this.getElement('#hamburger-menu-button');
  }

  get sfLogoButton(): DebugElement {
    return this.getElement('#sf-logo-button');
  }

  get currentUserDoc(): UserDoc {
    return this.realtimeService.get(UserDoc.COLLECTION, 'user01');
  }

  setCurrentUser(userId: string): void {
    when(mockedUserService.currentUserId).thenReturn(userId);
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, userId, FETCH_WITHOUT_SUBSCRIBE)
    );
  }

  triggerLogin(): void {
    this.setCurrentUser('user01');
    this.loggedInState$.next({ loggedIn: true, newlyLoggedIn: false, anonymousUser: false });
    this.wait();
  }

  goFullyOffline(): void {
    this.setBrowserOnlineStatus(false);
    this.setWebSocketOnlineStatus(false);
  }

  goFullyOnline(): void {
    this.setBrowserOnlineStatus(true);
    this.setWebSocketOnlineStatus(true);
  }

  setBrowserOnlineStatus(status: boolean): void {
    this.testOnlineStatusService.setIsOnline(status);
  }

  setWebSocketOnlineStatus(status: boolean): void {
    this.testOnlineStatusService.setRealtimeServerSocketIsOnline(status);
  }

  init(): void {
    this.component.openDrawer();
    this.wait();
  }

  navigate(commands: any[]): void {
    this.ngZone.run(() => this.router.navigate(commands)).then();
  }

  navigateFully(commands: any[]): void {
    this.ngZone.run(() => this.router.navigate(commands)).then();
    flush();
    this.fixture.detectChanges();
    flush();
  }

  click(element: DebugElement): void {
    element.nativeElement.click();
    tick();
    this.fixture.detectChanges();
    flush();
  }

  clickEditDisplayName(): void {
    this.editNameButton.nativeElement.click();
    tick();
    this.fixture.detectChanges();
  }

  wait(): void {
    this.fixture.detectChanges();
    flush(70);
    this.fixture.detectChanges();
    flush(70);
  }

  deleteProject(projectId: string, isLocal: boolean): void {
    if (isLocal) {
      when(mockedUserService.currentProjectId(anything())).thenReturn(undefined);
    }
    this.ngZone.run(() => {
      const projectDoc = this.realtimeService.get(SFProjectProfileDoc.COLLECTION, projectId);
      projectDoc.delete();
    });
    this.wait();
  }

  removeUserFromProject(projectId: string): void {
    const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(op => op.unset<string>(p => p.userRoles['user01']), false);
    this.wait();
  }

  updatePreTranslate(projectId: string): void {
    const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(op => op.set<boolean>(p => p.translateConfig.preTranslate, true), false);
    this.wait();
  }

  addUserToProject(projectId: string): void {
    const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(op => op.set<string>(p => p.userRoles['user01'], SFProjectRole.CommunityChecker), false);
    this.currentUserDoc.submitJson0Op(op => op.add<string>(u => u.sites['sf'].projects, 'project04'), false);
    this.wait();
  }

  changeUserRole(projectId: string, userId: string, role: SFProjectRole): void {
    const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(op => op.set<string>(p => p.userRoles[userId], role), false);
    this.wait();
  }

  showHideUserMenu(): void {
    this.avatarIcon.nativeElement.click();
    this.wait();
  }

  private addUser(userId: string, name: string, authId: string, systemRole: SystemRole = SystemRole.User): void {
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: userId,
      data: createTestUser({
        name,
        authId,
        roles: [systemRole],
        sites: {
          sf: {
            projects: ['project01', 'project02', 'project03']
          }
        }
      })
    });
  }

  private addProject(projectId: string, userRoles: { [userRef: string]: string }, texts: TextInfo[]): void {
    this.realtimeService.addSnapshot<SFProject>(SFProjectProfileDoc.COLLECTION, {
      id: projectId,
      data: createTestProject({
        name: projectId,
        paratextId: projectId,
        shortName: projectId,
        userRoles,
        texts,
        paratextUsers: paratextUsersFromRoles(userRoles)
      })
    });
  }

  private addProjectUserConfig(projectId: string, userId: string): void {
    const projectUserConfigId = `${projectId}:${userId}`;
    this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
      id: projectUserConfigId,
      data: createTestProjectUserConfig({ ownerRef: userId, projectRef: projectId, selectedTask: 'checking' })
    });
  }

  private getElement(query: string): DebugElement {
    return this.fixture.debugElement.query(By.css(query));
  }
}
