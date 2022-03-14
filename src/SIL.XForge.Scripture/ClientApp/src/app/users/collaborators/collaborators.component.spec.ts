import { DebugElement, getDebugNode } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { CookieService } from 'ngx-cookie-service';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { CheckingConfig, CheckingShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TranslateShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { BehaviorSubject, of } from 'rxjs';
import { anything, deepEqual, mock, resetCalls, verify, when } from 'ts-mockito';
import { AuthService } from 'xforge-common/auth.service';
import { AvatarTestingModule } from 'xforge-common/avatar/avatar-testing.module';
import { BugsnagService } from 'xforge-common/bugsnag.service';
import { CommandError } from 'xforge-common/command.service';
import { LocationService } from 'xforge-common/location.service';
import { NONE_ROLE, ProjectRoleInfo } from 'xforge-common/models/project-role-info';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, emptyHammerLoader, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_PROJECT_ROLES } from '../../core/models/sf-project-role-info';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareControlComponent } from '../../shared/share/share-control.component';
import { CollaboratorsComponent } from './collaborators.component';

const mockedAuthService = mock(AuthService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedLocationService = mock(LocationService);
const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(SFProjectService);
const mockedUserService = mock(UserService);
const mockedBugsnagService = mock(BugsnagService);
const mockedCookieService = mock(CookieService);
const mockedPwaService = mock(PwaService);

describe('CollaboratorsComponent', () => {
  configureTestingModule(() => ({
    declarations: [CollaboratorsComponent, ShareControlComponent],
    imports: [
      NoopAnimationsModule,
      AvatarTestingModule,
      UICommonModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      { provide: AuthService, useMock: mockedAuthService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: LocationService, useMock: mockedLocationService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      { provide: BugsnagService, useMock: mockedBugsnagService },
      { provide: CookieService, useMock: mockedCookieService },
      { provide: PwaService, useMock: mockedPwaService },
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

  it('should display message when there are no users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectDataWithNoUsers();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

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
    expect(env.cellRole(0, 2).innerText).toEqual('Administrator');
    expect(env.removeUserButtonOnRow(0)).toBeNull();
    expect(env.cancelInviteButtonOnRow(0)).toBeNull();

    expect(env.cellDisplayName(1, 1)).toEqual('User 02');
    expect(env.cellRole(1, 2).innerText).toEqual('Translator');
    expect(env.removeUserButtonOnRow(1)).toBeTruthy();
    expect(env.cancelInviteButtonOnRow(1)).toBeFalsy();

    expect(env.cellDisplayName(2, 1)).toEqual('User 03');
    expect(env.cellRole(2, 2).innerText).toEqual('Community Checker');
    expect(env.removeUserButtonOnRow(2)).toBeTruthy();
    expect(env.cancelInviteButtonOnRow(2)).toBeFalsy();
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
    expect(env.removeUserButtonOnRow(inviteeRow)).toBeFalsy();
    expect(env.cancelInviteButtonOnRow(inviteeRow)).toBeTruthy();
  }));

  it('handle error from invited users query, when user is not on project', fakeAsync(() => {
    // If an admin user is removed from the project, or loses admin
    // privileges, while looking at the component, they will run loadUsers
    // and throw an error calling onlineInvitedUsers.
    // Handle that error.

    const env = new TestEnvironment();
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenThrow(new CommandError(1, 'error', null));
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
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenThrow(new CommandError(1, 'error', null));
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
    expect(env.removeUserButtonOnRow(inviteeRow)).toBeFalsy();
    expect(env.cancelInviteButtonOnRow(inviteeRow)).toBeTruthy();

    // Uninvite Alice
    when(mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve([]);
    env.clickElement(env.cancelInviteButtonOnRow(inviteeRow));
    verify(mockedProjectService.onlineUninviteUser(env.project01Id, 'alice@a.aa')).once();

    // Alice is not shown as in invitee
    numInvitees = 0;
    expect(env.userRows.length).toEqual(numUsersOnProject + numInvitees);

    expect().nothing();
  }));

  it('should remove user from project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.removeUserButtonOnRow(1));
    verify(mockedProjectService.onlineRemoveUser(anything(), anything())).once();

    expect().nothing();
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

  it('should page', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.component.pageSize = 2;
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.nextPageButton);

    expect(env.userRows.length).toEqual(1);
  }));

  it('should not page if matches are less than pageSize', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.component.pageSize = 2;
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    // Prove initial setup with paging
    expect(env.userRows.length).toEqual(2);
    // Filter out 2 out of the 3 entries
    env.setInputValue(env.filterInput, '02');
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    // Verify that the table is filtered
    expect(env.userRows.length).toEqual(1);

    // SUT
    expect(env.nextPageButton.nativeElement.disabled).toBe(true);
    expect(env.elementTextContent(env.paginatorLabel).trim()).toEqual('1 - 1 of 1');
  }));

  it('should not reduce page size when using next and prev', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.component.pageSize = 2;
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    // verify that we have 2 items on page one
    expect(env.userRows.length).toEqual(2);
    // get to page 2
    env.clickElement(env.nextPageButton);
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    // verify that we have 1 item on page 2
    expect(env.userRows.length).toEqual(1);
    env.clickElement(env.prevPageButton);
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    // SUT
    expect(env.userRows.length).toEqual(2);
    expect(env.elementTextContent(env.paginatorLabel).trim()).toEqual('1 - 2 of 3');
  }));

  it('should reset the page index when the filter is changed', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.component.pageSize = 2;
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    // get to page 2
    env.clickElement(env.nextPageButton);
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    // Filter for an item on page 1
    env.setInputValue(env.filterInput, '01');
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    // SUT
    expect(env.userRows.length).toEqual(1);
    expect(env.nextPageButton.nativeElement.disabled).toBe(true);
    expect(env.elementTextContent(env.paginatorLabel).trim()).toEqual('1 - 1 of 1');
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
    expect(env.userRows.length).toEqual(numUsersOnProject + 1);
    expect(env.offlineMessage).not.toBeNull();
    expect(env.isFilterDisabled).toBe(true);
    expect(env.removeUserButtonOnRow(0)).toBeNull();
    expect(env.cancelInviteButtonOnRow(3).nativeElement.disabled).toBe(true);
  }));

  it('should allow granting question permission to non admins', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    // With checking disabled, the checkboxes should not exist
    expect(env.userPermissionCheckbox(0)).toBeUndefined();

    // Enable checking
    const checkingConfig: CheckingConfig = {
      checkingEnabled: true,
      shareEnabled: true,
      shareLevel: CheckingShareLevel.Anyone,
      usersSeeEachOthersResponses: false
    };
    env.updateCheckingProperties(checkingConfig);
    tick();
    env.fixture.detectChanges();

    // project admins always have permission, so the checkbox should be checked, disabled, and do nothing when clicked
    expect(env.userPermissionCheckbox(0).classList).toContain('mat-checkbox-disabled');
    expect(env.userPermissionCheckbox(0).classList).toContain('mat-checkbox-checked');
    env.clickElement(env.userPermissionCheckbox(0));
    verify(mockedProjectService.onlineSetUserProjectPermissions(anything(), anything(), anything())).never();

    // translators can be given permission, or not have permission
    expect(env.userPermissionCheckbox(1).classList).not.toContain('mat-checkbox-disabled');
    expect(env.userPermissionCheckbox(1).classList).not.toContain('mat-checkbox-checked');
    env.clickElement(env.userPermissionCheckbox(1));
    expect(env.userPermissionCheckbox(1).classList).toContain('mat-checkbox-checked');
    const permissions = [
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Create),
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Edit)
    ];
    verify(
      mockedProjectService.onlineSetUserProjectPermissions(env.project01Id, 'user02', deepEqual(permissions))
    ).once();

    // community checkers cannot be given permission to manage questions
    expect(env.userPermissionCheckbox(2)).toBeUndefined();

    resetCalls(mockedProjectService);

    // clicking a translator's checkbox should do nothing when offline
    env.onlineStatus = false;
    expect(env.userPermissionCheckbox(1).classList).toContain('mat-checkbox-disabled');
    expect(env.userPermissionCheckbox(1).classList).toContain('mat-checkbox-checked');
    env.clickElement(env.userPermissionCheckbox(1));
    expect(env.userPermissionCheckbox(1).classList).toContain('mat-checkbox-checked');
    verify(mockedProjectService.onlineSetUserProjectPermissions(anything(), anything(), anything())).never();
  }));
});

