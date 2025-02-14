import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DebugElement, getDebugNode, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterModule } from '@angular/router';
import { escapeRegExp } from 'lodash-es';
import merge from 'lodash-es/merge';
import { Project } from 'realtime-server/lib/esm/common/models/project';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { combineLatest, from, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { AvatarComponent } from 'xforge-common/avatar/avatar.component';
import { FileType } from 'xforge-common/models/file-offline-data';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { environment } from '../../environments/environment';
import { ProjectDoc } from '../models/project-doc';
import { UserDoc } from '../models/user-doc';
import { ProjectService } from '../project.service';
import { QueryFilter, QueryParameters } from '../query-parameters';
import { TestRealtimeService } from '../test-realtime.service';
import { configureTestingModule, emptyHammerLoader, TestTranslocoModule } from '../test-utils';
import { TypeRegistry } from '../type-registry';
import { UICommonModule } from '../ui-common.module';
import { UserService } from '../user.service';
import { SaDeleteDialogComponent } from './sa-delete-dialog.component';
import { SaUsersComponent } from './sa-users.component';

const mockedMatDialog = mock(MatDialog);
const mockedUserService = mock(UserService);
const mockedProjectService: ProjectService = mock(ProjectService);

describe('SaUsersComponent', () => {
  configureTestingModule(() => ({
    imports: [
      RouterModule.forRoot([]),
      UICommonModule,
      DialogTestModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(new TypeRegistry([UserDoc, TestProjectDoc], [FileType.Audio], [])),
      AvatarComponent
    ],
    declarations: [SaUsersComponent],
    providers: [
      { provide: MatDialog, useMock: mockedMatDialog },
      { provide: UserService, useMock: mockedUserService },
      { provide: ProjectService, useMock: mockedProjectService },
      emptyHammerLoader,
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting()
    ]
  }));

  it('should not display no-users label while loading', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();

    expect(env.noUsersLabel).toBeNull();
    tick();
  }));

  it('should display message when there are no users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    expect(env.noUsersLabel).not.toBeNull();
  }));

  it('should display users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupUserData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    expect(env.noUsersLabel).toBeNull();

    expect(env.component.totalRecordCount).toEqual(env.numUsersOnProject);
    expect(env.userRows.length).toEqual(env.numUsersOnProject);

    expect(env.cellDisplayName(0, 1).innerText).toEqual('Test user 1');
    expect(env.cellName(0, 1).innerText).toEqual('Name of test user 1');
    expect(env.cellProjectLink(0, 2).text).toEqual('Project 01');
    expect(env.removeUserButtonOnRow(0)).toBeNull();

    expect(env.cellDisplayName(1, 1).innerText).toEqual('Test user 2');
    expect(env.cellName(1, 1).innerText).toEqual('Name of test user 2');
    expect(env.cellProjectLink(1, 2)).toBeNull();
    expect(env.removeUserButtonOnRow(1)).not.toBeNull();

    expect(env.cellDisplayName(2, 1).innerText).toEqual('Test user 3');
    expect(env.cellName(2, 1).innerText).toEqual('Name of test user 3');
    expect(env.cellProjectLink(2, 2).text).toEqual('Project 01');
    expect(env.removeUserButtonOnRow(2)).not.toBeNull();
  }));

  it('should delete user', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupUserData();
    when(env.mockedDeleteUserDialogRef.afterClosed()).thenReturn(of(true));
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    verify(mockedUserService.onlineDelete(anything())).never();

    env.clickElement(env.removeUserButtonOnRow(1));
    verify(mockedMatDialog.open(anything(), anything())).once();
    verify(mockedUserService.onlineDelete(anything())).once();

    expect().nothing();
  }));

  it('should filter users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupUserData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    // All users shown
    expect(env.userRows.length).toEqual(3);
    env.setInputValue(env.filterInput, '2');
    // Subset shown
    expect(env.userRows.length).toEqual(1);
  }));

  it('should page', fakeAsync(() => {
    const env = new TestEnvironment();
    const pageSize = 2;
    env.component.updatePage(0, pageSize);
    env.setupUserData();
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    expect(env.component.totalRecordCount).toEqual(env.numUsersOnProject);

    // First page
    expect(env.userRows.length).toEqual(2);
    env.clickElement(env.nextPageButton);
    // Second page
    expect(env.userRows.length).toEqual(1);
  }));
});

class TestProjectDoc extends ProjectDoc {
  static readonly COLLECTION = 'projects';
  static readonly INDEX_PATHS = [];

  readonly taskNames: string[] = [];
}

@NgModule({
  imports: [NoopAnimationsModule]
})
class DialogTestModule {}

