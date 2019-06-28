import { MdcDialog, MdcDialogRef } from '@angular-mdc/web';
import { OverlayContainer } from '@angular/cdk/overlay';
import { CUSTOM_ELEMENTS_SCHEMA, DebugElement, getDebugNode, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { combineLatest, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { GetAllParameters, MapQueryResults } from '../json-api.service';
import { Project, ProjectRef } from '../models/project';
import { ProjectUser, ProjectUserRef } from '../models/project-user';
import { Resource } from '../models/resource';
import { User, UserRef } from '../models/user';
import { UICommonModule } from '../ui-common.module';
import { UserService } from '../user.service';
import { SaDeleteDialogComponent } from './sa-delete-dialog.component';
import { SaUsersComponent } from './sa-users.component';

describe('SaUsersComponent', () => {
  it('should not display no-users label while loading', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupNullUserData();
    env.fixture.detectChanges();
    flush();

    expect(env.noUsersLabel).toBeNull();
  }));

  it('should display message when there are no users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupEmptyUserData();
    env.fixture.detectChanges();
    flush();

    expect(env.noUsersLabel).not.toBeNull();
  }));

  it('should display users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupUserData();
    env.fixture.detectChanges();
    flush();

    expect(env.noUsersLabel).toBeNull();
    expect(env.userRows.length).toEqual(3);

    expect(env.cell(0, 1).query(By.css('strong')).nativeElement.innerText).toEqual('User 01');
    expect(env.cell(0, 2).query(By.css('a')).nativeElement.text).toEqual('Project 01');
    expect(env.removeUserButtonOnRow(0)).toBeTruthy();
    expect(env.cancelInviteButtonOnRow(0)).toBeFalsy();

    expect(env.cell(1, 1).query(By.css('strong')).nativeElement.innerText).toEqual('User 02');
    expect(env.cell(1, 2).query(By.css('a'))).toBeNull();
    expect(env.removeUserButtonOnRow(1)).toBeTruthy();
    expect(env.cancelInviteButtonOnRow(1)).toBeFalsy();

    expect(env.cell(2, 1).nativeElement.innerText).toContain('Awaiting response from');
    expect(env.cell(2, 1).nativeElement.innerText).toContain('user03@example.com');
    expect(env.cell(2, 2).query(By.css('a')).nativeElement.text).toEqual('Project 01');
    expect(env.removeUserButtonOnRow(2)).toBeFalsy();
    expect(env.cancelInviteButtonOnRow(2)).toBeTruthy();
  }));

  it('should delete invited user', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupUserData();
    when(env.mockedDeleteUserDialogRef.afterClosed()).thenReturn(of('confirmed'));
    env.fixture.detectChanges();
    tick();
    verify(env.mockedUserService.onlineDelete(anything())).never();

    env.clickElement(env.cancelInviteButtonOnRow(2));
    verify(env.mockedMdcDialog.open(anything(), anything())).once();
    verify(env.mockedUserService.onlineDelete(anything())).once();

    expect().nothing();
  }));

  it('should delete user', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupUserData();
    when(env.mockedDeleteUserDialogRef.afterClosed()).thenReturn(of('confirmed'));
    env.fixture.detectChanges();
    tick();
    verify(env.mockedUserService.onlineDelete(anything())).never();

    env.clickElement(env.removeUserButtonOnRow(1));
    verify(env.mockedMdcDialog.open(anything(), anything())).once();
    verify(env.mockedUserService.onlineDelete(anything())).once();

    expect().nothing();
  }));

  it('should filter users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupUserData();
    env.fixture.detectChanges();
    flush();

    expect(env.userRows.length).toEqual(3);
    env.setInputValue(env.filterInput, 'test');

    expect(env.userRows.length).toEqual(1);
  }));

  it('should page', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupUserData();
    env.component.pageSize = 2;
    env.fixture.detectChanges();
    flush();

    env.clickElement(env.nextPageButton);

    expect(env.userRows.length).toEqual(1);
  }));
});

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

