import { MdcCheckbox } from '@angular-mdc/web';
import { DebugElement, getDebugNode } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import merge from 'lodash-es/merge';
import { Project } from 'realtime-server/lib/esm/common/models/project';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { combineLatest, from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { anything, mock, verify, when } from 'ts-mockito';
import { FileType } from 'xforge-common/models/file-offline-data';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import XRegExp from 'xregexp';
import { ProjectDoc } from '../models/project-doc';
import { NONE_ROLE, ProjectRoleInfo } from '../models/project-role-info';
import { NoticeService } from '../notice.service';
import { ProjectService } from '../project.service';
import { Filters, QueryParameters } from '../query-parameters';
import { TestRealtimeService } from '../test-realtime.service';
import { configureTestingModule, emptyHammerLoader, TestTranslocoModule } from '../test-utils';
import { TypeRegistry } from '../type-registry';
import { UICommonModule } from '../ui-common.module';
import { UserService } from '../user.service';
import { SaProjectsComponent } from './sa-projects.component';

const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(ProjectService);
const mockedUserService = mock(UserService);

describe('SaProjectsComponent', () => {
  configureTestingModule(() => ({
    imports: [
      NoopAnimationsModule,
      RouterTestingModule,
      UICommonModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(new TypeRegistry([TestProjectDoc], [FileType.Audio], []))
    ],
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

  it('should show if sync disabled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    tick();

    const projectRowWithSyncNotDisabled: number = 0;
    const projectRowWithSyncDisabled: number = 1;
    expect(env.isSyncDisabled(projectRowWithSyncNotDisabled)).toBe(false);
    expect(env.isSyncDisabled(projectRowWithSyncDisabled)).toBe(true);
    verify(mockedProjectService.onlineSetSyncDisabled(anything(), anything())).never();
  }));

  it('should process change for sync disabled', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    tick();

    const projectInRow: number = 0;
    expect(env.isSyncDisabled(projectInRow)).toBe(false);
    // SUT
    env.clickButton(env.syncDisabledControl(projectInRow));
    expect(env.isSyncDisabled(projectInRow)).toBe(true);

    verify(mockedProjectService.onlineSetSyncDisabled('project01', true)).once();
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

  private readonly roleColumn = 2;
  private readonly syncDisabledColumn = 3;
  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedProjectService.roles).thenReturn(
      new Map<string, ProjectRoleInfo>([
        ['admin', { role: 'admin', displayName: 'Administrator', canBeShared: false }],
        ['user', { role: 'user', displayName: 'User', canBeShared: false }],
        [NONE_ROLE.role, NONE_ROLE]
      ])
    );
    when(mockedProjectService.onlineAddCurrentUser(anything(), anything())).thenResolve();
    when(mockedProjectService.onlineRemoveUser(anything(), 'user01')).thenResolve();
    when(mockedProjectService.onlineUpdateCurrentUserRole(anything(), anything())).thenResolve();
    when(mockedProjectService.onlineQuery(anything(), anything())).thenCall(
      (term$: Observable<string>, parameters$: Observable<QueryParameters>) =>
        combineLatest([term$, parameters$]).pipe(
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
    return this.cell(row, this.roleColumn).query(By.css('mat-select'));
  }

  isSyncDisabled(row: number): boolean {
    return (this.cell(row, this.syncDisabledColumn).query(By.css('mdc-checkbox')).componentInstance as MdcCheckbox)
      .checked;
  }

  syncDisabledControl(row: number): DebugElement {
    return this.cell(row, this.syncDisabledColumn).query(By.css('mdc-checkbox')).query(By.css('input'));
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
          userRoles: { user01: 'admin' },
          userPermissions: {}
        }
      },
      {
        id: 'project02',
        data: {
          name: 'Project 02',
          userRoles: {},
          userPermissions: {},
          syncDisabled: true
        }
      },
      {
        id: 'project03',
        data: {
          name: 'Project 03',
          userRoles: { user01: 'user' },
          userPermissions: {}
        }
      }
    ]);
  }
}
