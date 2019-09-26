import { MdcDialogRef, MdcList, OverlayContainer } from '@angular-mdc/web';
import { CommonModule, Location } from '@angular/common';
import { Component, DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Route, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { configureTestSuite } from 'ng-bullet';
import { SystemRole } from 'realtime-server/lib/common/models/system-role';
import { User } from 'realtime-server/lib/common/models/user';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { getQuestionDocId, Question } from 'realtime-server/lib/scriptureforge/models/question';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { of } from 'rxjs';
import { anything, instance, mock, reset, verify, when } from 'ts-mockito';
import { AccountService } from 'xforge-common/account.service';
import { AuthService } from 'xforge-common/auth.service';
import { AvatarTestingModule } from 'xforge-common/avatar/avatar-testing.module';
import { LocationService } from 'xforge-common/location.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { QueryParameters } from 'xforge-common/query-parameters';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { getObjPathStr, objectId, objProxy } from 'xforge-common/utils';
import { AppComponent, CONNECT_PROJECT_OPTION } from './app.component';
import { QuestionDoc } from './core/models/question-doc';
import { SFProjectDoc } from './core/models/sf-project-doc';
import { SF_REALTIME_DOC_TYPES } from './core/models/sf-realtime-doc-types';
import { SFProjectService } from './core/sf-project.service';
import { ProjectDeletedDialogComponent } from './project-deleted-dialog/project-deleted-dialog.component';
import { SFAdminAuthGuard } from './shared/sfadmin-auth.guard';

const mockedAccountService = mock(AccountService);
const mockedAuthService = mock(AuthService);
const mockedUserService = mock(UserService);
const mockedSFAdminAuthGuard = mock(SFAdminAuthGuard);
const mockedSFProjectService = mock(SFProjectService);
const mockedLocationService = mock(LocationService);
const mockedNoticeService = mock(NoticeService);
const mockedNameDialogRef = mock(MdcDialogRef);

describe('AppComponent', () => {
  configureTestSuite(() => {
    TestBed.configureTestingModule({
      declarations: [AppComponent, MockComponent],
      imports: [AvatarTestingModule, DialogTestModule, UICommonModule, RouterTestingModule.withRoutes(ROUTES)],
      providers: [
        { provide: AccountService, useFactory: () => instance(mockedAccountService) },
        { provide: AuthService, useFactory: () => instance(mockedAuthService) },
        { provide: UserService, useFactory: () => instance(mockedUserService) },
        { provide: SFAdminAuthGuard, useFactory: () => instance(mockedSFAdminAuthGuard) },
        { provide: SFProjectService, useFactory: () => instance(mockedSFProjectService) },
        { provide: LocationService, useFactory: () => instance(mockedLocationService) },
        { provide: NoticeService, useFactory: () => instance(mockedNoticeService) }
      ]
    });
  });

  beforeEach(() => {
    reset(mockedAccountService);
    reset(mockedAuthService);
    reset(mockedUserService);
    reset(mockedSFAdminAuthGuard);
    reset(mockedSFProjectService);
    reset(mockedLocationService);
    reset(mockedNoticeService);
    reset(mockedNameDialogRef);
  });

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
    expect(env.menuLength).toEqual(4);
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
    expect(env.menuLength).toEqual(4);
    expect(env.component.isCheckingEnabled).toEqual(true);
    expect(env.component.isTranslateEnabled).toEqual(false);
    verify(mockedUserService.setCurrentProjectId('project03')).once();
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
    env.deleteProject('project01', false);
    expect(env.projectDeletedDialog).not.toBeNull();
    verify(mockedUserService.setCurrentProjectId()).once();
    env.confirmDialog();
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

  it('response to local project deletion', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project01');
    env.deleteProject('project01', true);
    expect(env.isDrawerVisible).toEqual(false);
    expect(env.location.path()).toEqual('/projects');
  }));

  it('response to removed from project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.selectedProjectId).toEqual('project01');
    env.removesUserFromProject('project01');
    expect(env.projectDeletedDialog).not.toBeNull();
    env.confirmDialog();
    expect(env.location.path()).toEqual('/projects');
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

  it('should only display Sync, Settings and Users for admin', fakeAsync(() => {
    const env = new TestEnvironment();
    env.makeUserAProjectAdmin(false);
    expect(env.syncItem).toBeNull();
    expect(env.settingsItem).toBeNull();
    expect(env.usersItem).toBeNull();
    env.makeUserAProjectAdmin();
    expect(env.syncItem).toBeDefined();
    expect(env.settingsItem).toBeDefined();
    expect(env.usersItem).toBeDefined();
  }));

  describe('User menu', () => {
    it('updates user with name', fakeAsync(() => {
      const env = new TestEnvironment();
      env.init();
      env.updateDisplayName('Updated Name');
      tick();
      verify(mockedAccountService.openNameDialog(anything(), anything()));
      expect(env.currentUserDisplayName).toEqual('Updated Name');
    }));
  });

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
      expect(env.menuList.getListItemByIndex(2).getListItemElement().textContent).toContain('All Questions');
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
  });
});