class TestEnvironment {
  readonly component: SaUsersComponent;
  readonly fixture: ComponentFixture<SaUsersComponent>;

  readonly numUsersOnProject = 3;
  readonly mockedDeleteUserDialogRef = mock<MatDialogRef<SaDeleteDialogComponent>>(MatDialogRef);

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    when(mockedMatDialog.open(anything(), anything())).thenReturn(instance(this.mockedDeleteUserDialogRef));
    when(mockedUserService.onlineQuery(anything(), anything(), anything())).thenCall(
      (term$: Observable<string>, parameters$: Observable<QueryParameters>, reload$: Observable<void>) =>
        combineLatest([term$, parameters$, reload$]).pipe(
          switchMap(([term, queryParameters]) => {
            const filters: QueryFilter = {
              [obj<User>().pathStr(u => u.name)]: { $regex: `.*${escapeRegExp(term)}.*`, $options: 'i' }
            };
            return from(this.realtimeService.onlineQuery<UserDoc>(UserDoc.COLLECTION, merge(filters, queryParameters)));
          })
        )
    );
    when(mockedProjectService.onlineGetMany(anything())).thenCall(async () => {
      const query = await this.realtimeService.onlineQuery<TestProjectDoc>(TestProjectDoc.COLLECTION, {});
      return query.docs;
    });
    when(mockedUserService.currentUserId).thenReturn('user01');
    this.fixture = TestBed.createComponent(SaUsersComponent);
    this.component = this.fixture.componentInstance;
  }

  get noUsersLabel(): DebugElement {
    return this.fixture.debugElement.query(By.css('#no-users-label'));
  }

  get table(): DebugElement {
    return this.fixture.debugElement.query(By.css('#users-table'));
  }

  get userRows(): DebugElement[] {
    if (this.table == null) {
      return [];
    }
    // querying the debug table element doesn't seem to work, so we query the native element instead and convert back
    // to debug elements
    return Array.from(this.table.nativeElement.querySelectorAll('tr')).map(r => getDebugNode(r) as DebugElement);
  }

  get filterInput(): DebugElement {
    return this.fixture.debugElement.query(By.css('#user-filter'));
  }

  get paginator(): DebugElement {
    return this.fixture.debugElement.query(By.css('mat-paginator'));
  }

  get nextPageButton(): DebugElement {
    return this.paginator.query(By.css('.mat-mdc-paginator-navigation-next'));
  }

  cell(row: number, column: number): DebugElement {
    return this.userRows[row].children[column];
  }

  cellDisplayName(row: number, column: number): HTMLElement {
    const element = this.cell(row, column).query(By.css('strong'));
    return element != null ? element.nativeElement : element;
  }

  cellName(row: number, column: number): HTMLElement {
    const element = this.cell(row, column).query(By.css('.name-label'));
    return element != null ? element.nativeElement : element;
  }

  cellProjectLink(row: number, column: number): HTMLAnchorElement {
    const element = this.cell(row, column).query(By.css('a'));
    return element != null ? element.nativeElement : element;
  }

  removeUserButtonOnRow(row: number): DebugElement {
    return this.userRows[row].query(By.css('button.remove-user'));
  }

  clickElement(element: HTMLElement | DebugElement): void {
    if (element instanceof DebugElement) {
      element = (element as DebugElement).nativeElement as HTMLElement;
    }

    element.click();
    this.fixture.detectChanges();
    tick(1000);
    this.fixture.detectChanges();
  }

  setupUserData(): void {
    this.realtimeService.addSnapshots<User>(UserDoc.COLLECTION, [
      {
        id: 'user01',
        data: createTestUser(
          {
            sites: { [environment.siteId]: { projects: ['project01'] } }
          },
          1
        )
      },
      {
        id: 'user02',
        data: createTestUser(
          {
            sites: { [environment.siteId]: { projects: [] } }
          },
          2
        )
      },
      {
        id: 'user03',
        data: createTestUser(
          {
            sites: { [environment.siteId]: { projects: ['project01'] } }
          },
          3
        )
      }
    ]);
    this.realtimeService.addSnapshots<Project>(TestProjectDoc.COLLECTION, [
      {
        id: 'project01',
        data: createTestProject({
          name: 'Project 01',
          userRoles: { user01: 'admin', user03: 'user' },
          userPermissions: {}
        })
      }
    ]);
  }

  setInputValue(input: HTMLInputElement | DebugElement, value: string): void {
    if (input instanceof DebugElement) {
      input = (input as DebugElement).nativeElement as HTMLInputElement;
    }

    input.value = value;
    input.dispatchEvent(new Event('input'));
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}