class TestEnvironment {
  readonly fixture: ComponentFixture<CollaboratorsComponent>;
  readonly component: CollaboratorsComponent;
  readonly project01Id: string = 'project01';
  private isOnline: BehaviorSubject<boolean>;

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
    when(mockedLocationService.origin).thenReturn('https://scriptureforge.org');
    when(mockedUserService.getProfile(anything())).thenCall(userId =>
      this.realtimeService.subscribe(UserProfileDoc.COLLECTION, userId)
    );
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedProjectService.get(anything())).thenCall(projectId =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, projectId)
    );
    when(mockedProjectService.onlineGetLinkSharingKey(this.project01Id, anything())).thenResolve('linkSharingKey01');
    when(mockedProjectService.onlineSetUserProjectPermissions(this.project01Id, 'user02', anything())).thenCall(
      (projectId: string, userId: string, permissions: string[]) => {
        const projectDoc: SFProjectDoc = this.realtimeService.get(SFProjectDoc.COLLECTION, projectId);
        return projectDoc.submitJson0Op(op => op.set(p => p.userPermissions[userId], permissions));
      }
    );
    this.realtimeService.addSnapshots<UserProfile>(UserProfileDoc.COLLECTION, [
      {
        id: 'user01',
        data: { displayName: 'User 01', avatarUrl: '' }
      },
      {
        id: 'user02',
        data: { displayName: 'User 02', avatarUrl: '' }
      },
      {
        id: 'user03',
        data: { displayName: 'User 03', avatarUrl: '' }
      }
    ]);

    this.isOnline = new BehaviorSubject<boolean>(hasConnection);
    when(mockedPwaService.onlineStatus).thenReturn(this.isOnline.asObservable());
    when(mockedPwaService.isOnline).thenReturn(this.isOnline.value);
    this.fixture = TestBed.createComponent(CollaboratorsComponent);
    this.component = this.fixture.componentInstance;
  }

  get emailInput(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#email-input');
  }

  get inviteButton(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#btn-invite');
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

  get userRows(): DebugElement[] {
    // querying the debug table element doesn't seem to work, so we query the native element instead and convert back
    // to debug elements
    return Array.from(this.table.nativeElement.querySelectorAll('tr')).map(r => getDebugNode(r) as DebugElement);
  }

  get filterInput(): DebugElement {
    return this.fixture.debugElement.query(By.css('#project-user-filter'));
  }

  get isFilterDisabled(): boolean {
    return this.filterInput.query(By.css('input')).nativeElement.disabled;
  }

  get paginator(): DebugElement {
    return this.fixture.debugElement.query(By.css('mat-paginator'));
  }

  get paginatorLabel(): DebugElement {
    return this.paginator.query(By.css('.mat-paginator-range-label'));
  }

  get nextPageButton(): DebugElement {
    return this.paginator.query(By.css('.mat-paginator-navigation-next'));
  }

  get prevPageButton(): DebugElement {
    return this.paginator.query(By.css('.mat-paginator-navigation-previous'));
  }

  set onlineStatus(hasConnection: boolean) {
    this.isOnline.next(hasConnection);
    tick();
    this.fixture.detectChanges();
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

  removeUserButtonOnRow(row: number): DebugElement {
    return this.userRows[row].query(By.css('button.remove-user'));
  }

  cancelInviteButtonOnRow(row: number): DebugElement {
    return this.userRows[row].query(By.css('button.cancel-invite'));
  }

  userPermissionCheckbox(index: number): HTMLElement {
    return this.table.nativeElement.querySelectorAll('td.mat-column-questions_permission .mat-checkbox')[index];
  }

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = (element as DebugElement).nativeElement as HTMLElement;
    }

    element.click();
    flush();
    this.fixture.detectChanges();
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

  setTextFieldValue(element: HTMLElement, value: string) {
    const inputElem = element.querySelector('input') as HTMLInputElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
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

  setupProjectDataWithNoUsers(): void {
    this.setupThisProjectData(this.project01Id, this.createProject({}));
  }

  updateCheckingProperties(config: CheckingConfig): Promise<boolean> {
    const projectDoc: SFProjectDoc = this.realtimeService.get(SFProjectDoc.COLLECTION, this.project01Id);
    return projectDoc.submitJson0Op(op => {
      op.set(p => p.checkingConfig, config);
    });
  }

  private createProject(userRoles: { [userRef: string]: string }): SFProject {
    return {
      name: 'Project 01',
      paratextId: 'pt01',
      shortName: 'P01',
      texts: [],
      writingSystem: { tag: 'en' },
      sync: { queuedCount: 0 },
      translateConfig: {
        translationSuggestionsEnabled: false,
        shareEnabled: false,
        shareLevel: TranslateShareLevel.Specific
      },
      checkingConfig: {
        checkingEnabled: false,
        usersSeeEachOthersResponses: false,
        shareEnabled: false,
        shareLevel: CheckingShareLevel.Specific
      },
      editable: true,
      userRoles,
      userPermissions: {}
    };
  }

  private setupThisProjectData(projectId: string, project: SFProject): void {
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: projectId,
      data: project
    });
  }
}
