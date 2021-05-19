import { MdcDialog, MdcDialogRef } from '@angular-mdc/web/dialog';
import { OverlayContainer } from '@angular/cdk/overlay';
import { DebugElement, getDebugNode, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import merge from 'lodash-es/merge';
import { Project } from 'realtime-server/lib/esm/common/models/project';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { obj } from 'realtime-server/lib/esm/common/utils/obj-path';
import { combineLatest, from, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { FileType } from 'xforge-common/models/file-offline-data';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import XRegExp from 'xregexp';
import { environment } from '../../environments/environment';
import { AvatarTestingModule } from '../avatar/avatar-testing.module';
import { ProjectDoc } from '../models/project-doc';
import { UserDoc } from '../models/user-doc';
import { NoticeService } from '../notice.service';
import { ProjectService } from '../project.service';
import { Filters, QueryParameters } from '../query-parameters';
import { TestRealtimeService } from '../test-realtime.service';
import { configureTestingModule, emptyHammerLoader, TestTranslocoModule } from '../test-utils';
import { TypeRegistry } from '../type-registry';
import { UICommonModule } from '../ui-common.module';
import { UserService } from '../user.service';
import { SaDeleteDialogComponent } from './sa-delete-dialog.component';
import { SaUsersComponent } from './sa-users.component';

const mockedMdcDialog = mock(MdcDialog);
const mockedNoticeService = mock(NoticeService);
const mockedUserService = mock(UserService);
const mockedProjectService = mock(ProjectService);

describe('SaUsersComponent', () => {
  configureTestingModule(() => ({
    imports: [
      NoopAnimationsModule,
      RouterTestingModule,
      AvatarTestingModule,
      UICommonModule,
      DialogTestModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(new TypeRegistry([UserDoc, TestProjectDoc], [FileType.Audio], []))
    ],
    declarations: [SaUsersComponent],
    providers: [
      { provide: MdcDialog, useMock: mockedMdcDialog },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: UserService, useMock: mockedUserService },
      { provide: ProjectService, useMock: mockedProjectService },
      emptyHammerLoader
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

    const numUsersOnProject = 3;
    expect(env.component.totalRecordCount).toEqual(numUsersOnProject);
    expect(env.userRows.length).toEqual(numUsersOnProject);

    expect(env.cellDisplayName(0, 1).innerText).toEqual('User01');
    expect(env.cellName(0, 1).innerText).toEqual('User 01');
    expect(env.cellProjectLink(0, 2).text).toEqual('Project 01');
    expect(env.removeUserButtonOnRow(0)).not.toBeNull();

    expect(env.cellDisplayName(1, 1).innerText).toEqual('User 02');
    expect(env.cellName(1, 1)).toBeNull();
    expect(env.cellProjectLink(1, 2)).toBeNull();
    expect(env.removeUserButtonOnRow(1)).not.toBeNull();

    expect(env.cellDisplayName(2, 1).innerText).toEqual('User 03');
    expect(env.cellName(2, 1)).toBeNull();
    expect(env.cellProjectLink(2, 2).text).toEqual('Project 01');
    expect(env.removeUserButtonOnRow(2)).not.toBeNull();
  }));

  it('should delete user', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupUserData();
    when(env.mockedDeleteUserDialogRef.afterClosed()).thenReturn(of('confirmed'));
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
    verify(mockedUserService.onlineDelete(anything())).never();

    env.clickElement(env.removeUserButtonOnRow(1));
    verify(mockedMdcDialog.open(anything(), anything())).once();
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
    env.setInputValue(env.filterInput, '02');
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
    const numUsersOnProject = 3;
    expect(env.component.totalRecordCount).toEqual(numUsersOnProject);

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
  imports: [NoopAnimationsModule, AvatarTestingModule, UICommonModule],
  exports: [SaDeleteDialogComponent],
  declarations: [SaDeleteDialogComponent]
})
class DialogTestModule {}

class TestEnvironment {
  readonly component: SaUsersComponent;
  readonly fixture: ComponentFixture<SaUsersComponent>;

  readonly mockedDeleteUserDialogRef: MdcDialogRef<SaDeleteDialogComponent> = mock(MdcDialogRef);

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor() {
    when(mockedMdcDialog.open(anything(), anything())).thenReturn(instance(this.mockedDeleteUserDialogRef));
    when(mockedUserService.onlineQuery(anything(), anything(), anything())).thenCall(
      (term$: Observable<string>, parameters$: Observable<QueryParameters>, reload$: Observable<void>) =>
        combineLatest([term$, parameters$, reload$]).pipe(
          switchMap(([term, queryParameters]) => {
            const filters: Filters = {
              [obj<User>().pathStr(u => u.name)]: { $regex: `.*${XRegExp.escape(term)}.*`, $options: 'i' }
            };
            return from(this.realtimeService.onlineQuery<UserDoc>(UserDoc.COLLECTION, merge(filters, queryParameters)));
          })
        )
    );
    when(mockedProjectService.onlineGetMany(anything())).thenCall(async () => {
      const query = await this.realtimeService.onlineQuery<TestProjectDoc>(TestProjectDoc.COLLECTION, {});
      return query.docs;
    });

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
    return this.paginator.query(By.css('.mat-paginator-navigation-next'));
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
        data: {
          name: 'User 01',
          displayName: 'User01',
          isDisplayNameConfirmed: true,
          email: 'user01@example.com',
          avatarUrl: '',
          authId: 'auth01',
          role: SystemRole.User,
          sites: { [environment.siteId]: { projects: ['project01'] } }
        }
      },
      {
        id: 'user02',
        data: {
          name: 'User 02',
          displayName: 'User 02',
          isDisplayNameConfirmed: true,
          email: 'user02@example.com',
          avatarUrl: '',
          authId: 'auth02',
          role: SystemRole.User,
          sites: { [environment.siteId]: { projects: [] } }
        }
      },
      {
        id: 'user03',
        data: {
          name: 'user03@example.com',
          displayName: 'User 03',
          isDisplayNameConfirmed: true,
          email: 'user03@example.com',
          avatarUrl: '',
          authId: 'auth03',
          role: SystemRole.User,
          sites: { [environment.siteId]: { projects: ['project01'] } }
        }
      }
    ]);
    this.realtimeService.addSnapshots<Project>(TestProjectDoc.COLLECTION, [
      {
        id: 'project01',
        data: {
          name: 'Project 01',
          userRoles: { user01: 'admin', user03: 'user' },
          userPermissions: {}
        }
      }
    ]);
  }

  setInputValue(input: HTMLInputElement | DebugElement, value: string): void {
    if (input instanceof DebugElement) {
      input = (input as DebugElement).nativeElement as HTMLInputElement;
    }

    input.value = value;
    input.dispatchEvent(new Event('keyup'));
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}