@Component({
  template: `
    <div>Mock</div>
  `
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

@NgModule({
  imports: [CommonModule, UICommonModule],
  declarations: [ProjectDeletedDialogComponent],
  entryComponents: [ProjectDeletedDialogComponent],
  exports: [ProjectDeletedDialogComponent]
})
class DialogTestModule {}

class TestEnvironment {
  readonly component: AppComponent;
  readonly fixture: ComponentFixture<AppComponent>;
  readonly router: Router;
  readonly location: Location;
  readonly overlayContainer: OverlayContainer;
  readonly questions: Question[];

  private readonly realtimeService = new TestRealtimeService(SF_REALTIME_DOC_TYPES);

  constructor() {
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
    when(mockedSFProjectService.queryQuestionCount(anything(), anything())).thenCall((_projectId, options) => {
      const parameters: QueryParameters = {
        $count: true,
        [getObjPathStr(objProxy<Question>().verseRef.bookNum)]: options.bookNum,
        [getObjPathStr(objProxy<Question>().isArchived)]: false
      };
      return this.realtimeService.subscribeQuery(QuestionDoc.COLLECTION, parameters);
    });

    this.addProject('project01', { user01: SFProjectRole.ParatextTranslator }, [
      { bookNum: 40, hasSource: true, chapters: [] },
      { bookNum: 41, hasSource: false, chapters: [] }
    ]);
    this.addProject('project02', { user01: SFProjectRole.CommunityChecker }, [
      { bookNum: 42, hasSource: false, chapters: [] },
      { bookNum: 43, hasSource: false, chapters: [] }
    ]);
    this.addProject('project03', { user01: SFProjectRole.CommunityChecker }, [
      { bookNum: 44, hasSource: true, chapters: [] },
      { bookNum: 45, hasSource: true, chapters: [] }
    ]);
    this.addProject('project04', {}, [
      { bookNum: 46, hasSource: true, chapters: [] },
      { bookNum: 47, hasSource: true, chapters: [] }
    ]);

    when(mockedSFProjectService.get(anything())).thenCall(projectId =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, projectId)
    );
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedAuthService.isLoggedIn).thenResolve(true);
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, 'user01')
    );
    when(mockedUserService.currentProjectId).thenReturn('project01');
    when(mockedAccountService.openNameDialog(anything(), false)).thenReturn(instance(mockedNameDialogRef));
    when(mockedSFAdminAuthGuard.allowTransition(anything())).thenReturn(of(true));

    this.router = TestBed.get(Router);
    this.location = TestBed.get(Location);
    this.fixture = TestBed.createComponent(AppComponent);
    this.component = this.fixture.componentInstance;
    this.overlayContainer = TestBed.get(OverlayContainer);
    this.fixture.ngZone.run(() => this.router.initialNavigation());

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

  get menuList(): MdcList {
    const listElem = this.fixture.debugElement.query(By.css('#menu-list'));
    return listElem.componentInstance;
  }

  get syncItem(): DebugElement {
    return this.fixture.debugElement.query(By.css('#sync-item'));
  }

  get settingsItem(): DebugElement {
    return this.fixture.debugElement.query(By.css('#settings-item'));
  }

  get usersItem(): DebugElement {
    return this.fixture.debugElement.query(By.css('#usersItem'));
  }

  get selectedProjectId(): string {
    return this.component.projectSelect.value;
  }

  get menuLength(): number {
    return this.menuList.items.length;
  }

  get isDrawerVisible(): boolean {
    return this.menuDrawer != null;
  }

  get projectDeletedDialog(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('mdc-dialog');
  }

  get okButton(): HTMLElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('#ok-button');
  }

  get currentUserDisplayName(): string {
    return this.currentUserDoc.data.displayName;
  }

  get currentUserDoc(): UserDoc {
    return this.realtimeService.get(UserDoc.COLLECTION, 'user01');
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

  makeUserAProjectAdmin(isProjectAdmin: boolean = true) {
    this.component.isProjectAdmin$ = of(isProjectAdmin);
  }

  navigate(commands: any[]): void {
    this.fixture.ngZone.run(() => this.router.navigate(commands)).then();
  }

  selectItem(index: number): void {
    const elem = this.menuList.getListItemByIndex(index).getListItemElement();
    elem.click();
    this.wait();
  }

  selectProject(projectId: string): void {
    this.fixture.ngZone.run(() => {
      this.component.projectSelect.setSelectionByValue(projectId);
    });
    this.wait();
  }

  wait(): void {
    this.fixture.detectChanges();
    flush(50);
    this.fixture.detectChanges();
    flush(50);
  }

  deleteProject(projectId: string, isLocal: boolean): void {
    if (isLocal) {
      when(mockedUserService.currentProjectId).thenReturn(undefined);
    }
    this.fixture.ngZone.run(() => {
      const projectDoc = this.realtimeService.get(SFProjectDoc.COLLECTION, projectId);
      projectDoc.delete();
    });
    this.wait();
  }

  removesUserFromProject(projectId: string): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(op => op.unset<string>(p => p.userRoles['user01']), false);
    this.wait();
  }

  addUserToProject(projectId: string): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(op => op.set<string>(p => p.userRoles['user01'], SFProjectRole.CommunityChecker), false);
    this.currentUserDoc.submitJson0Op(op => op.add<string>(u => u.sites['sf'].projects, 'project04'), false);
  }

  confirmDialog(): void {
    this.okButton.click();
    this.wait();
  }

  updateDisplayName(displayName: string) {
    when(mockedNameDialogRef.afterClosed()).thenReturn(of(displayName));
    this.component.editName('User 01');
  }

  private addProject(projectId: string, userRoles: { [userRef: string]: string }, texts: TextInfo[]): void {
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: projectId,
      data: {
        name: projectId,
        paratextId: projectId,
        shortName: projectId,
        writingSystem: {
          tag: 'en'
        },
        translateConfig: {
          translationSuggestionsEnabled: false
        },
        checkingConfig: {
          checkingEnabled: true,
          shareEnabled: true,
          shareLevel: CheckingShareLevel.Specific,
          usersSeeEachOthersResponses: true
        },
        sync: { queuedCount: 0 },
        userRoles,
        texts
      }
    });
  }
}
