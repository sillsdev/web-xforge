import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { DebugElement, getDebugNode } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { createTestUserProfile } from 'realtime-server/lib/esm/common/models/user-test-data';
import { CheckingAnswerExport, CheckingConfig } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { DialogService } from 'xforge-common/dialog.service';
import { NONE_ROLE, ProjectRoleInfo } from 'xforge-common/models/project-role-info';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, emptyHammerLoader, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_PROJECT_ROLES } from '../../core/models/sf-project-role-info';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { SharedModule } from '../../shared/shared.module';
import { paratextUsersFromRoles } from '../../shared/test-utils';
import { CollaboratorsComponent } from './collaborators.component';

const mockedActivatedRoute = mock(ActivatedRoute);
const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedDialogService = mock(DialogService);

describe('CollaboratorsComponent', () => {
  configureTestingModule(() => ({
    declarations: [CollaboratorsComponent],
    imports: [
      NoopAnimationsModule,
      UICommonModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      SharedModule.forRoot(),
      TestOnlineStatusModule.forRoot(),
      AvatarComponent
    ],
    providers: [
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService },
      { provide: DialogService, useMock: mockedDialogService },
      emptyHammerLoader
    ]
  }));

  it('should not display no-users label while loading', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    expect(env.noUsersLabel).toBeNull();
  }));

  it('should display message when there are no users on a tab', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData({ user01: SFProjectRole.ParatextAdministrator, user02: SFProjectRole.ParatextTranslator });
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    expect(env.userRows.length).toEqual(2);
    expect(env.noUsersLabel).toBeNull();

    // click tab to project guests where there are no users
    env.clickElement(env.tabElementFromIndex(2));
    tick();
    env.fixture.detectChanges();
    expect(env.component.currentTabIndex).toBe(2);
    expect(env.table).toBeNull();
    expect(env.noUsersLabel).not.toBeNull();
  }));

  it('should display users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    expect(env.noUsersLabel).toBeNull();
    expect(env.userRows.length).toEqual(3);

    expect(env.cellDisplayName(0, 1)).toEqual('User 01');
    expect(env.cellRole(0, 3).innerText).toEqual('Administrator');
    env.clickElement(env.userRowMoreMenuElement(0));
    expect(env.removeUserItemOnRow(0)).toBeNull();
    expect(env.cancelInviteItemOnRow(0)).toBeNull();

    expect(env.cellDisplayName(1, 1)).toEqual('User 02');
    expect(env.cellRole(1, 3).innerText).toEqual('Translator');
    env.clickElement(env.userRowMoreMenuElement(1));
    expect(env.removeUserItemOnRow(1)).toBeTruthy();
    expect(env.cancelInviteItemOnRow(1)).toBeFalsy();

    expect(env.cellDisplayName(2, 1)).toEqual('User 03');
    expect(env.cellRole(2, 3).innerText).toEqual('Community Checker');
    env.clickElement(env.userRowMoreMenuElement(2));
    expect(env.removeUserItemOnRow(2)).toBeTruthy();
    expect(env.cancelInviteItemOnRow(2)).toBeFalsy();
    env.cleanup();
  }));

  it('displays invited users', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve([
      { email: 'alice@a.aa', role: 'sf_community_checker', expired: false },
      { email: 'bob@b.bb', role: 'sf_community_checker', expired: false },
      { email: 'charles@c.cc', role: 'sf_community_checker', expired: true }
    ]);

    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    const numUsersOnProject = 3;
    const numInvitees = 3;
    expect(env.userRows.length).toEqual(numUsersOnProject + numInvitees);

    const inviteeRow = 3;
    const inviteeDisplay = env.elementTextContent(env.cell(inviteeRow, 1));
    expect(inviteeDisplay).toContain('Awaiting');
    expect(inviteeDisplay).toContain('alice@a.aa');
    const expiredRow = 5;
    const expiredInvitee = env.elementTextContent(env.cell(expiredRow, 1));
    expect(expiredInvitee).toContain('Invitation has expired');
    expect(expiredInvitee).toContain('charles@c.cc');

    // Invitee row has cancel button but not remove button.
    env.clickElement(env.userRowMoreMenuElement(inviteeRow));
    expect(env.removeUserItemOnRow(inviteeRow)).toBeFalsy();
    expect(env.cancelInviteItemOnRow(inviteeRow)).toBeTruthy();
    env.cleanup();
  }));

  it('handle error from invited users query, when user is not on project', fakeAsync(() => {
    // If an admin user is removed from the project, or loses admin
    // privileges, while looking at the component, they will run loadUsers
    // and throw an error calling onlineInvitedUsers.
    // Handle that error.

    const env = new TestEnvironment();
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenThrow(
      new CommandError(CommandErrorCode.Other, 'error', null)
    );
    env.setupProjectData({
      // No user01
      user02: SFProjectRole.ParatextTranslator,
      user03: SFProjectRole.CommunityChecker
    });
    env.fixture.detectChanges();
    expect(() => {
      tick();
    }).not.toThrow();
    verify(mockedNoticeService.show(anything())).once();
    tick();
  }));

  it('handle error from invited users query, when user is not an admin', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenThrow(
      new CommandError(CommandErrorCode.Other, 'error', null)
    );
    env.setupProjectData({
      // user01 is not an admin
      user01: SFProjectRole.CommunityChecker,
      user02: SFProjectRole.ParatextTranslator,
      user03: SFProjectRole.CommunityChecker
    });
    env.fixture.detectChanges();
    expect(() => {
      tick();
    }).not.toThrow();
    verify(mockedNoticeService.show(anything())).once();
    tick();
  }));

  it('should refresh user list after inviting a new user', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve([
      { email: 'alice@a.aa', role: 'sf_community_checker', expired: false }
    ]);
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    // Only Alice invitee is listed
    const numUsersOnProject = 3;
    let numInvitees = 1;
    expect(env.userRows.length).toEqual(numUsersOnProject + numInvitees);

    // Simulate invitation event
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve([
      { email: 'alice@a.aa', role: 'sf_community_checker', expired: false },
      { email: 'new-invitee@example.com', role: 'sf_community_checker', expired: false }
    ]);
    numInvitees++;
    env.component.onInvitationSent();
    flush();
    env.fixture.detectChanges();

    // Both invitees are now listed
    expect(env.userRows.length).toEqual(numUsersOnProject + numInvitees);
  }));

  it('should un-invite user from project', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedProjectService.onlineUninviteUser(anything(), anything())).thenResolve();
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve([
      { email: 'alice@a.aa', role: 'sf_community_checker', expired: false }
    ]);
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    // Alice invitee is listed
    const numUsersOnProject = 3;
    let numInvitees = 1;
    expect(env.userRows.length).toEqual(numUsersOnProject + numInvitees);

    const inviteeRow = 3;
    const inviteeDisplay = env.elementTextContent(env.cell(inviteeRow, 1));
    expect(inviteeDisplay).toContain('Awaiting');
    expect(inviteeDisplay).toContain('alice@a.aa');
    // Invitee row has cancel button but not remove button.
    env.clickElement(env.userRowMoreMenuElement(inviteeRow));
    expect(env.removeUserItemOnRow(inviteeRow)).toBeFalsy();
    expect(env.cancelInviteItemOnRow(inviteeRow)).toBeTruthy();

    // Uninvite Alice
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve([]);
    env.clickElement(env.cancelInviteItemOnRow(inviteeRow));
    verify(mockedProjectService.onlineUninviteUser(env.project01Id, 'alice@a.aa')).once();

    // Alice is not shown as in invitee
    numInvitees = 0;
    expect(env.userRows.length).toEqual(numUsersOnProject + numInvitees);
  }));

  it('should remove user from project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    env.clickElement(env.userRowMoreMenuElement(1));
    env.clickElement(env.removeUserItemOnRow(1));
    verify(mockedProjectService.onlineRemoveUser(anything(), anything())).once();
    expect().nothing();
  }));

  it('can tab between groups', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve([
      { email: 'bob@example.com', role: 'sf_community_checker', expired: false }
    ]);
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    expect(env.component.currentTabIndex).toBe(0);
    expect(env.userRows.length).toBe(4);
    env.clickElement(env.tabElementFromIndex(1));
    tick();
    env.fixture.detectChanges();
    expect(env.component.currentTabIndex).toBe(1);
    expect(env.userRows.length).toBe(2);

    env.clickElement(env.tabElementFromIndex(2));
    tick();
    env.fixture.detectChanges();
    expect(env.component.currentTabIndex).toBe(2);
    expect(env.component.rowsToDisplay.length).toBe(2);
  }));

  it('should filter users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve([
      { email: 'bob@example.com', role: 'sf_community_checker', expired: false }
    ]);
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    expect(env.userRows.length).toEqual(4);
    env.setInputValue(env.filterInput, '02');

    expect(env.userRows.length).toEqual(1);

    env.setInputValue(env.filterInput, 'bob@example.com');
    expect(env.userRows.length).toEqual(1);
    env.setInputValue(env.filterInput, 'BOB');
    expect(env.userRows.length).toEqual(1);
    env.setInputValue(env.filterInput, '    BOB ');
    expect(env.userRows.length).toEqual(1);

    env.setInputValue(env.filterInput, 'Community Checker');
    expect(env.userRows.length).toEqual(2);
  }));

  it('should disable collaborators if not connected', fakeAsync(() => {
    const env = new TestEnvironment(false);
    env.setupProjectData();
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve([
      { email: 'alice@a.aa', role: 'sf_community_checker', expired: false }
    ]);
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    const numUsersOnProject = 3;
    expect(env.offlineMessage).not.toBeNull();
    expect(env.isFilterDisabled).toBe(true);

    env.onlineStatus = true;
    expect(env.userRows.length).toEqual(numUsersOnProject + 1);
    expect(env.offlineMessage).toBeNull();
    expect(env.isFilterDisabled).toBe(false);

    env.onlineStatus = false;
    const inviteeRow = 3;
    expect(env.userRows.length).toEqual(numUsersOnProject + 1);
    expect(env.offlineMessage).not.toBeNull();
    expect(env.isFilterDisabled).toBe(true);
    env.clickElement(env.userRowMoreMenuElement(inviteeRow));
    expect(env.removeUserItemOnRow(inviteeRow)).toBeNull();
    expect(env.cancelInviteItemOnRow(inviteeRow).attributes['disabled']).toBe('true');
    env.cleanup();
  }));

  it('should enable editing roles and permissions for non-admins', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.userRowMoreMenuElement(1));
    expect(env.rolesAndPermissionsItem().nativeElement.disabled).toBe(false);

    env.cleanup();
  }));

  it('should disable editing roles and permissions for admins', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.userRowMoreMenuElement(0));
    expect(env.rolesAndPermissionsItem().nativeElement.disabled).toBe(true);

    env.cleanup();
  }));

  it('should disable editing roles and permissions for pending invitees', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve([
      { email: 'alice@a.aa', role: 'sf_community_checker', expired: false },
      { email: 'charles@c.cc', role: 'sf_community_checker', expired: true }
    ]);
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.userRowMoreMenuElement(3));
    expect(env.rolesAndPermissionsItem().nativeElement.disabled).toBe(true);
    env.clickElement(env.userRowMoreMenuElement(4));
    expect(env.rolesAndPermissionsItem().nativeElement.disabled).toBe(true);

    env.cleanup();
  }));
});

