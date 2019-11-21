import { DebugElement, getDebugNode } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import merge from 'lodash/merge';
import { Project } from 'realtime-server/lib/common/models/project';
import { obj } from 'realtime-server/lib/common/utils/obj-path';
import { combineLatest, from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { anything, mock, verify, when } from 'ts-mockito';
import XRegExp from 'xregexp';
import { ProjectDoc } from '../models/project-doc';
import { NONE_ROLE, ProjectRoleInfo } from '../models/project-role-info';
import { NoticeService } from '../notice.service';
import { ProjectService } from '../project.service';
import { Filters, QueryParameters } from '../query-parameters';
import { RealtimeDocTypes } from '../realtime-doc-types';
import { TestRealtimeService } from '../test-realtime.service';
import { configureTestingModule, emptyHammerLoader } from '../test-utils';
import { UICommonModule } from '../ui-common.module';
import { UserService } from '../user.service';
import { SaProjectsComponent } from './sa-projects.component';

const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(ProjectService);
const mockedUserService = mock(UserService);

describe('SaProjectsComponent', () => {
  configureTestingModule(() => ({
    imports: [NoopAnimationsModule, RouterTestingModule, UICommonModule],
    declarations: [SaProjectsComponent],
    providers: [
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ProjectService, useMock: mockedProjectService },
      { provide: UserService, useMock: mockedUserService },
      emptyHammerLoader
    ]
  }));

  it('should display projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    tick();

    expect(env.rows.length).toEqual(3);
    expect(env.cell(0, 0).query(By.css('a')).nativeElement.text).toEqual('Project 01');
    expect(env.cell(0, 1).nativeElement.textContent).toEqual('Task1, Task2');
    expect(env.selectValue(env.roleSelect(0))).toEqual('Administrator');

    expect(env.cell(1, 0).query(By.css('a'))).toBeNull();
    expect(env.selectValue(env.roleSelect(1))).toEqual('None');
  }));

  it('should display message when there are no projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    expect(env.fixture.debugElement.query(By.css('.no-projects-label'))).not.toBeNull();
  }));

  it('should update role', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    tick();

    const roleSelect = env.roleSelect(0);
    expect(env.selectValue(roleSelect)).toEqual('Administrator');
    env.changeSelectValue(roleSelect, 1);
    expect(env.selectValue(roleSelect)).toEqual('User');

    verify(mockedProjectService.onlineUpdateCurrentUserRole('project01', 'user')).once();
    expect(env.component.rows[0].projectRole.role).toEqual('user');
  }));

  it('should add user to project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    tick();

    const roleSelect = env.roleSelect(1);
    expect(env.selectValue(roleSelect)).toEqual('None');
    env.changeSelectValue(roleSelect, 0);
    expect(env.selectValue(roleSelect)).toEqual('Administrator');

    verify(mockedProjectService.onlineAddCurrentUser('project02', 'admin')).once();
  }));

  it('should remove user from project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    tick();

    const roleSelect = env.roleSelect(0);
    expect(env.selectValue(roleSelect)).toEqual('Administrator');
    env.changeSelectValue(roleSelect, 2);
    expect(env.selectValue(roleSelect)).toEqual('None');

    verify(mockedProjectService.onlineRemoveUser('project01', 'user01')).once();
  }));

  it('should filter projects', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.setInputValue(env.filterInput, '02');

    expect(env.rows.length).toEqual(1);
  }));

  it('should page', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.component.pageSize = 2;
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickButton(env.nextButton);

    expect(env.rows.length).toEqual(1);
  }));
});

class TestProjectDoc extends ProjectDoc {
  static readonly COLLECTION = 'projects';
  static readonly INDEX_PATHS = [];

  readonly taskNames: string[] = ['Task1', 'Task2'];
}

class TestEnvironment {
  readonly component: SaProjectsComponent;
  readonly fixture: ComponentFixture<SaProjectsComponent>;

  private readonly realtimeService = new TestRealtimeService(new RealtimeDocTypes([TestProjectDoc]));

  constructor() {
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedProjectService.roles).thenReturn(
      new Map<string, ProjectRoleInfo>([
        ['admin', { role: 'admin', displayName: 'Administrator' }],
        ['user', { role: 'user', displayName: 'User' }],
        [NONE_ROLE.role, NONE_ROLE]
      ])
    );
    when(mockedProjectService.onlineAddCurrentUser(anything(), anything())).thenResolve();
    when(mockedProjectService.onlineRemoveUser(anything(), 'user01')).thenResolve();
    when(mockedProjectService.onlineUpdateCurrentUserRole(anything(), anything())).thenResolve();
    when(mockedProjectService.onlineQuery(anything(), anything())).thenCall(
      (term$: Observable<string>, parameters$: Observable<QueryParameters>) =>
        combineLatest(term$, parameters$).pipe(
          switchMap(([term, queryParameters]) => {
            const filters: Filters = {
              [obj<Project>().pathStr(p => p.name)]: { $regex: `.*${XRegExp.escape(term)}.*`, $options: 'i' }
            };
            return from(
              this.realtimeService.onlineQuery<TestProjectDoc>(
                TestProjectDoc.COLLECTION,
                merge(filters, queryParameters)
              )
            );
          })
        )
    );

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
    tick();
    const options = select.queryAll(By.css('mat-option'));
    options[option].nativeElement.click();
    this.fixture.detectChanges();
    tick(1000);
  }

  setInputValue(input: DebugElement, value: string): void {
    const inputElem = input.nativeElement as HTMLInputElement;
    inputElem.value = value;
    inputElem.dispatchEvent(new Event('keyup'));
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  setupProjectData(): void {
    this.realtimeService.addSnapshots<Project>(TestProjectDoc.COLLECTION, [
      {
        id: 'project01',
        data: {
          name: 'Project 01',
          userRoles: { user01: 'admin' }
        }
      },
      {
        id: 'project02',
        data: {
          name: 'Project 02',
          userRoles: {}
        }
      },
      {
        id: 'project03',
        data: {
          name: 'Project 03',
          userRoles: { user01: 'user' }
        }
      }
    ]);
  }
}
