import { Location } from '@angular/common';
import { Component, DebugElement, NgZone } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
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
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { BehaviorSubject, Subject } from 'rxjs';
import { anything, capture, mock, verify, when } from 'ts-mockito';
import { AuthService, LoginResult } from 'xforge-common/auth.service';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { createTestFeatureFlag, FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { FileService } from 'xforge-common/file.service';
import { LocationService } from 'xforge-common/location.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { PWA_BEFORE_PROMPT_CAN_BE_SHOWN_AGAIN, PwaService } from 'xforge-common/pwa.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { AppComponent, CONNECT_PROJECT_OPTION } from './app.component';
import { SFProjectProfileDoc } from './core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from './core/models/sf-type-registry';
import { PermissionsService } from './core/permissions.service';
import { SFProjectService } from './core/sf-project.service';
import { NavigationProjectSelectorComponent } from './navigation-project-selector/navigation-project-selector.component';
import { NavigationComponent } from './navigation/navigation.component';
import { NmtDraftAuthGuard, SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from './shared/project-router.guard';
import { paratextUsersFromRoles } from './shared/test-utils';

const mockedAuthService = mock(AuthService);
const mockedUserService = mock(UserService);
const mockedSettingsAuthGuard = mock(SettingsAuthGuard);
const mockedSyncAuthGuard = mock(SyncAuthGuard);
const mockedNmtDraftAuthGuard = mock(NmtDraftAuthGuard);
const mockedUsersAuthGuard = mock(UsersAuthGuard);
const mockedSFProjectService = mock(SFProjectService);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
const mockedLocationService = mock(LocationService);
const mockedNoticeService = mock(NoticeService);
const mockedPwaService = mock(PwaService);
const mockedFileService = mock(FileService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedDialogService = mock(DialogService);
const mockedFeatureFlagService = mock(FeatureFlagService);
const mockedPermissions = mock(PermissionsService);

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
  { path: 'connect-project', component: MockComponent }
];

describe('AppComponent', () => {
  configureTestingModule(() => ({
    declarations: [AppComponent, MockComponent, NavigationComponent],
    imports: [
      UICommonModule,
      NoopAnimationsModule,
      RouterModule.forRoot(ROUTES),
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      NavigationProjectSelectorComponent,
      AvatarComponent
    ],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: UserService, useMock: mockedUserService },
      { provide: SettingsAuthGuard, useMock: mockedSettingsAuthGuard },
      { provide: SyncAuthGuard, useMock: mockedSyncAuthGuard },
      { provide: UsersAuthGuard, useMock: mockedUsersAuthGuard },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: LocationService, useMock: mockedLocationService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: FeatureFlagService, useMock: mockedFeatureFlagService },
      { provide: FileService, useMock: mockedFileService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService },
      { provide: DialogService, useMock: mockedDialogService }
    ]
  }));

  it('navigate to last project', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
    when(mockedPermissions.canAccessTranslate(anything())).thenReturn(false);
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
    when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
    when(mockedPermissions.canAccessTranslate(anything())).thenReturn(false);
    env.navigate(['/projects', 'project02']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project02');
    // Expect: Community Checking | Manage Questions | Overview | Sync | Settings | Users
    expect(env.menuLength).toEqual(6);
    verify(mockedUserService.setCurrentProjectId(anything(), 'project02')).once();
  }));

  it('change project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project01');
    env.selectProject('project02');
    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project02');
    expect(env.location.path()).toEqual('/projects/project02');
    verify(mockedUserService.setCurrentProjectId(anything(), 'project02')).once();
  }));

  it('connect project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project01');
    env.selectProject(CONNECT_PROJECT_OPTION);
    expect(env.isDrawerVisible).toEqual(false);
    expect(env.location.path()).toEqual('/connect-project');
  }));

  it('close menu when navigating to a non-project route', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/my-account']);
    env.init();

    expect(env.isDrawerVisible).toEqual(false);
    expect(env.component.selectedProjectId).toBeUndefined();
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
    const env = new TestEnvironment();
    env.deleteProject('project01', false);
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(false);
    verify(mockedUserService.setCurrentProjectId(anything(), undefined)).once();
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

  it('user added to project after init', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects']);
    env.init();

    env.addUserToProject('project04');
    env.navigate(['/projects', 'project04']);
    env.wait();
    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project04');
  }));

  it('user data is set for Bugsnag', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();

    verify(mockedErrorReportingService.addMeta(anything(), 'user')).once();
    // The first call sets the locale, the second sets the user
    const [metadata] = capture(mockedErrorReportingService.addMeta).second();
    expect(metadata['id']).toEqual('user01');
  }));

  it('checks online auth status when browser comes online but app is not fully online', fakeAsync(() => {
    const env = new TestEnvironment('offline');
    env.init();

    expect(env.component.isAppOnline).toBe(false);
    verify(mockedAuthService.checkOnlineAuth()).never();

    env.setBrowserOnlineStatus(true);
    tick();
    expect(env.component.isAppOnline).toBe(false);
    verify(mockedAuthService.checkOnlineAuth()).once();
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
  });
});

