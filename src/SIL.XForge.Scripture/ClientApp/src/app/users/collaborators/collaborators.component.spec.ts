import { DebugElement, getDebugNode } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { UserProfile } from 'realtime-server/lib/common/models/user';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { AvatarTestingModule } from 'xforge-common/avatar/avatar-testing.module';
import { LocationService } from 'xforge-common/location.service';
import { MemoryRealtimeOfflineStore } from 'xforge-common/memory-realtime-offline-store';
import { MemoryRealtimeDocAdapter } from 'xforge-common/memory-realtime-remote-store';
import { NONE_ROLE, ProjectRoleInfo } from 'xforge-common/models/project-role-info';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_PROJECT_ROLES } from '../../core/models/sf-project-role-info';
import { SFProjectService } from '../../core/sf-project.service';
import { ShareControlComponent } from '../../shared/share/share-control.component';
import { CollaboratorsComponent } from './collaborators.component';

describe('CollaboratorsComponent', () => {
  it('should not display no-users label while loading', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupNullProjectData();
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

    expect(env.cellDisplayName(0, 1).innerText).toEqual('User 01');
    expect(env.cellRole(0, 2).innerText).toEqual('Administrator');
    expect(env.removeUserButtonOnRow(0)).toBeTruthy();
    expect(env.cancelInviteButtonOnRow(0)).toBeFalsy();

    expect(env.cellDisplayName(1, 1).innerText).toEqual('User 02');
    expect(env.cellRole(1, 2).innerText).toEqual('Translator');
    expect(env.removeUserButtonOnRow(1)).toBeTruthy();
    expect(env.cancelInviteButtonOnRow(1)).toBeFalsy();

    expect(env.cellDisplayName(2, 1).innerText).toEqual('User 03');
    expect(env.cellRole(2, 2).innerText).toEqual('Community Checker');
    expect(env.removeUserButtonOnRow(2)).toBeTruthy();
    expect(env.cancelInviteButtonOnRow(2)).toBeFalsy();
  }));

  it('displays invited users', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve([
      'alice@a.aa',
      'bob@b.bb',
      'charles@c.cc'
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
    // Invitee row has cancel button but not remove button.
    expect(env.removeUserButtonOnRow(inviteeRow)).toBeFalsy();
    expect(env.cancelInviteButtonOnRow(inviteeRow)).toBeTruthy();
  }));

  // Not specifying behaviour for when current user is not a project admin,
  // since currently this component is only accessed by admins.

  it('should uninvite user from project', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve(['alice@a.aa']);
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    const inviteeRow = 3;
    env.clickElement(env.cancelInviteButtonOnRow(inviteeRow));
    verify(env.mockedProjectService.onlineUninviteUser(env.project01Id, 'alice@a.aa')).once();

    expect().nothing();
  }));

  it('should remove user from project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.removeUserButtonOnRow(1));
    verify(env.mockedProjectService.onlineRemoveUser(anything(), anything())).once();

    expect().nothing();
  }));

  it('should filter users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    when(env.mockedProjectService.onlineInvitedUsers(env.project01Id)).thenResolve(['bob@example.com']);
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
});

class TestEnvironment {
  readonly fixture: ComponentFixture<CollaboratorsComponent>;
  readonly component: CollaboratorsComponent;
  readonly project01Id: string = 'project01';

  readonly mockedActivatedRoute = mock(ActivatedRoute);
  readonly mockedLocationService = mock(LocationService);
  readonly mockedNoticeService = mock(NoticeService);
  readonly mockedProjectService = mock(SFProjectService);
  readonly mockedUserService = mock(UserService);

  private readonly offlineStore = new MemoryRealtimeOfflineStore();

