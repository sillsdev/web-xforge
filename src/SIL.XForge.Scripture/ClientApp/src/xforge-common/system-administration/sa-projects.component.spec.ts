import { DebugElement, getDebugNode } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { combineLatest, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { GetAllParameters, MapQueryResults } from '../json-api.service';
import { Project, ProjectRef } from '../models/project';
import { NONE_ROLE, ProjectRole } from '../models/project-role';
import { ProjectUser } from '../models/project-user';
import { ProjectUserService } from '../project-user.service';
import { ProjectService } from '../project.service';
import { UICommonModule } from '../ui-common.module';
import { UserService } from '../user.service';
import { SaProjectsComponent } from './sa-projects.component';

describe('SaProjectsComponent', () => {
  it('should display projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    flush();

    expect(env.rows.length).toEqual(3);
    expect(env.cell(0, 0).query(By.css('a')).nativeElement.text).toEqual('Project 01');
    expect(env.cell(0, 1).nativeElement.textContent).toEqual('Task1, Task2');
    expect(env.selectValue(env.roleSelect(0))).toEqual('Administrator');

    expect(env.cell(1, 0).query(By.css('a'))).toBeNull();
    expect(env.selectValue(env.roleSelect(1))).toEqual('None');
  }));

  it('should display message when there are no projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupEmptyProjectData();
    env.fixture.detectChanges();
    flush();

    expect(env.fixture.debugElement.query(By.css('.no-projects-label'))).not.toBeNull();
  }));

  it('should update role', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    when(env.mockedProjectUserService.onlineUpdateRole('projectuser01', 'user')).thenResolve();
    env.fixture.detectChanges();
    flush();

    const roleSelect = env.roleSelect(0);
    expect(env.selectValue(roleSelect)).toEqual('Administrator');
    env.changeSelectValue(roleSelect, 1);
    expect(env.selectValue(roleSelect)).toEqual('User');

    verify(env.mockedProjectUserService.onlineUpdateRole('projectuser01', 'user')).once();
    expect(env.component.rows[0].projectUser.role).toEqual('user');
  }));

  it('should add user to project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    when(env.mockedProjectUserService.onlineCreate('project02', 'user01', 'admin')).thenResolve(
      new TestProjectUser({
        id: 'projectusernew',
        role: 'admin',
        project: new TestProjectRef('project02'),
        userRef: 'user01'
      })
    );
    env.fixture.detectChanges();
    flush();

    const roleSelect = env.roleSelect(1);
    expect(env.selectValue(roleSelect)).toEqual('None');
    env.changeSelectValue(roleSelect, 0);
    expect(env.selectValue(roleSelect)).toEqual('Administrator');

    verify(env.mockedProjectUserService.onlineCreate('project02', 'user01', 'admin')).once();
  }));

  it('should remove user from project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    when(env.mockedProjectUserService.onlineDelete('projectuser01')).thenResolve();
    env.fixture.detectChanges();
    flush();

    const roleSelect = env.roleSelect(0);
    expect(env.selectValue(roleSelect)).toEqual('Administrator');
    env.changeSelectValue(roleSelect, 2);
    expect(env.selectValue(roleSelect)).toEqual('None');

    verify(env.mockedProjectUserService.onlineDelete('projectuser01')).once();
  }));

  it('should filter projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    flush();

    env.setInputValue(env.filterInput, 'test');

    expect(env.rows.length).toEqual(1);
  }));

  it('should page', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.component.pageSize = 2;
    env.fixture.detectChanges();
    flush();

    env.clickButton(env.nextButton);

    expect(env.rows.length).toEqual(1);
  }));
});

class TestProject extends Project {
  get taskNames(): string[] {
    return ['Task1', 'Task2'];
  }
}
class TestProjectUser extends ProjectUser {}
class TestProjectRef extends ProjectRef {}

class TestEnvironment {
  component: SaProjectsComponent;
  fixture: ComponentFixture<SaProjectsComponent>;

  mockedNoticeService: NoticeService = mock(NoticeService);
  mockedProjectUserService: ProjectUserService = mock(ProjectUserService);
  mockedProjectService: ProjectService = mock(ProjectService);
  mockedUserService: UserService = mock(UserService);