class TestEnvironment {
  readonly fixture: ComponentFixture<CollaboratorsComponent>;
  readonly component: CollaboratorsComponent;
  readonly loader: HarnessLoader;
  readonly project01Id: string = 'project01';
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(hasConnection: boolean = true) {
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: this.project01Id }));
    const roles = new Map<string, ProjectRoleInfo>();
    for (const role of SF_PROJECT_ROLES) {
      roles.set(role.role, role);
    }
    roles.set(NONE_ROLE.role, NONE_ROLE);
    when(mockedProjectService.roles).thenReturn(roles);
    when(mockedProjectService.onlineInvite(this.project01Id, anything(), anything(), anything())).thenResolve();
    when(mockedProjectService.onlineInvitedUsers(this.project01Id)).thenResolve([]);
    when(mockedNoticeService.show(anything())).thenResolve();
    when(mockedUserService.getProfile(anything())).thenCall(userId =>
      this.realtimeService.subscribe(UserProfileDoc.COLLECTION, userId)
    );
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedProjectService.get(anything())).thenCall(projectId =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, projectId)
    );
    when(mockedProjectService.getProfile(anything())).thenCall(projectId =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, projectId)
    );
    when(
      mockedProjectService.onlineGetLinkSharingKey(this.project01Id, anything(), anything(), anything())
    ).thenResolve('linkSharingKey01');
    when(mockedProjectService.onlineSetUserProjectPermissions(this.project01Id, 'user02', anything())).thenCall(
      (projectId: string, userId: string, permissions: string[]) => {
        const projectDoc: SFProjectDoc = this.realtimeService.get(SFProjectDoc.COLLECTION, projectId);
        return projectDoc.submitJson0Op(op => op.set(p => p.userPermissions[userId], permissions));
      }
    );
    this.realtimeService.addSnapshots<UserProfile>(UserProfileDoc.COLLECTION, [
      {
        id: 'user01',
        data: createTestUserProfile({ displayName: 'User 01', avatarUrl: '' }, 1)
      },
      {
        id: 'user02',
        data: createTestUserProfile({ displayName: 'User 02', avatarUrl: '' }, 2)
      },
      {
        id: 'user03',
        data: createTestUserProfile({ displayName: 'User 03', avatarUrl: '' }, 3)
      }
    ]);

    this.testOnlineStatusService.setIsOnline(hasConnection);
    when(mockedDialogService.confirm(anything(), anything())).thenResolve(true);
    this.fixture = TestBed.createComponent(CollaboratorsComponent);
    this.component = this.fixture.componentInstance;
    this.loader = TestbedHarnessEnvironment.loader(this.fixture);
  }

  get offlineMessage(): DebugElement {
    return this.fixture.debugElement.query(By.css('#collaborators-offline-message'));
  }

  get noUsersLabel(): DebugElement {
    return this.fixture.debugElement.query(By.css('.no-users-label'));
  }

  get table(): DebugElement {
    return this.fixture.debugElement.query(By.css('#project-users-table'));
  }

  get tabControl(): DebugElement {
    return this.fixture.debugElement.query(By.css('.users-controls'));
  }

  get userRows(): DebugElement[] {
    // querying the debug table element doesn't seem to work, so we query the native element instead and convert back
    // to debug elements
    return Array.from(this.table.nativeElement.querySelectorAll('tr')).map(r => getDebugNode(r) as DebugElement);
  }

  get filterInput(): DebugElement {
    return this.fixture.debugElement.query(By.css('#project-user-filter input'));
  }

  get isFilterDisabled(): boolean {
    return this.filterInput.nativeElement.disabled;
  }

  set onlineStatus(hasConnection: boolean) {
    this.testOnlineStatusService.setIsOnline(hasConnection);
    tick();
    this.fixture.detectChanges();
  }

  getElementByTestId(testId: string): DebugElement {
    return this.fixture.debugElement.query(By.css(`[data-test-id="${testId}"]`));
  }

  cell(row: number, column: number): DebugElement {
    return this.userRows[row].children[column];
  }

  cellDisplayName(row: number, column: number): string {
    return this.cell(row, column).query(By.css('.display-name-label')).nativeElement.childNodes[0].textContent.trim();
  }

  cellRole(row: number, column: number): HTMLElement {
    return this.cell(row, column).query(By.css('em')).nativeElement;
  }

  removeUserItemOnRow(row: number): DebugElement {
    return this.userRows[row].query(By.css('.user-options button.remove-user'));
  }

  cancelInviteItemOnRow(row: number): DebugElement {
    return this.userRows[row].query(By.css('.user-options button.cancel-invite'));
  }

  rolesAndPermissionsItem(): DebugElement {
    return this.getElementByTestId('edit-roles-and-permissions');
  }

  userPermissionIcon(row: number): HTMLElement {
    return this.table.nativeElement.querySelectorAll('td.mat-column-questions_permission .mat-icon')[row];
  }

  tabElementFromIndex(index: number): DebugElement {
    return this.tabControl.queryAll(By.css('.mat-mdc-tab'))[index];
  }

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = (element as DebugElement).nativeElement as HTMLElement;
    }

    element.click();
    flush();
    this.fixture.detectChanges();
  }

  userRowMoreMenuElement(row: number): DebugElement {
    return this.userRows[row].query(By.css('.user-more-menu'));
  }

  elementTextContent(element: DebugElement): string {
    return element.nativeElement.textContent;
  }

  setInputValue(input: HTMLInputElement | DebugElement, value: string): void {
    if (input instanceof DebugElement) {
      input = (input as DebugElement).nativeElement as HTMLInputElement;
    }

    input.value = value;
    input.dispatchEvent(new Event('keyup'));
    this.fixture.detectChanges();
    tick();
  }

  setupProjectData(userRoles?: { [userRef: string]: string }): void {
    if (userRoles === undefined) {
      userRoles = {
        user01: SFProjectRole.ParatextAdministrator,
        user02: SFProjectRole.ParatextTranslator,
        user03: SFProjectRole.CommunityChecker
      };
    }
    this.setupThisProjectData(this.project01Id, this.createProject(userRoles));
  }

  updateCheckingProperties(config: CheckingConfig): Promise<boolean> {
    const projectDoc: SFProjectDoc = this.realtimeService.get(SFProjectDoc.COLLECTION, this.project01Id);
    return projectDoc.submitJson0Op(op => {
      op.set(p => p.checkingConfig, config);
    });
  }

  cleanup(): void {
    this.loader.getAllHarnesses(MatMenuHarness).then(harnesses => {
      for (const harness of harnesses) {
        harness.close();
      }
    });
    flush();
    this.fixture.detectChanges();
  }

  private createProject(userRoles: { [userRef: string]: string }): SFProject {
    return createTestProject({
      checkingConfig: {
        checkingEnabled: false,
        usersSeeEachOthersResponses: false,
        answerExportMethod: CheckingAnswerExport.MarkedForExport
      },
      userRoles,
      paratextUsers: paratextUsersFromRoles(userRoles)
    });
  }

  private setupThisProjectData(projectId: string, project: SFProject): void {
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: projectId,
      data: project
    });
  }
}
