import { DebugElement, getDebugNode } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import * as OTJson0 from 'ot-json0';
import { Project } from 'realtime-server/lib/common/models/project';
import { combineLatest, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { ProjectDoc } from '../models/project-doc';
import { NONE_ROLE, ProjectRoleInfo } from '../models/project-role-info';
import { NoticeService } from '../notice.service';
import { ProjectService } from '../project.service';
import { MemoryRealtimeDocAdapter } from '../realtime-doc-adapter';
import { RealtimeOfflineStore } from '../realtime-offline-store';
import { QueryParameters, QueryResults } from '../realtime.service';
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
    env.fixture.detectChanges();
    flush();

    const roleSelect = env.roleSelect(0);
    expect(env.selectValue(roleSelect)).toEqual('Administrator');
    env.changeSelectValue(roleSelect, 1);
    expect(env.selectValue(roleSelect)).toEqual('User');

    verify(env.mockedProjectService.onlineUpdateCurrentUserRole('project01', 'user')).once();
    expect(env.component.rows[0].projectRole.role).toEqual('user');
  }));

  it('should add user to project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    flush();

    const roleSelect = env.roleSelect(1);
    expect(env.selectValue(roleSelect)).toEqual('None');
    env.changeSelectValue(roleSelect, 0);
    expect(env.selectValue(roleSelect)).toEqual('Administrator');

    verify(env.mockedProjectService.onlineAddCurrentUser('project02', 'admin')).once();
  }));

  it('should remove user from project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupProjectData();
    env.fixture.detectChanges();
    flush();

    const roleSelect = env.roleSelect(0);
    expect(env.selectValue(roleSelect)).toEqual('Administrator');
    env.changeSelectValue(roleSelect, 2);
    expect(env.selectValue(roleSelect)).toEqual('None');

    verify(env.mockedProjectService.onlineRemoveUser('project01', 'user01')).once();
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

class TestProjectDoc extends ProjectDoc {
  readonly taskNames: string[] = ['Task1', 'Task2'];
}

class TestEnvironment {
  readonly component: SaProjectsComponent;
  readonly fixture: ComponentFixture<SaProjectsComponent>;

  readonly mockedNoticeService = mock(NoticeService);
  readonly mockedProjectService = mock(ProjectService);
  readonly mockedUserService = mock(UserService);
  readonly mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);

  constructor() {
    when(this.mockedUserService.currentUserId).thenReturn('user01');
    when(this.mockedProjectService.roles).thenReturn(
      new Map<string, ProjectRoleInfo>([
        ['admin', { role: 'admin', displayName: 'Administrator' }],
        ['user', { role: 'user', displayName: 'User' }],
        [NONE_ROLE.role, NONE_ROLE]
      ])
    );
    when(this.mockedProjectService.onlineAddCurrentUser(anything(), anything())).thenResolve();
    when(this.mockedProjectService.onlineRemoveUser(anything(), 'user01')).thenResolve();
    when(this.mockedProjectService.onlineUpdateCurrentUserRole(anything(), anything())).thenResolve();

    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, RouterTestingModule, UICommonModule],
      declarations: [SaProjectsComponent],
      providers: [
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
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
      (term$: Observable<string>, parameters$: Observable<QueryParameters>) => {
        const project03Doc = this.createProjectDoc('project03', {
          projectName: 'Project 03',
          userRoles: { user01: 'user' }
        });
        const results: QueryResults<ProjectDoc>[] = [
          {
            docs: [
              this.createProjectDoc('project01', { projectName: 'Project 01', userRoles: { user01: 'admin' } }),
              this.createProjectDoc('project02', { projectName: 'Project 02', userRoles: {} }),
              project03Doc
            ],
            totalPagedCount: 3
          },
          {
            docs: [project03Doc],
            totalPagedCount: 1
          }
        ];

        return combineLatest(term$, parameters$).pipe(map((_value, index) => results[index]));
      }
    );
  }

  setupEmptyProjectData(): void {
    when(this.mockedProjectService.onlineSearch(anything(), anything())).thenReturn(
      of({ docs: [], totalPagedCount: 0 } as QueryResults<ProjectDoc>)
    );
  }

  private createProjectDoc(id: string, project: Project): ProjectDoc {
    return new TestProjectDoc(
      new MemoryRealtimeDocAdapter(id, OTJson0.type, project),
      instance(this.mockedRealtimeOfflineStore)
    );
  }
}