class TestEnvironment {
  readonly component: AppComponent;
  readonly fixture: ComponentFixture<AppComponent>;
  readonly router: Router;
  readonly location: Location;
  // readonly questions: Question[];
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

    when(mockedSFProjectService.getProfile(anything())).thenCall(projectId =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, projectId)
    );
    when(mockedAuthService.currentUserRoles).thenReturn([]);
    when(mockedAuthService.isLoggedIn).thenCall(() => Promise.resolve(this.loggedInState$.getValue().loggedIn));
    when(mockedAuthService.loggedInState$).thenReturn(this.loggedInState$);
    this.setCurrentUser('user01');
    when(mockedUserService.currentProjectId(anything())).thenReturn('project01');
    when(mockedSettingsAuthGuard.allowTransition(anything())).thenReturn(this.canSeeSettings$);
    when(mockedSyncAuthGuard.allowTransition(anything())).thenReturn(this.canSync$);
    when(mockedNmtDraftAuthGuard.allowTransition(anything())).thenReturn(this.canSeeGenerateDraft$);
    when(mockedUsersAuthGuard.allowTransition(anything())).thenReturn(this.canSeeUsers$);
    when(mockedCookieService.get(anything())).thenReturn('en');
    new Promise<void>(resolve => {
      this.comesOnline$.subscribe(() => resolve());
    });

    if (initialConnectionStatus === 'offline') {
      this.goFullyOffline();
    } else {
      this.comesOnline$.next();
      this.goFullyOnline();
    }
    when(mockedFeatureFlagService.showNmtDrafting).thenReturn(createTestFeatureFlag(false));
    when(mockedFeatureFlagService.allowForwardTranslationNmtDrafting).thenReturn(createTestFeatureFlag(false));
    when(mockedFeatureFlagService.showFeatureFlags).thenReturn(createTestFeatureFlag(false));
    when(mockedFeatureFlagService.stillness).thenReturn(createTestFeatureFlag(false));
    when(mockedFeatureFlagService.showNonPublishedLocalizations).thenReturn(createTestFeatureFlag(false));
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
    return this.fixture.debugElement.queryAll(By.css('#menu-drawer .mat-list-item'));
  }

  get userMenu(): DebugElement {
    return this.fixture.debugElement.query(By.css('.user-menu'));
  }

  get editNameButton(): DebugElement {
    return this.userMenu.query(By.css('#edit-name-btn'));
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
    return this.navBar.query(By.css('.update-banner .mat-raised-button'));
  }

  get selectedProjectId(): string {
    return this.component.selectedProjectId!;
  }

  get menuLength(): number {
    return this.menuListItems.length;
  }

  get isDrawerVisible(): boolean {
    return this.menuDrawer != null;
  }

  get currentUserDoc(): UserDoc {
    return this.realtimeService.get(UserDoc.COLLECTION, 'user01');
  }

  setCurrentUser(userId: string): void {
    when(mockedUserService.currentUserId).thenReturn(userId);
    when(mockedUserService.getCurrentUser()).thenCall(() => this.realtimeService.subscribe(UserDoc.COLLECTION, userId));
  }

  triggerLogin(): void {
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

  selectProject(projectId: string): void {
    this.ngZone.run(() => {
      this.component.projectChanged(projectId);
    });
    this.wait();
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

  addUserToProject(projectId: string): void {
    const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(op => op.set<string>(p => p.userRoles['user01'], SFProjectRole.CommunityChecker), false);
    this.currentUserDoc.submitJson0Op(op => op.add<string>(u => u.sites['sf'].projects, 'project04'), false);
    this.wait();
  }

  showHideUserMenu(): void {
    this.avatarIcon.nativeElement.click();
    this.wait();
  }

  private addUser(userId: string, name: string, authId: string): void {
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: userId,
      data: createTestUser({
        name,
        authId,
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
}
