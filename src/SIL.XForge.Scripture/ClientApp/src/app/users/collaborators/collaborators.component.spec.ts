import { HarnessLoader } from '@angular/cdk/testing';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { DebugElement, getDebugNode } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatMenuHarness } from '@angular/material/menu/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { createTestUserProfile } from 'realtime-server/lib/esm/common/models/user-test-data';
import { CheckingAnswerExport, CheckingConfig } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { SFProject, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { of } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
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
import { configureTestingModule, emptyHammerLoader, getTestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_PROJECT_ROLES } from '../../core/models/sf-project-role-info';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { SharedModule } from '../../shared/shared.module';
import { paratextUsersFromRoles } from '../../shared/test-utils';
import { CollaboratorsComponent, UserType } from './collaborators.component';

const mockedActivatedProject = mock(ActivatedProjectService);
const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedDialogService = mock(DialogService);

describe('CollaboratorsComponent', () => {
  configureTestingModule(() => ({
    imports: [
      CollaboratorsComponent,
      NoopAnimationsModule,
      UICommonModule,
      getTestTranslocoModule(),
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY),
      SharedModule.forRoot(),
      TestOnlineStatusModule.forRoot(),
      AvatarComponent
    ],
    providers: [
      { provide: ActivatedProjectService, useMock: mockedActivatedProject },
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

    expect(env.noUsersLabel(UserType.Paratext)).toBeNull();
    expect(env.noUsersLabel(UserType.Guest)).toBeNull();
  }));

  it('should display message when there are no users in a table', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData({ user01: SFProjectRole.ParatextAdministrator, user02: SFProjectRole.ParatextTranslator });
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    const numParatextUsers = 6;
    expect(env.userRowsByCategory(UserType.Paratext).length).toEqual(numParatextUsers);
    expect(env.noUsersLabel(UserType.Paratext)).toBeNull();
    expect(env.userTable(UserType.Guest)).toBeNull();
    expect(env.noUsersLabel(UserType.Guest)).not.toBeNull();
  }));

  it('should display paratext users and project guests', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    expect(env.noUsersLabel(UserType.Paratext)).toBeNull();
    expect(env.noUsersLabel(UserType.Guest)).toBeNull();
    const numParatextUsers = 6;
    const numProjectGuests = 1;
    expect(env.userRowsByCategory(UserType.Paratext).length).toEqual(numParatextUsers);
    expect(env.userRowsByCategory(UserType.Guest).length).toEqual(numProjectGuests);

    expect(env.cellDisplayName(0, 1, UserType.Paratext)).toContain('User 01');
    expect(env.cellRole(0, 2, UserType.Paratext).innerText).toEqual('Administrator');
    env.clickElement(env.userRowMoreMenuElement(0, UserType.Paratext));

    expect(env.removeUserItemOnRow(0, UserType.Paratext)).toBeNull();
    expect(env.cancelInviteItemOnRow(0, UserType.Paratext)).toBeNull();
    expect(env.cellDisplayName(1, 1, UserType.Paratext)).toEqual('User 02');
    expect(env.cellRole(1, 2, UserType.Paratext).innerText).toEqual('Translator');
    env.clickElement(env.userRowMoreMenuElement(1, UserType.Paratext));
    expect(env.removeUserItemOnRow(1, UserType.Paratext)).toBeTruthy();
    expect(env.cancelInviteItemOnRow(1, UserType.Paratext)).toBeFalsy();

    expect(env.cellDisplayName(0, 1, UserType.Guest)).toEqual('User 03');
    expect(env.cellRole(0, 2, UserType.Guest).innerText).toEqual('Community Checker');
    env.clickElement(env.userRowMoreMenuElement(0, UserType.Guest));
    expect(env.removeUserItemOnRow(0, UserType.Guest)).toBeTruthy();
    expect(env.cancelInviteItemOnRow(0, UserType.Guest)).toBeFalsy();
    env.cleanup();
  }));

  it('display paratext users not on project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    const numParatextUsers = 6;
    expect(env.userRowsByCategory(UserType.Paratext).length).toEqual(numParatextUsers);
    expect(
      env.component.projectUsers.find(u => u.userType === UserType.Paratext)!.rows.map(r => r.user.displayName)
    ).toEqual(['User 01', 'User 02', 'User C', 'User B', 'User A', 'User No Role']);
    expect(env.userRowsByCategory(UserType.Paratext)[0].nativeElement.querySelector('.user-more-menu')).not.toBeNull();
    expect(env.userRowsByCategory(UserType.Paratext)[1].nativeElement.querySelector('.user-more-menu')).not.toBeNull();
    expect(env.userRowsByCategory(UserType.Paratext)[2].nativeElement.querySelector('.user-more-menu')).toBeNull();
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

    const numParatextUsers = 6;
    const numGuestUsers = 1;
    const numInvitees = 3;
    expect(env.userRowsByCategory(UserType.Paratext).length).toEqual(numParatextUsers);
    expect(env.userRowsByCategory(UserType.Guest).length).toEqual(numGuestUsers + numInvitees);

    const inviteeRow = 1;
    const inviteeDisplay = env.elementTextContent(env.cell(inviteeRow, 1, UserType.Guest));
    expect(inviteeDisplay).toContain('Awaiting');
    expect(inviteeDisplay).toContain('alice@a.aa');
    const expiredRow = 3;
    const expiredInvitee = env.elementTextContent(env.cell(expiredRow, 1, UserType.Guest));
    expect(expiredInvitee).toContain('Invitation has expired');
    expect(expiredInvitee).toContain('charles@c.cc');

    // Invitee row has cancel button but not remove button.
    env.clickElement(env.userRowMoreMenuElement(inviteeRow, UserType.Guest));
    expect(env.removeUserItemOnRow(inviteeRow, UserType.Guest)).toBeFalsy();
    expect(env.cancelInviteItemOnRow(inviteeRow, UserType.Guest)).toBeTruthy();
    env.cleanup();
  }));

  it('sorts by project users first, then paratext members not on project, then invitees', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    when(mockedProjectService.onlineInvitedUsers('project01')).thenResolve([
      { email: 'charles@c.cc', role: 'sf_community_checker', expired: false },
      { email: 'bob@b.bb', role: 'sf_community_checker', expired: false },
      { email: 'alice@a.aa', role: 'sf_community_checker', expired: false }
    ]);

    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    const numParatextUsers = 6;
    const numGuestUsers = 4;
    expect(env.userRowsByCategory(UserType.Paratext).length).toEqual(numParatextUsers);
    expect(env.userRowsByCategory(UserType.Guest).length).toEqual(numGuestUsers);
    const paratextRows = Array.from(env.component.projectUsers.find(u => u.userType === UserType.Paratext)!.rows);
    expect(paratextRows.map(r => r.user.displayName)).toEqual([
      'User 01',
      'User 02',
      'User C',
      'User B',
      'User A',
      'User No Role'
    ]);
    const guestRows = Array.from(env.component.projectUsers.find(u => u.userType === UserType.Guest)!.rows);
    expect(guestRows.map(r => r.user.displayName ?? r.user.email)).toEqual([
      'User 03',
      'alice@a.aa',
      'bob@b.bb',
      'charles@c.cc'
    ]);
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
    const numGuestUsers = 1;
    let numInvitees = 1;
    expect(env.userRowsByCategory(UserType.Guest).length).toEqual(numGuestUsers + numInvitees);

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
    expect(env.userRowsByCategory(UserType.Guest).length).toEqual(numGuestUsers + numInvitees);
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
    const numGuestUsers = 1;
    let numInvitees = 1;
    expect(env.userRowsByCategory(UserType.Guest).length).toEqual(numGuestUsers + numInvitees);

    const inviteeRow = 1;
    const inviteeDisplay = env.elementTextContent(env.cell(inviteeRow, 1, UserType.Guest));
    expect(inviteeDisplay).toContain('Awaiting');
    expect(inviteeDisplay).toContain('alice@a.aa');
    // Invitee row has cancel button but not remove button.
    env.clickElement(env.userRowMoreMenuElement(inviteeRow, UserType.Guest));
    expect(env.removeUserItemOnRow(inviteeRow, UserType.Guest)).toBeFalsy();
    expect(env.cancelInviteItemOnRow(inviteeRow, UserType.Guest)).toBeTruthy();

    // Uninvite Alice
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve([]);
    env.clickElement(env.cancelInviteItemOnRow(inviteeRow, UserType.Guest));
    verify(mockedProjectService.onlineUninviteUser(env.project01Id, 'alice@a.aa')).once();

    // Alice is not shown as in invitee
    numInvitees = 0;
    expect(env.userRowsByCategory(UserType.Guest).length).toEqual(numGuestUsers + numInvitees);
  }));

  it('should remove user from project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    env.clickElement(env.userRowMoreMenuElement(1, UserType.Paratext));
    env.clickElement(env.removeUserItemOnRow(1, UserType.Paratext));
    verify(mockedProjectService.onlineRemoveUser(anything(), anything())).once();
    expect().nothing();
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
    const numGuestUsers = 1;
    expect(env.offlineMessage).not.toBeNull();

    env.onlineStatus = true;
    expect(env.userRowsByCategory(UserType.Guest).length).toEqual(numGuestUsers + 1);
    expect(env.offlineMessage).toBeNull();

    env.onlineStatus = false;
    const inviteeRow = 1;
    expect(env.userRowsByCategory(UserType.Guest).length).toEqual(numGuestUsers + 1);
    expect(env.offlineMessage).not.toBeNull();
    env.clickElement(env.userRowMoreMenuElement(inviteeRow, UserType.Guest));
    expect(env.removeUserItemOnRow(inviteeRow, UserType.Guest)).toBeNull();
    expect(env.cancelInviteItemOnRow(inviteeRow, UserType.Guest).attributes['disabled']).toBe('true');
    env.cleanup();
  }));

  it('should enable editing roles and permissions for non-admins', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.userRowMoreMenuElement(1, UserType.Paratext));
    expect(env.rolesAndPermissionsItem().nativeElement.disabled).toBe(false);

    env.cleanup();
  }));

  it('should disable editing roles and permissions for admins', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.userRowMoreMenuElement(0, UserType.Paratext));
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

    const inviteeRow = 1;
    env.clickElement(env.userRowMoreMenuElement(inviteeRow, UserType.Guest));
    expect(env.rolesAndPermissionsItem().nativeElement.disabled).toBe(true);
    env.clickElement(env.userRowMoreMenuElement(inviteeRow + 1, UserType.Guest));
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

  set onlineStatus(hasConnection: boolean) {
    this.testOnlineStatusService.setIsOnline(hasConnection);
    tick();
    this.fixture.detectChanges();
  }

  noUsersLabel(userType: UserType): DebugElement {
    return this.fixture.debugElement.query(By.css(`#no-users-${userType}`));
  }

  userTable(userType: UserType): DebugElement {
    return this.fixture.debugElement.query(By.css(`#${userType}`));
  }

  userRowsByCategory(userType: UserType): DebugElement[] {
    // querying the debug table element doesn't seem to work, so we query the native element instead and convert back
    // to debug elements
    return Array.from(this.userTable(userType).nativeElement.querySelectorAll('tr')).map(
      r => getDebugNode(r) as DebugElement
    );
  }

  getElementByTestId(testId: string): DebugElement {
    return this.fixture.debugElement.query(By.css(`[data-test-id="${testId}"]`));
  }

  cell(row: number, column: number, category: UserType): DebugElement {
    return this.userRowsByCategory(category)[row].children[column];
  }

  cellDisplayName(row: number, column: number, userType: UserType): string {
    return this.cell(row, column, userType)
      .query(By.css('.display-name-label'))
      .nativeElement.childNodes[0].textContent.trim();
  }

  cellRole(row: number, column: number, userType: UserType): HTMLElement {
    return this.cell(row, column, userType).query(By.css('em')).nativeElement;
  }

  removeUserItemOnRow(row: number, userType: UserType): DebugElement {
    return this.userRowsByCategory(userType)[row].query(By.css('.user-options button.remove-user'));
  }

  cancelInviteItemOnRow(row: number, userType: UserType): DebugElement {
    return this.userRowsByCategory(userType)[row].query(By.css('.user-options button.cancel-invite'));
  }

  rolesAndPermissionsItem(): DebugElement {
    return this.getElementByTestId('edit-roles-and-permissions');
  }

  userPermissionIcon(row: number, userType: UserType): HTMLElement {
    return this.userTable(userType).nativeElement.querySelectorAll('td.mat-column-questions_permission .mat-icon')[row];
  }

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = (element as DebugElement).nativeElement as HTMLElement;
    }

    element.click();
    flush();
    this.fixture.detectChanges();
  }

  userRowMoreMenuElement(row: number, userType: UserType): DebugElement {
    return this.userRowsByCategory(userType)[row].query(By.css('.user-more-menu'));
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
        user03: SFProjectRole.CommunityChecker,
        user02: SFProjectRole.ParatextTranslator,
        user01: SFProjectRole.ParatextAdministrator
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
    const paratextUsers: ParatextUserProfile[] = paratextUsersFromRoles(userRoles);
    const ptMembersNotConnected = [
      { username: 'User A', opaqueUserId: 'opaqueA', role: SFProjectRole.ParatextObserver },
      { username: 'User B', opaqueUserId: 'opaqueB', role: SFProjectRole.ParatextTranslator },
      { username: 'User C', opaqueUserId: 'opaqueC', role: SFProjectRole.ParatextAdministrator },
      { username: 'User No Role', opaqueUserId: 'opaqueNoRole' },
      { username: 'User Not Member', opaqueUserId: 'opaqueNotMember', role: SFProjectRole.None }
    ];
    paratextUsers.push(...ptMembersNotConnected);
    return createTestProject({
      checkingConfig: {
        checkingEnabled: false,
        usersSeeEachOthersResponses: false,
        answerExportMethod: CheckingAnswerExport.MarkedForExport
      },
      userRoles,
      paratextUsers
    });
  }

  private setupThisProjectData(projectId: string, project: SFProjectProfile): void {
    when(mockedActivatedProject.projectId$).thenReturn(of(projectId));
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectDoc.COLLECTION, {
      id: projectId,
      data: project
    });
  }
}
