import { MdcDialog, MdcDialogRef } from '@angular-mdc/web';
import { CommonModule, Location } from '@angular/common';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { Component, DebugElement, NgModule, NgZone } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Route, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { CookieService } from 'ngx-cookie-service';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { CheckingShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { getQuestionDocId, Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TranslateShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { AvatarTestingModule } from 'xforge-common/avatar/avatar-testing.module';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { FileService } from 'xforge-common/file.service';
import { LocationService } from 'xforge-common/location.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { environment } from '../environments/environment';
import { AppComponent, CONNECT_PROJECT_OPTION } from './app.component';
import { QuestionDoc } from './core/models/question-doc';
import { SFProjectProfileDoc } from './core/models/sf-project-profile-doc';
import { SF_TYPE_REGISTRY } from './core/models/sf-type-registry';
import { SFProjectService } from './core/sf-project.service';
import { ProjectDeletedDialogComponent } from './project-deleted-dialog/project-deleted-dialog.component';
import { SettingsAuthGuard, SyncAuthGuard, UsersAuthGuard } from './shared/project-router.guard';
import { paratextUsersFromRoles } from './shared/test-utils';

const mockedAuthService = mock(AuthService);
const mockedUserService = mock(UserService);
const mockedSettingsAuthGuard = mock(SettingsAuthGuard);
const mockedSyncAuthGuard = mock(SyncAuthGuard);
const mockedUsersAuthGuard = mock(UsersAuthGuard);
const mockedSFProjectService = mock(SFProjectService);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
const mockedLocationService = mock(LocationService);
const mockedNoticeService = mock(NoticeService);
const mockedPwaService = mock(PwaService);
const mockedFileService = mock(FileService);
const mockedErrorReportingService = mock(ErrorReportingService);
const mockedMdcDialog = mock(MdcDialog);

@Component({
  template: `<div>Mock</div>`
})
class MockComponent {}

const ROUTES: Route[] = [
  { path: 'projects/:projectId/settings', component: MockComponent },
  { path: 'projects/:projectId', component: MockComponent },
  { path: 'projects/:projectId/translate/:bookId', component: MockComponent },
  { path: 'projects/:projectId/translate', component: MockComponent },
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
      HttpClientTestingModule,
      UICommonModule,
      RouterTestingModule.withRoutes(ROUTES),
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
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
      { provide: FileService, useMock: mockedFileService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService },
      { provide: MdcDialog, useMock: mockedMdcDialog }
    ]
  }));

  it('navigate to last project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project01');
    expect(env.menuLength).toEqual(5);
    verify(mockedUserService.setCurrentProjectId('project01')).once();
  }));

  it('navigate to different project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project02']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project02');
    // Expect: Community Checking | Overview | Sync | Settings | Users
    expect(env.menuLength).toEqual(5);
    expect(env.component.isCheckingEnabled).toEqual(true);
    expect(env.component.isTranslateEnabled).toEqual(false);
    verify(mockedUserService.setCurrentProjectId('project02')).once();
  }));

  it('hide translate tool for community checkers', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project03']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project03');
    // Expect: Community Checking | Overview | Synchronize | Settings | Users
    expect(env.menuLength).toEqual(5);
    expect(env.component.isCheckingEnabled).toEqual(true);
    expect(env.component.isTranslateEnabled).toEqual(false);
    verify(mockedUserService.setCurrentProjectId('project03')).once();

    // Does not collapse Community Checking item when translate is disabled
    env.selectItem(0);
    // Expect: Community Checking | Overview | Synchronize | Settings | Users
    expect(env.menuLength).toEqual(5);
  }));

  it('expand/collapse tool', fakeAsync(() => {
    const env = new TestEnvironment();
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
    env.navigate(['/projects', 'project01']);
    env.init();
    // Expect: Translate | Community Checking | Synchronize | Settings | Users
    expect(env.menuLength).toEqual(5);
    const projectDoc = env.component.projectDocs![0];
    projectDoc.submitJson0Op(op => op.set<boolean>(p => p.checkingConfig.checkingEnabled, false));
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
    verify(mockedUserService.setCurrentProjectId('project02')).once();
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
    verify(mockedMdcDialog.open(ProjectDeletedDialogComponent)).once();
    verify(mockedUserService.setCurrentProjectId()).once();
    env.confirmProjectDeletedDialog();
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
    verify(mockedUserService.setCurrentProjectId()).once();
    expect(env.location.path()).toEqual('/projects');
  }));

  it('response to removed from project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.selectedProjectId).toEqual('project01');
    env.removesUserFromProject('project01');
    verify(mockedMdcDialog.open(ProjectDeletedDialogComponent)).once();
    env.confirmProjectDeletedDialog();
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

  describe('Community Checking', () => {
    it('no books showing in the menu', fakeAsync(() => {
      const env = new TestEnvironment();
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
      env.removesUserFromProject(projectId);
      verify(mockedSFProjectService.localDelete(projectId)).once();
    }));
  });
});