  constructor() {
    when(this.mockedActivatedRoute.params).thenReturn(of({ projectId: this.project01Id }));
    const roles = new Map<string, ProjectRoleInfo>();
    for (const role of SF_PROJECT_ROLES) {
      roles.set(role.role, role);
    }
    roles.set(NONE_ROLE.role, NONE_ROLE);
    when(this.mockedProjectService.roles).thenReturn(roles);
    when(this.mockedProjectService.onlineInvite(this.project01Id, anything())).thenResolve();
    when(this.mockedProjectService.onlineInvitedUsers(this.project01Id)).thenResolve([]);
    when(this.mockedNoticeService.show(anything())).thenResolve();
    when(this.mockedLocationService.origin).thenReturn('https://scriptureforge.org');
    this.addUserProfile('user01', { displayName: 'User 01', avatarUrl: '' });
    this.addUserProfile('user02', { displayName: 'User 02', avatarUrl: '' });
    this.addUserProfile('user03', { displayName: 'User 03', avatarUrl: '' });
    TestBed.configureTestingModule({
      declarations: [CollaboratorsComponent, ShareControlComponent],
      imports: [NoopAnimationsModule, AvatarTestingModule, UICommonModule],
      providers: [
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: LocationService, useFactory: () => instance(this.mockedLocationService) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedProjectService) },
        { provide: UserService, useFactory: () => instance(this.mockedUserService) }
      ]
    });

    this.fixture = TestBed.createComponent(CollaboratorsComponent);
    this.component = this.fixture.componentInstance;
  }

  get emailInput(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#email-input');
  }

  get inviteButton(): HTMLElement {
    return this.fixture.nativeElement.querySelector('#btn-invite');
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

  get paginator(): DebugElement {
    return this.fixture.debugElement.query(By.css('mat-paginator'));
  }

  get nextPageButton(): DebugElement {
    return this.paginator.query(By.css('.mat-paginator-navigation-next'));
  }

  cell(row: number, column: number): DebugElement {
    return this.userRows[row].children[column];
  }

  cellDisplayName(row: number, column: number): HTMLElement {
    return this.cell(row, column).query(By.css('.display-name-label')).nativeElement;
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

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = (element as DebugElement).nativeElement as HTMLElement;
    }

    element.click();
    this.fixture.detectChanges();
    tick(1000);
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
    const inputElem: HTMLInputElement = element.querySelector('input');
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('input'));
    this.fixture.detectChanges();
    tick();
  }

  setupProjectData(): void {
    this.setupThisProjectData(
      this.project01Id,
      this.createProject({
        user01: SFProjectRole.ParatextAdministrator,
        user02: SFProjectRole.ParatextTranslator,
        user03: SFProjectRole.CommunityChecker
      })
    );
  }

  setupNullProjectData(): void {
    this.setupThisProjectData(this.project01Id, null);
  }

  setupProjectDataWithNoUsers(): void {
    this.setupThisProjectData(this.project01Id, this.createProject({}));
  }

  private createProject(userRoles: { [userRef: string]: string }): SFProject {
    return {
      name: 'Project 01',
      paratextId: 'pt01',
      texts: [],
      inputSystem: { tag: 'en', languageName: 'English' },
      sync: { queuedCount: 0 },
      translateConfig: { translationSuggestionsEnabled: false },
      checkingConfig: {
        checkingEnabled: false,
        usersSeeEachOthersResponses: false,
        shareEnabled: false,
        shareLevel: CheckingShareLevel.Specific
      },
      userRoles
    };
  }

  private addUserProfile(id: string, user: UserProfile): void {
    when(this.mockedUserService.getProfile(id)).thenResolve(
      new UserProfileDoc(this.offlineStore, new MemoryRealtimeDocAdapter(UserProfileDoc.COLLECTION, id, user))
    );
  }

  private setupThisProjectData(projectId: string, project: SFProject): void {
    const projectDoc = new SFProjectDoc(
      this.offlineStore,
      new MemoryRealtimeDocAdapter(SFProjectDoc.COLLECTION, projectId, project)
    );
    when(this.mockedProjectService.get(projectId)).thenResolve(projectDoc);
  }
}
