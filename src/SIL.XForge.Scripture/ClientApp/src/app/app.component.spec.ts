import { MdcDialogRef, MdcList, OverlayContainer } from '@angular-mdc/web';
import { CommonModule, Location } from '@angular/common';
import { Component, CUSTOM_ELEMENTS_SCHEMA, DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Route, Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import * as OTJson0 from 'ot-json0';
import { BehaviorSubject, of } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { AccountService } from 'xforge-common/account.service';
import { AuthService } from 'xforge-common/auth.service';
import { MapQueryResults, QueryResults } from 'xforge-common/json-api.service';
import { LocationService } from 'xforge-common/location.service';
import { User, UserRef } from 'xforge-common/models/user';
import { NoticeService } from 'xforge-common/notice.service';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { RealtimeService } from 'xforge-common/realtime.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { nameof } from 'xforge-common/utils';
import { AppComponent, CONNECT_PROJECT_OPTION } from './app.component';
import { SFProject, SFProjectRef } from './core/models/sfproject';
import { SFProjectData } from './core/models/sfproject-data';
import { SFProjectDataDoc } from './core/models/sfproject-data-doc';
import { SFProjectRoles } from './core/models/sfproject-roles';
import { SFProjectUser } from './core/models/sfproject-user';
import { SFProjectService } from './core/sfproject.service';
import { ProjectDeletedDialogComponent } from './project-deleted-dialog/project-deleted-dialog.component';
import { SFAdminAuthGuard } from './shared/sfadmin-auth.guard';

describe('AppComponent', () => {
  it('navigate to last project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project01');
    expect(env.menuLength).toEqual(5);
    verify(env.mockedUserService.updateCurrentProjectId(anything())).never();
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
    verify(env.mockedUserService.updateCurrentProjectId('project02')).once();
  }));

  it('hide translate task for reviewers', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project03']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project03');
    expect(env.menuLength).toEqual(4);
    expect(env.component.isCheckingEnabled).toEqual(true);
    expect(env.component.isTranslateEnabled).toEqual(false);
    verify(env.mockedUserService.updateCurrentProjectId('project03')).once();
  }));

  it('expand/collapse task', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project01');
    env.selectItem(0);
    expect(env.menuLength).toEqual(7);
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
    verify(env.mockedUserService.updateCurrentProjectId('project02')).once();
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
    expect(env.component.selectedProject).toBeUndefined();
  }));

  it('reponse to remote project deletion', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project01');
    env.deleteProject(false);
    expect(env.projectDeletedDialog).toBeDefined();
    verify(env.mockedUserService.updateCurrentProjectId()).once();
    env.confirmDialog();
    expect(env.isDrawerVisible).toEqual(false);
    expect(env.location.path()).toEqual('/projects');
    verify(env.mockedSFProjectService.localDelete('project01')).once();
  }));

  it('reponse to remote project deletion when no project selected', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedSFProjectService.onlineExists('project01')).thenResolve(false);
    env.deleteProject(false);
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(false);
    verify(env.mockedUserService.updateCurrentProjectId()).once();
    expect(env.location.path()).toEqual('/projects');
  }));

  it('response to local project deletion', fakeAsync(() => {
    const env = new TestEnvironment();
    env.navigate(['/projects', 'project01']);
    env.init();

    expect(env.isDrawerVisible).toEqual(true);
    expect(env.selectedProjectId).toEqual('project01');
    env.deleteProject(true);
    expect(env.isDrawerVisible).toEqual(false);
    expect(env.location.path()).toEqual('/projects');
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

  it('partial data does not throw', fakeAsync(() => {
    // SF-229 The project properties may only be partiually available
    // the first time we hear back from the observable. Don't prevent
    // it from trying again by crashing in the fixture or component code.
    const env = new TestEnvironment();
    env.setProjects(
      new MapQueryResults(
        [
          new SFProjectUser({
            id: 'projectuser01',
            project: new SFProjectRef('project01'),
            user: new UserRef('user01')
          })
        ],
        undefined,
        [
          new SFProject({
            id: 'project01'
          })
        ]
      )
    );
    env.navigate(['/projects', 'project01']);

    expect(() => env.init()).not.toThrow();
  }));

  describe('User menu', () => {
    it('updates user with name', fakeAsync(() => {
      const env = new TestEnvironment();
      env.fixture.detectChanges();
      env.updateName('Updated Name');
      verify(env.mockedAccountService.openNameDialog(anything(), anything()));
      verify(env.mockedUserService.updateCurrentUserAttributes(deepEqual({ name: 'Updated Name' }))).once();
      expect().nothing();
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
  imports: [UICommonModule, CommonModule],
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
  readonly lastLogin: string = '2019-02-01T12:00:00.000Z';

  readonly mockedAccountService = mock(AccountService);
  readonly mockedAuthService = mock(AuthService);
  readonly mockedUserService = mock(UserService);
  readonly mockedSFAdminAuthGuard = mock(SFAdminAuthGuard);
  readonly mockedSFProjectService = mock(SFProjectService);
  readonly mockedRealtimeService = mock(RealtimeService);
  readonly mockedLocationService = mock(LocationService);
  readonly mockedNoticeService = mock(NoticeService);
  readonly mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);
  readonly mockedNameDialogRef = mock(MdcDialogRef);

  private readonly currentUser: User;
  private readonly projects$: BehaviorSubject<QueryResults<SFProjectUser[]>>;

  constructor() {
    this.currentUser = new User({
      id: 'user01',
      site: { currentProjectId: 'project01', lastLogin: this.lastLogin }
    });

    this.projects$ = new BehaviorSubject<QueryResults<SFProjectUser[]>>(
      new MapQueryResults(
        [
          new SFProjectUser({
            id: 'projectuser01',
            project: new SFProjectRef('project01'),
            user: new UserRef('user01'),
            role: SFProjectRoles.ParatextTranslator
          }),
          new SFProjectUser({
            id: 'projectuser02',
            project: new SFProjectRef('project02'),
            user: new UserRef('user01'),
            role: SFProjectRoles.Reviewer
          }),
          new SFProjectUser({
            id: 'projectuser03',
            project: new SFProjectRef('project03'),
            user: new UserRef('user01'),
            role: SFProjectRoles.Reviewer
          })
        ],
        undefined,
        [
          new SFProject({
            id: 'project01',
            projectName: 'project01',
            translateEnabled: true,
            checkingEnabled: true
          }),
          new SFProject({
            id: 'project02',
            projectName: 'project02',
            translateEnabled: false,
            checkingEnabled: true
          }),
          new SFProject({
            id: 'project03',
            projectName: 'project03',
            translateEnabled: true,
            checkingEnabled: true
          })
        ]
      )
    );
    this.addProjectDataDoc('project01', {
      texts: [
        { bookId: 'text01', name: 'Book 1', hasSource: true },
        { bookId: 'text02', name: 'Book 2', hasSource: false }
      ]
    });
    this.addProjectDataDoc('project02', {
      texts: [
        { bookId: 'text03', name: 'Book 3', hasSource: false },
        { bookId: 'text04', name: 'Book 4', hasSource: false }
      ]
    });
    this.addProjectDataDoc('project03', {
      texts: [
        { bookId: 'text05', name: 'Book 5', hasSource: true },
        { bookId: 'text06', name: 'Book 6', hasSource: true }
      ]
    });

    when(this.mockedUserService.currentUserId).thenReturn('user01');
    when(this.mockedAuthService.isLoggedIn).thenResolve(true);
    when(this.mockedUserService.getCurrentUser()).thenReturn(of(this.currentUser));
    when(this.mockedUserService.getProjects('user01', deepEqual([[nameof<SFProjectUser>('project')]]))).thenReturn(
      this.projects$
    );
    when(this.mockedAccountService.openNameDialog(anything(), false)).thenReturn(instance(this.mockedNameDialogRef));
    when(this.mockedUserService.updateCurrentProjectId(anything())).thenResolve();
    when(this.mockedSFAdminAuthGuard.allowTransition(anything())).thenReturn(of(true));

    TestBed.configureTestingModule({
      declarations: [AppComponent, MockComponent],
      imports: [UICommonModule, DialogTestModule, RouterTestingModule.withRoutes(ROUTES)],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        { provide: AccountService, useFactory: () => instance(this.mockedAccountService) },
        { provide: AuthService, useFactory: () => instance(this.mockedAuthService) },
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: SFAdminAuthGuard, useFactory: () => instance(this.mockedSFAdminAuthGuard) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedSFProjectService) },
        { provide: RealtimeService, useFactory: () => instance(this.mockedRealtimeService) },
        { provide: LocationService, useFactory: () => instance(this.mockedLocationService) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) }
      ]
    });
    this.router = TestBed.get(Router);
    this.location = TestBed.get(Location);
    this.fixture = TestBed.createComponent(AppComponent);
    this.component = this.fixture.componentInstance;
    this.overlayContainer = TestBed.get(OverlayContainer);
    this.fixture.ngZone.run(() => this.router.initialNavigation());
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
    this.component.projectSelect.setSelectionByValue(projectId);
    this.wait();
  }

  wait(): void {
    this.fixture.detectChanges();
    flush(40);
    this.fixture.detectChanges();
    flush(40);
  }

  deleteProject(isLocal: boolean): void {
    if (isLocal) {
      this.currentUser.site.currentProjectId = null;
    }
    this.projects$.next(new MapQueryResults<SFProjectUser[]>([]));
    this.wait();
  }

  confirmDialog(): void {
    this.okButton.click();
    this.wait();
  }

  updateName(name: string) {
    when(this.mockedNameDialogRef.afterClosed()).thenReturn(of(name));
    this.component.editName('User 01');
  }

  setProjects(results: MapQueryResults<SFProjectUser[]>): void {
    this.projects$.next(results);
  }

  private addProjectDataDoc(projectId: string, projectData: SFProjectData): void {
    const adapter = new MemoryRealtimeDocAdapter(OTJson0.type, projectId, projectData);
    const doc = new SFProjectDataDoc(adapter, instance(this.mockedRealtimeOfflineStore));
    when(this.mockedSFProjectService.getDataDoc(projectId)).thenResolve(doc);
  }
}