@NgModule({
  imports: [CommonModule, UICommonModule, TestTranslocoModule],
  declarations: [ProjectDeletedDialogComponent],
  exports: [ProjectDeletedDialogComponent]
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
  readonly canSeeSettings$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  readonly canSeeUsers$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(true);
  readonly hasUpdate$: Subject<any> = new Subject<any>();
  readonly mockedProjectDeletedDialogRef = mock<MdcDialogRef<ProjectDeletedDialogComponent>>(MdcDialogRef);
  readonly projectDeletedDialogRefAfterClosed$: Subject<string> = new Subject<string>();
  readonly comesOnline$: Subject<void> = new Subject<void>();

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(initialConnectionStatus?: 'online' | 'offline') {
    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: 'user01',
      data: {
        name: 'User 01',
        email: 'user1@example.com',
        role: SystemRole.User,
        isDisplayNameConfirmed: true,
        avatarUrl: '',
        authId: 'auth01',
        displayName: 'User 01',
        sites: {
          sf: {
            projects: ['project01', 'project02', 'project03']
          }
        }
      }
    });

    this.realtimeService.addSnapshots<Question>(QuestionDoc.COLLECTION, []);
    when(mockedSFProjectService.queryQuestions(anything(), anything())).thenCall((_projectId, options) => {
      const parameters: QueryParameters = {
        [obj<Question>().pathStr(q => q.verseRef.bookNum)]: options.bookNum,
        [obj<Question>().pathStr(q => q.isArchived)]: false
      };
      return this.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, parameters);
    });

    this.addProject('project01', { user01: SFProjectRole.ParatextTranslator }, [
      { bookNum: 40, hasSource: true, chapters: [], permissions: {} },
      { bookNum: 41, hasSource: false, chapters: [], permissions: {} }
    ]);
    // Books are out-of-order on purpose so that we can test that books are displayed in canonical order
    this.addProject('project02', { user01: SFProjectRole.CommunityChecker }, [
      { bookNum: 43, hasSource: false, chapters: [], permissions: {} },
      { bookNum: 42, hasSource: false, chapters: [], permissions: {} }
    ]);
    this.addProject('project03', { user01: SFProjectRole.CommunityChecker }, [
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
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedAuthService.isLoggedIn).thenResolve(true);
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, 'user01')
    );
    when(mockedUserService.currentProjectId).thenReturn('project01');
    when(mockedSettingsAuthGuard.allowTransition(anything())).thenReturn(this.canSeeSettings$);
    when(mockedSyncAuthGuard.allowTransition(anything())).thenReturn(this.canSync$);
    when(mockedUsersAuthGuard.allowTransition(anything())).thenReturn(this.canSeeUsers$);
    when(mockedCookieService.get(anything())).thenReturn('en');
    const comesOnline = new Promise<void>(resolve => {
      this.comesOnline$.subscribe(() => resolve());
    });

    if (initialConnectionStatus === 'offline') {
      when(mockedPwaService.isOnline).thenReturn(false);
      when(mockedPwaService.online).thenReturn(comesOnline);
      when(mockedPwaService.onlineStatus).thenReturn(of(false));
    } else {
      when(mockedPwaService.isOnline).thenReturn(true);
      when(mockedPwaService.online).thenReturn(comesOnline);
      this.comesOnline$.next();
      when(mockedPwaService.onlineStatus).thenReturn(of(true));
    }
    when(mockedFileService.notifyUserIfStorageQuotaBelow(anything())).thenResolve();
    when(mockedPwaService.hasUpdate).thenReturn(this.hasUpdate$);
    when(mockedMdcDialog.open(ProjectDeletedDialogComponent)).thenReturn(instance(this.mockedProjectDeletedDialogRef));
    when(this.mockedProjectDeletedDialogRef.afterClosed()).thenReturn(this.projectDeletedDialogRefAfterClosed$);

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

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get menuDrawer(): DebugElement {
    return this.fixture.debugElement.query(By.css('#menu-drawer'));
  }

  get menuListItems(): DebugElement[] {
    return this.fixture.debugElement.queryAll(By.css('#menu-drawer .mat-list-item'));
  }

  get helpMenuList(): DebugElement {
    return this.fixture.debugElement.query(By.css('#help-menu-list'));
  }

  get navBar(): DebugElement {
    return this.fixture.debugElement.query(By.css('mdc-top-app-bar'));
  }

  get refreshButton(): DebugElement {
    return this.navBar.query(By.css('.update-banner .mat-raised-button'));
  }

  get selectedProjectId(): string {
    return this.component.projectSelect!.value;
  }

  get menuLength(): number {
    return this.menuListItems.length;
  }

  get isDrawerVisible(): boolean {
    return this.menuDrawer != null;
  }

  get currentUserDisplayName(): string {
    return this.currentUserDoc.data!.displayName;
  }

  get currentUserDoc(): UserDoc {
    return this.realtimeService.get(UserDoc.COLLECTION, 'user01');
  }

  get lastSyncFailedBadgeIsPresent(): boolean {
    const iconIfBadgeHidden = this.menuDrawer.query(By.css('#sync-icon.mat-badge-hidden'));
    if (iconIfBadgeHidden != null) {
      return false;
    }
    return true;
  }

  getMenuItemText(index: number): string {
    return this.menuListItems[index].nativeElement.textContent;
  }

  getMenuItemContaining(substring: string): DebugElement | undefined {
    return this.menuListItems.find((item: DebugElement) => item.nativeElement.innerText.includes(substring));
  }

  getHelpMenuItemContaining(substring: string): DebugElement | undefined {
    return this.helpMenuList.children.find((item: DebugElement) => item.nativeElement.innerText.includes(substring));
  }

  someMenuItemContains(substring: string): boolean {
    return this.getMenuItemContaining(substring) !== undefined;
  }

  someHelpMenuItemContains(substring: string): boolean {
    return this.getHelpMenuItemContaining(substring) !== undefined;
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

  init(): void {
    this.component.openDrawer();
    this.wait();
  }

  allowUserToSeeSettings(canSeeSettings: boolean = true) {
    this.canSeeSettings$.next(canSeeSettings);
    this.fixture.detectChanges();
    tick();
  }

  allowUserToSeeUsers(canSeeUsers: boolean = true) {
    this.canSeeUsers$.next(canSeeUsers);
    this.fixture.detectChanges();
    tick();
  }

  allowUserToSync(canSync: boolean = true) {
    this.canSync$.next(canSync);
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
      this.component.projectSelect!.setSelectionByValue(projectId);
    });
    this.wait();
  }

  wait(): void {
    this.fixture.detectChanges();
    flush(70);
    this.fixture.detectChanges();
    flush(70);
  }

  deleteProject(projectId: string, isLocal: boolean): void {
    if (isLocal) {
      when(mockedUserService.currentProjectId).thenReturn(undefined);
    }
    this.ngZone.run(() => {
      const projectDoc = this.realtimeService.get(SFProjectProfileDoc.COLLECTION, projectId);
      projectDoc.delete();
    });
    this.wait();
  }

  removesUserFromProject(projectId: string): void {
    const projectDoc = this.realtimeService.get<SFProjectProfileDoc>(SFProjectProfileDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(op => op.unset<string>(p => p.userRoles['user01']), false);
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
  }

  confirmProjectDeletedDialog() {
    this.ngZone.run(() => this.projectDeletedDialogRefAfterClosed$.next('close'));
  }

  private addProject(projectId: string, userRoles: { [userRef: string]: string }, texts: TextInfo[]): void {
    this.realtimeService.addSnapshot<SFProject>(SFProjectProfileDoc.COLLECTION, {
      id: projectId,
      data: {
        name: projectId,
        paratextId: projectId,
        shortName: projectId,
        writingSystem: {
          tag: 'en'
        },
        translateConfig: {
          translationSuggestionsEnabled: false,
          shareEnabled: false,
          shareLevel: TranslateShareLevel.Specific
        },
        checkingConfig: {
          checkingEnabled: true,
          shareEnabled: true,
          shareLevel: CheckingShareLevel.Specific,
          usersSeeEachOthersResponses: true
        },
        sync: { queuedCount: 0, lastSyncSuccessful: true },
        editable: true,
        userRoles,
        userPermissions: {},
        texts,
        paratextUsers: paratextUsersFromRoles(userRoles)
      }
    });
  }
}
