import { CommonModule, Location } from '@angular/common';
import { Component, DebugElement, NgModule, NgZone } from '@angular/core';
import { ComponentFixture, TestBed, discardPeriodicTasks, fakeAsync, flush, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Route, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { CookieService } from 'ngx-cookie-service';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { Question, getQuestionDocId } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { BehaviorSubject, Subject } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { AuthService, LoginResult } from 'xforge-common/auth.service';
import { AvatarTestingModule } from 'xforge-common/avatar/avatar-testing.module';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { FeatureFlagService, ObservableFeatureFlag } from 'xforge-common/feature-flags/feature-flag.service';
import { FileService } from 'xforge-common/file.service';
import { LocationService } from 'xforge-common/location.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { PwaService } from 'xforge-common/pwa.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { TestTranslocoModule, configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { environment } from '../environments/environment';
import { AppComponent, CONNECT_PROJECT_OPTION } from './app.component';
import { CheckingQuestionsService } from './checking/checking/checking-questions.service';
import { QuestionDoc } from './core/models/question-doc';
import { SFProjectProfileDoc } from './core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from './core/models/sf-type-registry';
import { PermissionsService } from './core/permissions.service';
import { SFProjectService } from './core/sf-project.service';
import { NavigationProjectSelectorComponent } from './navigation-project-selector/navigation-project-selector.component';
import { NmtDraftAuthGuard, SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from './shared/project-router.guard';
import { paratextUsersFromRoles } from './shared/test-utils';

const mockedAuthService = mock(AuthService);
const mockedUserService = mock(UserService);
const mockedSettingsAuthGuard = mock(SettingsAuthGuard);
const mockedSyncAuthGuard = mock(SyncAuthGuard);
const mockedNmtDraftAuthGuard = mock(NmtDraftAuthGuard);
const mockedUsersAuthGuard = mock(UsersAuthGuard);
const mockedSFProjectService = mock(SFProjectService);
const mockedQuestionsService = mock(CheckingQuestionsService);
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
    declarations: [AppComponent, MockComponent],
    imports: [
      AvatarTestingModule,
      DialogTestModule,
      UICommonModule,
      NoopAnimationsModule,
      RouterTestingModule.withRoutes(ROUTES),
      TestTranslocoModule,
      TestOnlineStatusModule.forRoot(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      NavigationProjectSelectorComponent
    ],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: UserService, useMock: mockedUserService },
      { provide: SettingsAuthGuard, useMock: mockedSettingsAuthGuard },
      { provide: SyncAuthGuard, useMock: mockedSyncAuthGuard },
      { provide: NmtDraftAuthGuard, useMock: mockedNmtDraftAuthGuard },
      { provide: UsersAuthGuard, useMock: mockedUsersAuthGuard },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: CheckingQuestionsService, useMock: mockedQuestionsService },
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: LocationService, useMock: mockedLocationService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: PwaService, useMock: mockedPwaService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: FeatureFlagService, useMock: mockedFeatureFlagService },
      { provide: FileService, useMock: mockedFileService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService },
      { provide: DialogService, useMock: mockedDialogService },
      { provide: PermissionsService, useMock: mockedPermissions }
    ]
  }));

  afterEach(fakeAsync(() => {
    discardPeriodicTasks();
  }));

  it('navigate to last project', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
    when(mockedPermissions.canAccessTranslate(anything())).thenReturn(false);
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project01');
    expect(env.menuLength).toEqual(5);
    verify(mockedUserService.setCurrentProjectId(anything(), 'project01')).once();
  }));

  it('navigate to different project', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
    when(mockedPermissions.canAccessTranslate(anything())).thenReturn(false);
    env.navigate(['/projects', 'project02']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project02');
    // Expect: Community Checking | Overview | Sync | Settings | Users
    expect(env.menuLength).toEqual(5);
    expect(env.component.isCheckingEnabled).toEqual(true);
    expect(env.component.isTranslateEnabled).toEqual(false);
    verify(mockedUserService.setCurrentProjectId(anything(), 'project02')).once();
  }));

  it('hide translate tool for community checkers', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
    when(mockedPermissions.canAccessTranslate(anything())).thenReturn(false);
    env.navigate(['/projects', 'project03']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project03');
    // Expect: Community Checking | Overview | Synchronize | Settings | Users
    expect(env.menuLength).toEqual(5);
    expect(env.component.isCheckingEnabled).toEqual(true);
    expect(env.component.isTranslateEnabled).toEqual(false);
    verify(mockedUserService.setCurrentProjectId(anything(), 'project03')).once();

    // Does not collapse Community Checking item when translate is disabled
    env.selectItem(0);
    // Expect: Community Checking | Overview | Synchronize | Settings | Users
    expect(env.menuLength).toEqual(5);
  }));

  it('hides generate draft when user does not have access', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
    when(mockedPermissions.canAccessTranslate(anything())).thenReturn(true);
    when(mockedFeatureFlagService.showNmtDrafting).thenReturn({ enabled: true } as ObservableFeatureFlag);
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.component.isTranslateEnabled).toBe(true);
    // Expect: Translate | Community Checking | Synchronize | Settings | Users
    expect(env.menuLength).toEqual(5);
    env.selectItem(0);
    // Expect: Translate | Overview | Generate | Matthew | Mark | Community Checking | Synchronize | Settings | Users
    expect(env.menuLength).toEqual(9);
    env.allowUserToSeeGenerateDraft(false);
    // Expect: Translate | Overview | Matthew | Mark | Community Checking | Synchronize | Settings | Users
    expect(env.menuLength).toEqual(8);
  }));

  it('hides community checking tool from commenters', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(false);
    when(mockedPermissions.canAccessTranslate(anything())).thenReturn(true);
    env.setCurrentUser('user04');
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.selectedProjectId).toEqual('project01');
    expect(env.isDrawerVisible).toEqual(true);
    expect(env.component.isTranslateEnabled).toEqual(true);
    expect(env.component.isCheckingEnabled).toEqual(false);
  }));

  it('expand/collapse tool', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
    when(mockedPermissions.canAccessTranslate(anything())).thenReturn(true);
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project01');
    env.selectItem(0);
    expect(env.menuLength).toEqual(8);
    env.selectItem(0);
    expect(env.menuLength).toEqual(5);
  }));

  it('Translate item is never collapsed when Community Checking is disabled', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
    when(mockedPermissions.canAccessTranslate(anything())).thenReturn(true);
    env.navigate(['/projects', 'project01']);
    env.init();
    // Expect: Translate | Community Checking | Synchronize | Settings | Users
    expect(env.menuLength).toEqual(5);
    const projectDoc = env.component.projectDocs![0];
    projectDoc.submitJson0Op(op => op.set<boolean>(p => p.checkingConfig.checkingEnabled, false));
    when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(false);
    env.wait();
    // Expect: Translate | Overview | Matthew | Mark | Synchronize | Settings | Users
    expect(env.menuLength).toEqual(7);
    // No affect when clicking Translate
    env.selectItem(0);
    expect(env.menuLength).toEqual(7);
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
  }));

  it('user added to project after init', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects']);
    env.init();

    env.addUserToProject('project04');
    env.navigate(['/projects', 'project04']);
    expect(env.component.isTranslateEnabled).toBe(false);
    env.wait();
    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project04');
  }));

  it('should only display Sync, Settings and Users for admin', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project02']);
    env.init();
    // SUT 1
    env.allowUserToSeeSettings(false);
    env.allowUserToSeeUsers(false);
    env.allowUserToSync(false);
    expect(env.someMenuItemContains('Synchronize')).toBeFalse();
    expect(env.someMenuItemContains('Settings')).toBeFalse();
    expect(env.someMenuItemContains('Users')).toBeFalse();
    // SUT 2
    env.allowUserToSeeSettings();
    env.allowUserToSeeUsers();
    env.allowUserToSync();
    expect(env.someMenuItemContains('Synchronize')).toBeTrue();
    expect(env.someMenuItemContains('Settings')).toBeTrue();
    expect(env.someMenuItemContains('Users')).toBeTrue();
  }));

  it('should only display Settings if this is the only one specified', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project02']);
    env.init();
    // SUT 1
    env.allowUserToSeeSettings(false);
    env.allowUserToSeeUsers(false);
    env.allowUserToSync(false);
    expect(env.someMenuItemContains('Synchronize')).toBeFalse();
    expect(env.someMenuItemContains('Settings')).toBeFalse();
    expect(env.someMenuItemContains('Users')).toBeFalse();
    // SUT 2
    env.allowUserToSeeSettings(true);
    env.allowUserToSeeUsers(false);
    env.allowUserToSync(false);
    expect(env.someMenuItemContains('Synchronize')).toBeFalse();
    expect(env.someMenuItemContains('Settings')).toBeTrue();
    expect(env.someMenuItemContains('Users')).toBeFalse();
  }));

  it('should only display Sync if this is the only one specified', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project02']);
    env.init();
    // SUT 1
    env.allowUserToSeeSettings(false);
    env.allowUserToSeeUsers(false);
    env.allowUserToSync(false);
    expect(env.someMenuItemContains('Synchronize')).toBeFalse();
    expect(env.someMenuItemContains('Settings')).toBeFalse();
    expect(env.someMenuItemContains('Users')).toBeFalse();
    // SUT 2
    env.allowUserToSeeSettings(false);
    env.allowUserToSeeUsers(false);
    env.allowUserToSync(true);
    expect(env.someMenuItemContains('Synchronize')).toBeTrue();
    expect(env.someMenuItemContains('Settings')).toBeFalse();
    expect(env.someMenuItemContains('Users')).toBeFalse();
  }));

  it('should only display Users if this is the only one specified', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project02']);
    env.init();
    // SUT 1
    env.allowUserToSeeSettings(false);
    env.allowUserToSeeUsers(false);
    env.allowUserToSync(false);
    expect(env.someMenuItemContains('Synchronize')).toBeFalse();
    expect(env.someMenuItemContains('Settings')).toBeFalse();
    expect(env.someMenuItemContains('Users')).toBeFalse();
    // SUT 2
    env.allowUserToSeeSettings(false);
    env.allowUserToSeeUsers(true);
    env.allowUserToSync(false);
    expect(env.someMenuItemContains('Synchronize')).toBeFalse();
    expect(env.someMenuItemContains('Settings')).toBeFalse();
    expect(env.someMenuItemContains('Users')).toBeTrue();
  }));

  it('user data is set for Bugsnag', fakeAsync(() => {
    const env = new TestEnvironment();
    env.init();

    verify(mockedErrorReportingService.addMeta(anything(), 'user')).once();
    expect().nothing();
  }));

  it('isLive is available (for template)', fakeAsync(() => {
    environment.releaseStage = 'dev';
    const env = new TestEnvironment();
    env.init();
    expect(env.component.isLive).toEqual(false);

    environment.releaseStage = 'qa';
    expect(env.component.isLive).toEqual(false);

    environment.releaseStage = 'live';
    expect(env.component.isLive).toEqual(true);
    environment.releaseStage = 'dev';
  }));

  it('indicates when the last sync failed', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    env.setLastSyncSuccessful('project01', true);
    // SUT 1
    expect(env.lastSyncFailedBadgeIsPresent).toBeFalse();

    env.setLastSyncSuccessful('project01', false);
    // SUT 2
    expect(env.lastSyncFailedBadgeIsPresent).toBeTrue();
  }));

  it('add spin class to sync icon when in progress', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.syncInProgressClassIsPresent).toBeFalse();
    env.setFakeSyncInProgress('project01', true);
    // SUT 1
    expect(env.syncInProgressClassIsPresent).toBeTrue();

    env.setFakeSyncInProgress('project01', false);
    // SUT 2
    expect(env.syncInProgressClassIsPresent).toBeFalse();
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

  it('should continue init if login state changes', fakeAsync(() => {
    const env = new TestEnvironment('online', false);
    expect(env.component.isLoggedIn).toBeFalse();
    expect(env.component.canSeeSettings$).toBeUndefined();
    expect(env.component.canSeeUsers$).toBeUndefined();
    expect(env.component.canSync$).toBeUndefined();
    expect(env.component.canSeeAdminPages$).toBeUndefined();

    env.triggerLogin();
    expect(env.component.isLoggedIn).toBeTrue();
    expect(env.component.canSeeSettings$).toBeDefined();
    expect(env.component.canSeeUsers$).toBeDefined();
    expect(env.component.canSync$).toBeDefined();
    expect(env.component.canSeeAdminPages$).toBeDefined();
  }));

  describe('Community Checking', () => {
    it('no books showing in the menu', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
      when(mockedPermissions.canAccessTranslate(anything())).thenReturn(false);
      env.navigate(['/projects', 'project02']);
      env.init();

      expect(env.isDrawerVisible).toEqual(true);
      expect(env.selectedProjectId).toEqual('project02');
      expect(env.component.isCheckingEnabled).toEqual(true);
      env.selectItem(0);
      // Expect: Community Checking | Overview | Synchronize | Settings | Users
      expect(env.menuLength).toEqual(5);
    }));

    it('only show one book in the menu', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
      when(mockedPermissions.canAccessTranslate(anything())).thenReturn(false);
      env.navigate(['/projects', 'project02']);
      env.init();

      expect(env.isDrawerVisible).toEqual(true);
      expect(env.selectedProjectId).toEqual('project02');
      expect(env.component.isCheckingEnabled).toEqual(true);
      env.selectItem(0);
      // Expect: Community Checking | Overview | Synchronize | Settings | Users
      expect(env.menuLength).toEqual(5);
      env.remoteAddQuestion(env.questions[0]);
      // Expect: Community Checking | Overview | John | Synchronize | Settings | Users
      expect(env.menuLength).toEqual(6);
    }));

    it('All Questions displays in the menu', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
      when(mockedPermissions.canAccessTranslate(anything())).thenReturn(false);
      env.navigate(['/projects', 'project02']);
      env.init();

      expect(env.isDrawerVisible).toEqual(true);
      expect(env.selectedProjectId).toEqual('project02');
      expect(env.component.isCheckingEnabled).toEqual(true);
      env.selectItem(0);
      // Expect: Community Checking | Overview | Synchronize | Settings | Users
      expect(env.menuLength).toEqual(5);
      env.remoteAddQuestion(env.questions[0]);
      env.remoteAddQuestion(env.questions[1]);
      // Expect: Community Checking | Overview | All Questions | Luke | John | Synchronize | Settings | Users
      expect(env.menuLength).toEqual(8);
      expect(env.menuListItems[2].nativeElement.textContent).toContain('All Questions');
    }));

    it('books displayed in canonical order', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
      when(mockedPermissions.canAccessTranslate(anything())).thenReturn(false);
      env.navigate(['/projects', 'project02']);
      env.init();

      expect(env.component.isCheckingEnabled).toBe(true);
      env.selectItem(0);
      env.remoteAddQuestion(env.questions[0]);
      env.remoteAddQuestion(env.questions[1]);
      // Expect: Community Checking | Overview | All Questions | Luke | John | Synchronize | Settings | Users
      expect(env.menuLength).toEqual(8);
      // Books should be sorted in canonical order
      expect(env.getMenuItemText(3)).toContain('Luke');
      expect(env.getMenuItemText(4)).toContain('John');
    }));

    it('update books when question added/archived/unarchived locally', fakeAsync(() => {
      const env = new TestEnvironment();
      when(mockedPermissions.canAccessCommunityChecking(anything())).thenReturn(true);
      when(mockedPermissions.canAccessTranslate(anything())).thenReturn(false);
      env.navigate(['/projects', 'project02']);
      env.init();

      expect(env.isDrawerVisible).toEqual(true);
      expect(env.selectedProjectId).toEqual('project02');
      expect(env.component.isCheckingEnabled).toEqual(true);
      env.selectItem(0);
      // Expect: Community Checking | Overview | Synchronize | Settings | Users
      expect(env.menuLength).toEqual(5);

      env.localAddQuestion(env.questions[0]);
      // Expect: Community Checking | Overview | John | Synchronize | Settings | Users
      expect(env.menuLength).toEqual(6);

      env.localSetIsArchived(env.questions[0], true);
      // Expect: Community Checking | Overview | Synchronize | Settings | Users
      expect(env.menuLength).toEqual(5);

      env.localSetIsArchived(env.questions[0], false);
      // Expect: Community Checking | Overview | John | Synchronize | Settings | Users
      expect(env.menuLength).toEqual(6);
    }));

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

      env.avatarIcon.nativeElement.click();
      env.wait();
      expect(env.userMenu).not.toBeNull();
      env.clickEditDisplayName();
      verify(mockedUserService.editDisplayName(false)).once();
    }));

    it('shows message when edit name button clicked while offline', fakeAsync(() => {
      const env = new TestEnvironment('offline');
      env.setCurrentUser('user02');
      env.init();

      env.avatarIcon.nativeElement.click();
      env.wait();
      expect(env.userMenu).not.toBeNull();
      expect(env.editNameButton).not.toBeNull();
      env.clickEditDisplayName();
      verify(mockedNoticeService.show(anything())).once();
      verify(mockedUserService.editDisplayName(anything())).never();
    }));
  });
});