class TestProject extends Project {
  static readonly TYPE = 'project';

  constructor(init?: Partial<TestProject>) {
    super(TestProject.TYPE, init);
  }

  get taskNames(): string[] {
    return [];
  }
}

class TestProjectRef extends ProjectRef {
  static readonly TYPE = TestProject.TYPE;

  constructor(id?: string) {
    super(TestProjectRef.TYPE, id);
  }
}

@NgModule({
  imports: [NoopAnimationsModule, UICommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  exports: [SaDeleteDialogComponent],
  declarations: [SaDeleteDialogComponent],
  entryComponents: [SaDeleteDialogComponent]
})
class DialogTestModule {}

class TestEnvironment {
  component: SaUsersComponent;
  fixture: ComponentFixture<SaUsersComponent>;
  overlayContainer: OverlayContainer;

  mockedMdcDialog: MdcDialog = mock(MdcDialog);
  mockedDeleteUserDialogRef: MdcDialogRef<SaDeleteDialogComponent> = mock(MdcDialogRef);
  mockedNoticeService: NoticeService = mock(NoticeService);
  mockedUserService: UserService = mock(UserService);

  private readonly users: User[] = [
    new User({
      id: 'user01',
      name: 'User 01',
      email: 'user01@example.com',
      projects: [new TestProjectUserRef('projectuser01')],
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
      projects: [new TestProjectUserRef('projectuser03')],
      active: false
    })
  ];
  private readonly included: Resource[] = [
    new TestProjectUser({ id: 'projectuser01', user: new UserRef('user01'), project: new TestProjectRef('project01') }),
    new TestProjectUser({ id: 'projectuser03', user: new UserRef('user03'), project: new TestProjectRef('project01') }),
    new TestProject({ id: 'project01', projectName: 'Project 01' })
  ];

  constructor() {
    when(this.mockedMdcDialog.open(anything(), anything())).thenReturn(instance(this.mockedDeleteUserDialogRef));
    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, RouterTestingModule, UICommonModule, DialogTestModule],
      declarations: [SaUsersComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        { provide: MdcDialog, useFactory: () => instance(this.mockedMdcDialog) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) },
        { provide: UserService, useFactory: () => instance(this.mockedUserService) }
      ]
    });
    this.fixture = TestBed.createComponent(SaUsersComponent);
    this.component = this.fixture.componentInstance;
    this.overlayContainer = TestBed.get(OverlayContainer);
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

  get deleteDialogDeleteButton(): HTMLButtonElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('#confirm-button-yes');
  }

  get deleteDialogCancelButton(): HTMLButtonElement {
    const oce = this.overlayContainer.getContainerElement();
    return oce.querySelector('#confirm-button-no');
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

  setupNullUserData(): void {
    this.setupThisUserData(null);
  }

  setupEmptyUserData(): void {
    this.setupThisUserData([]);
  }

  setupUserData(): void {
    when(this.mockedUserService.onlineSearch(anything(), anything(), anything(), anything())).thenCall(
      (term$: Observable<string>, parameters$: Observable<GetAllParameters<User>>, reload$: Observable<void>) => {
        const results = [
          // page 1
          new MapQueryResults<User[]>(this.users, this.users.length, this.included),
          // page 2
          new MapQueryResults<User[]>([this.users[2]], 1, this.included)
        ];

        return combineLatest(term$, parameters$, reload$).pipe(map((_value, index) => results[index]));
      }
    );
  }

  setInputValue(input: HTMLInputElement | DebugElement, value: string): void {
    if (input instanceof DebugElement) {
      input = (input as DebugElement).nativeElement as HTMLInputElement;
    }

    input.value = value;
    input.dispatchEvent(new Event('keyup'));
    this.fixture.detectChanges();
    flush();
  }

  private setupThisUserData(users: User[] = []): void {
    when(this.mockedUserService.onlineSearch(anything(), anything(), anything(), anything())).thenReturn(
      of(new MapQueryResults<User[]>(users, 0, this.included))
    );
  }
}
