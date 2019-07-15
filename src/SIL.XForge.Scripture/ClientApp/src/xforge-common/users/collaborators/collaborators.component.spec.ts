import { DebugElement, getDebugNode } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { LocationService } from 'xforge-common/location.service';
import { ShareComponent } from 'xforge-common/share/share.component';
import { MockAvatarModule } from '../../avatar/mock-avatar.module';
import { MapQueryResults } from '../../json-api.service';
import { Project, ProjectRef } from '../../models/project';
import { NONE_ROLE, ProjectRole } from '../../models/project-role';
import { ProjectUser, ProjectUserRef } from '../../models/project-user';
import { Resource } from '../../models/resource';
import { User, UserRef } from '../../models/user';
import { NoticeService } from '../../notice.service';
import { ProjectUserService } from '../../project-user.service';
import { ProjectService } from '../../project.service';
import { UICommonModule } from '../../ui-common.module';
import { CollaboratorsComponent } from './collaborators.component';

describe('CollaboratorsComponent', () => {
  it('should not display no-users label while loading', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupNullProjectData();
    env.fixture.detectChanges();
    tick();

    expect(env.noUsersLabel).toBeNull();
  }));

  it('should display message when there are no users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupEmptyProjectData();
    env.fixture.detectChanges();
    tick();

    expect(env.noUsersLabel).not.toBeNull();
  }));

  it('should display users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();

    expect(env.noUsersLabel).toBeNull();
    expect(env.userRows.length).toEqual(3);

    expect(env.cell(0, 1).query(By.css('strong')).nativeElement.innerText).toEqual('User 01');
    expect(env.cell(0, 2).query(By.css('em')).nativeElement.innerText).toEqual('Administrator');
    expect(env.removeUserButtonOnRow(0)).toBeTruthy();
    expect(env.cancelInviteButtonOnRow(0)).toBeFalsy();

    expect(env.cell(1, 1).query(By.css('strong')).nativeElement.innerText).toEqual('User 02');
    expect(env.cell(1, 2).query(By.css('em')).nativeElement.innerText).toEqual('User');
    expect(env.removeUserButtonOnRow(1)).toBeTruthy();
    expect(env.cancelInviteButtonOnRow(1)).toBeFalsy();

    expect(env.cell(2, 1).nativeElement.innerText).toContain('Awaiting response from');
    expect(env.cell(2, 1).nativeElement.innerText).toContain('user03@example.com');
    expect(env.cell(2, 2).query(By.css('em')).nativeElement.innerText).toEqual('User');
    expect(env.removeUserButtonOnRow(2)).toBeFalsy();
    expect(env.cancelInviteButtonOnRow(2)).toBeTruthy();
  }));

  it('should delete user', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();

    env.clickElement(env.removeUserButtonOnRow(1));
    verify(env.mockedProjectUserService.onlineDelete(anything())).once();

    expect().nothing();
  }));

  it('should filter users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();

    expect(env.userRows.length).toEqual(3);
    env.setInputValue(env.filterInput, '02');

    expect(env.userRows.length).toEqual(1);
  }));

  it('should page', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.component.pageSize = 2;
    env.fixture.detectChanges();
    tick();

    env.clickElement(env.nextPageButton);

    expect(env.userRows.length).toEqual(1);
  }));
});

class TestProject extends Project {
  static readonly TYPE = 'project';

  constructor(init?: Partial<Project>) {
    super(TestProject.TYPE, init);
  }

  get taskNames(): string[] {
    return [];
  }
}

class TestProjectUser extends ProjectUser {
  static readonly TYPE = 'projectUser';

  constructor(init?: Partial<TestProjectUser>) {
    super(TestProjectUser.TYPE, init);
  }
}

class TestProjectUserRef extends ProjectUserRef {
  static readonly TYPE = TestProjectUser.TYPE;

  constructor(id?: string) {
    super(TestProjectUserRef.TYPE, id);
  }
}

class TestProjectRef extends ProjectRef {
  static readonly TYPE = TestProject.TYPE;

  constructor(id?: string) {
    super(TestProjectRef.TYPE, id);
  }
}

class TestEnvironment {
  fixture: ComponentFixture<CollaboratorsComponent>;
  component: CollaboratorsComponent;

  mockedActivatedRoute = mock(ActivatedRoute);
  mockedLocationService = mock(LocationService);
  mockedNoticeService = mock(NoticeService);
  mockedProjectService = mock(ProjectService);
  mockedProjectUserService = mock(ProjectUserService);

  private readonly included: Resource[] = [
    new TestProjectUser({
      id: 'projectuser01',
      role: 'admin',
      user: new UserRef('user01'),
      project: new TestProjectRef('project01')
    }),
    new TestProjectUser({
      id: 'projectuser02',
      role: 'user',
      user: new UserRef('user02'),
      project: new TestProjectRef('project01')
    }),
    new TestProjectUser({
      id: 'projectuser03',
      role: 'user',
      user: new UserRef('user03'),
      project: new TestProjectRef('project01')
    }),
    new TestProject({ id: 'project01', projectName: 'Project 01' }),
    new User({
      id: 'user01',
      name: 'User 01',
      email: 'user01@example.com',
      active: true
    }),
    new User({
      id: 'user02',
      name: 'User 02',
      email: 'user02@example.com',
      active: true
    }),
    new User({
      id: 'user03',
      email: 'user03@example.com',
      active: false
    })
  ];
  private readonly project$: BehaviorSubject<MapQueryResults<Project>> = new BehaviorSubject<MapQueryResults<Project>>(
    new MapQueryResults(
      new TestProject({
        id: 'project01',
        projectName: 'Project 01',
        users: [
          new TestProjectUserRef('projectuser01'),
          new TestProjectUserRef('projectuser02'),
          new TestProjectUserRef('projectuser03')
        ]
      }),
      1,
      this.included
    )
  );

  constructor() {
    when(this.mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(this.mockedProjectService.roles).thenReturn(
      new Map<string, ProjectRole>([
        ['admin', { role: 'admin', displayName: 'Administrator' }],
        ['user', { role: 'user', displayName: 'User' }],
        [NONE_ROLE.role, NONE_ROLE]
      ])
    );
    when(this.mockedProjectService.get('project01')).thenReturn(this.project$);
    when(this.mockedProjectService.onlineInvite('project01', anything())).thenResolve();
    when(this.mockedNoticeService.show(anything())).thenResolve();
    when(this.mockedLocationService.origin).thenReturn('https://scriptureforge.org');
    TestBed.configureTestingModule({
      declarations: [CollaboratorsComponent, ShareComponent],
      imports: [NoopAnimationsModule, MockAvatarModule, UICommonModule],
      providers: [
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: LocationService, useFactory: () => instance(this.mockedLocationService) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: ProjectService, useFactory: () => instance(this.mockedProjectService) },
        { provide: ProjectUserService, useFactory: () => instance(this.mockedProjectUserService) }
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
    when(this.mockedProjectService.get(anything(), anything())).thenReturn(this.project$);
  }

  setupNullProjectData(): void {
    this.setupThisProjectData(null);
  }

  setupEmptyProjectData(): void {
    this.setupThisProjectData([]);
  }

  private setupThisProjectData(projects: Project[] = []): void {
    when(this.mockedProjectService.get(anything(), anything())).thenReturn(
      of(new MapQueryResults<Project[]>(projects, 0, this.included))
    );
  }
}