@NgModule({
  imports: [CommonModule, UICommonModule, TestTranslocoModule]
})
class DialogTestModule {}

class TestEnvironment {
  readonly component: AppComponent;
  readonly fixture: ComponentFixture<AppComponent>;
  readonly router: Router;
  readonly location: Location;
  readonly questions: Question[];
  readonly ngZone: NgZone;
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
  private browserOnline$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  private webSocketOnline$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);

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

    this.realtimeService.addSnapshots<Question>(QuestionDoc.COLLECTION, []);
    when(mockedQuestionsService.queryQuestions(anything(), anything())).thenCall((_projectId, options) => {
      const parameters: QueryParameters = {};
      if (options.bookNum != null) parameters[obj<Question>().pathStr(q => q.verseRef.bookNum)] = options.bookNum;
      if (options.activeOnly) parameters[obj<Question>().pathStr(q => q.isArchived)] = false;
      return this.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, parameters);
    });

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
    when(mockedAuthService.isLoggedIn).thenCall(() => this.loggedInState$.getValue().loggedIn);
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
    when(mockedFeatureFlagService.showNmtDrafting).thenReturn({ enabled: false } as ObservableFeatureFlag);
    when(mockedFeatureFlagService.showFeatureFlags).thenReturn({ enabled: false } as ObservableFeatureFlag);
    when(mockedFeatureFlagService.stillness).thenReturn({ enabled: false } as ObservableFeatureFlag);
    when(mockedFeatureFlagService.showNonPublishedLocalizations).thenReturn({
      enabled: false
    } as ObservableFeatureFlag);
    when(mockedFileService.notifyUserIfStorageQuotaBelow(anything())).thenResolve();
    when(mockedPwaService.hasUpdate$).thenReturn(this.hasUpdate$);

    this.router = TestBed.inject(Router);
    this.location = TestBed.inject(Location);
    this.ngZone = TestBed.inject(NgZone);
    this.fixture = TestBed.createComponent(AppComponent);
    this.component = this.fixture.componentInstance;
    this.ngZone.run(() => this.router.initialNavigation());

    this.questions = [
      {
        dataId: objectId(),
        ownerRef: 'u01',
        projectRef: 'project02',
        text: 'Question in book of John',
        answers: [],
        verseRef: { bookNum: 43, chapterNum: 1, verseNum: 10, verse: '10-11' },
        isArchived: false,
        dateCreated: '',
        dateModified: ''
      },
      {
        dataId: objectId(),
        ownerRef: 'u01',
        projectRef: 'project02',
        text: 'Question in book of Luke',
        answers: [],
        verseRef: { bookNum: 42, chapterNum: 1, verseNum: 10, verse: '1-2' },
        isArchived: false,
        dateCreated: '',
        dateModified: ''
      }
    ];
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

  get navBar(): DebugElement {
    return this.fixture.debugElement.query(By.css('mat-toolbar'));
  }

  get avatarIcon(): DebugElement {
    return this.navBar.query(By.css('app-avatar'));
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

  get syncInProgressClassIsPresent(): boolean {
    const iconIfClassSet = this.menuDrawer.query(By.css('#sync-icon.sync-in-progress'));
    return iconIfClassSet != null;
  }

  get lastSyncFailedBadgeIsPresent(): boolean {
    const iconIfBadgeHidden = this.menuDrawer.query(By.css('#sync-icon.mat-badge-hidden'));
    return iconIfBadgeHidden == null;
  }

  getMenuItemText(index: number): string {
    return this.menuListItems[index].nativeElement.textContent;
  }

  getMenuItemContaining(substring: string): DebugElement | undefined {
    return this.menuListItems.find((item: DebugElement) => item.nativeElement.innerText.includes(substring));
  }

  setCurrentUser(userId: string): void {
    when(mockedUserService.currentUserId).thenReturn(userId);
    when(mockedUserService.getCurrentUser()).thenCall(() => this.realtimeService.subscribe(UserDoc.COLLECTION, userId));
  }

  someMenuItemContains(substring: string): boolean {
    return this.getMenuItemContaining(substring) !== undefined;
  }

  remoteAddQuestion(newQuestion: Question): void {
    const docId = getQuestionDocId(newQuestion.projectRef, newQuestion.dataId);
    this.realtimeService.addSnapshot(QuestionDoc.COLLECTION, {
      id: docId,
      data: newQuestion
    });
    this.realtimeService.updateAllSubscribeQueries();
    this.wait();
  }

  triggerLogin(): void {
    this.loggedInState$.next({ loggedIn: true, newlyLoggedIn: false, anonymousUser: false });
    this.wait();
  }

  localAddQuestion(newQuestion: Question): void {
    const docId = getQuestionDocId(newQuestion.projectRef, newQuestion.dataId);
    this.realtimeService.create(QuestionDoc.COLLECTION, docId, newQuestion);
    this.wait();
  }

  localSetIsArchived(question: Question, isArchived: boolean): void {
    const questionDoc = this.realtimeService.get<QuestionDoc>(
      QuestionDoc.COLLECTION,
      getQuestionDocId(question.projectRef, question.dataId)
    );
    questionDoc.submitJson0Op(ops => ops.set(q => q.isArchived, isArchived));
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

  allowUserToSeeSettings(canSeeSettings: boolean = true): void {
    this.canSeeSettings$.next(canSeeSettings);
    this.fixture.detectChanges();
    tick();
  }

  allowUserToSeeUsers(canSeeUsers: boolean = true): void {
    this.canSeeUsers$.next(canSeeUsers);
    this.fixture.detectChanges();
    tick();
  }

  allowUserToSync(canSync: boolean = true): void {
    this.canSync$.next(canSync);
    this.fixture.detectChanges();
    tick();
  }

  allowUserToSeeGenerateDraft(canSeeGenerateDraft: boolean = true): void {
    this.canSeeGenerateDraft$.next(canSeeGenerateDraft);
    this.fixture.detectChanges();
    tick();
  }

  navigate(commands: any[]): void {
    this.ngZone.run(() => this.router.navigate(commands)).then();
  }

  selectItem(index: number): void {
    const elem = this.menuListItems[index].nativeElement;
    elem.click();
    this.wait();
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

  setFakeSyncInProgress(projectId: string, inProgress: boolean): void {
    const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(op => op.set<number>(p => p.sync.queuedCount!, inProgress ? 1 : 0));
    this.wait();
  }

  setLastSyncSuccessful(projectId: string, lastSyncSuccessful: boolean): void {
    const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(op => op.set<boolean>(p => p.sync.lastSyncSuccessful!, lastSyncSuccessful));
    this.wait();
  }

  addUserToProject(projectId: string): void {
    const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(op => op.set<string>(p => p.userRoles['user01'], SFProjectRole.CommunityChecker), false);
    this.currentUserDoc.submitJson0Op(op => op.add<string>(u => u.sites['sf'].projects, 'project04'), false);
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