  constructor() {
    when(this.mockedUserService.currentUserId).thenReturn('user01');
    when(this.mockedProjectService.roles).thenReturn(
      new Map<string, ProjectRole>([
        ['admin', { role: 'admin', displayName: 'Administrator' }],
        ['user', { role: 'user', displayName: 'User' }],
        [NONE_ROLE.role, NONE_ROLE]
      ])
    );

    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, RouterTestingModule, UICommonModule],
      declarations: [SaProjectsComponent],
      providers: [
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: ProjectUserService, useFactory: () => instance(this.mockedProjectUserService) },
        { provide: ProjectService, useFactory: () => instance(this.mockedProjectService) },
        { provide: UserService, useFactory: () => instance(this.mockedUserService) }
      ]
    });
    this.fixture = TestBed.createComponent(SaProjectsComponent);
    this.component = this.fixture.componentInstance;
  }

  get table(): DebugElement {
    return this.fixture.debugElement.query(By.css('#projects-table'));
  }

  get rows(): DebugElement[] {
    // querying the debug table element doesn't seem to work, so we query the native element instead and convert back
    // to debug elements
    return Array.from(this.table.nativeElement.querySelectorAll('tr')).map(r => getDebugNode(r) as DebugElement);
  }

  get filterInput(): DebugElement {
    return this.fixture.debugElement.query(By.css('#project-filter'));
  }

  get paginator(): DebugElement {
    return this.fixture.debugElement.query(By.css('mat-paginator'));
  }

  get nextButton(): DebugElement {
    return this.paginator.query(By.css('.mat-paginator-navigation-next'));
  }

  cell(row: number, column: number): DebugElement {
    return this.rows[row].children[column];
  }

  selectValue(select: DebugElement): string {
    const trigger = select.query(By.css('.mat-select-trigger'));
    this.fixture.detectChanges();
    return trigger.nativeElement.textContent;
  }

  roleSelect(row: number): DebugElement {
    return this.cell(row, 2).query(By.css('mat-select'));
  }

  changeSelectValue(select: DebugElement, option: number): void {
    select.nativeElement.click();
    this.fixture.detectChanges();
    flush();
    const options = select.queryAll(By.css('mat-option'));
    options[option].nativeElement.click();
    this.fixture.detectChanges();
    flush();
  }

  setInputValue(input: DebugElement, value: string): void {
    const inputElem = input.nativeElement as HTMLInputElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('keyup'));
    this.fixture.detectChanges();
    flush();
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.fixture.detectChanges();
    flush();
  }

  setupProjectData(): void {
    when(this.mockedProjectService.onlineSearch(anything(), anything())).thenCall(
      (term$: Observable<string>, parameters$: Observable<GetAllParameters<TestProject>>) => {
        const results = [
          new MapQueryResults<TestProject[]>(
            [
              new TestProject({
                id: 'project01',
                projectName: 'Project 01'
              }),
              new TestProject({
                id: 'project02',
                projectName: 'Project 02'
              }),
              new TestProject({
                id: 'project03',
                projectName: 'Project 03'
              })
            ],
            3
          ),
          new MapQueryResults<TestProject[]>(
            [
              new TestProject({
                id: 'project03',
                projectName: 'Project 03'
              })
            ],
            1
          )
        ];

        return combineLatest(term$, parameters$).pipe(map((_value, index) => results[index]));
      }
    );

    when(this.mockedUserService.onlineGetProjects('user01')).thenReturn(
      of(
        new MapQueryResults<TestProjectUser[]>([
          new TestProjectUser({
            id: 'projectuser01',
            role: 'admin',
            project: new TestProjectRef('project01')
          }),
          new TestProjectUser({
            id: 'projectuser02',
            role: 'user',
            project: new TestProjectRef('project03')
          })
        ])
      )
    );
  }

  setupEmptyProjectData(): void {
    when(this.mockedProjectService.onlineSearch(anything(), anything())).thenReturn(
      of(new MapQueryResults<TestProject[]>([], 0))
    );
    when(this.mockedUserService.onlineGetProjects('user01')).thenReturn(of(new MapQueryResults<TestProjectUser[]>([])));
  }
}
