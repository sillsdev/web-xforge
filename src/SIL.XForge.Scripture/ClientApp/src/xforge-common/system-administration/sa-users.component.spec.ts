import { MdcDialog, MdcDialogRef } from '@angular-mdc/web';
import { OverlayContainer } from '@angular/cdk/overlay';
import { CUSTOM_ELEMENTS_SCHEMA, DebugElement, getDebugNode, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import * as OTJson0 from 'ot-json0';
import { combineLatest, Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { anything, instance, mock, verify, when } from 'ts-mockito';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { QueryParameters, QueryResults } from 'xforge-common/realtime.service';
import { environment } from '../../environments/environment';
import { Project } from '../models/project';
import { ProjectDoc } from '../models/project-doc';
import { User } from '../models/user';
import { ProjectService } from '../project.service';
import { MemoryRealtimeDocAdapter } from '../realtime-doc-adapter';
import { UICommonModule } from '../ui-common.module';
import { UserService } from '../user.service';
import { SaDeleteDialogComponent } from './sa-delete-dialog.component';
import { SaUsersComponent } from './sa-users.component';

describe('SaUsersComponent', () => {
  it('should not display no-users label while loading', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupEmptyUserData();
    env.fixture.detectChanges();

    expect(env.noUsersLabel).toBeNull();
    tick();
  }));

  it('should display message when there are no users', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupEmptyUserData();
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
    expect(env.userRows.length).toEqual(3);

    expect(env.cell(0, 1).query(By.css('strong')).nativeElement.innerText).toEqual('User 01');
    expect(env.cell(0, 2).query(By.css('a')).nativeElement.text).toEqual('Project 01');
    expect(env.removeUserButtonOnRow(0)).toBeTruthy();
    expect(env.cancelInviteButtonOnRow(0)).toBeFalsy();

    expect(env.cell(1, 1).query(By.css('strong')).nativeElement.innerText).toEqual('User 02');
    expect(env.cell(1, 2).query(By.css('a'))).toBeNull();
    expect(env.removeUserButtonOnRow(1)).toBeTruthy();
    expect(env.cancelInviteButtonOnRow(1)).toBeFalsy();

    expect(env.cell(2, 1).query(By.css('strong')).nativeElement.innerText).toEqual('User 03');
    expect(env.cell(2, 2).query(By.css('a')).nativeElement.text).toEqual('Project 01');
    expect(env.removeUserButtonOnRow(2)).toBeTruthy();
    expect(env.cancelInviteButtonOnRow(2)).toBeFalsy();
  }));

  it('should delete user', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupUserData();
    when(env.mockedDeleteUserDialogRef.afterClosed()).thenReturn(of('confirmed'));
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();
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
    tick();
    env.fixture.detectChanges();

    expect(env.userRows.length).toEqual(3);
    env.setInputValue(env.filterInput, 'test');

    expect(env.userRows.length).toEqual(1);
  }));

  it('should page', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setupUserData();
    env.component.pageSize = 2;
    env.fixture.detectChanges();
    tick();
    env.fixture.detectChanges();

    env.clickElement(env.nextPageButton);

    expect(env.userRows.length).toEqual(1);
  }));
});

class TestProjectDoc extends ProjectDoc {
  taskNames: string[];
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
  readonly component: SaUsersComponent;
  readonly fixture: ComponentFixture<SaUsersComponent>;
  readonly overlayContainer: OverlayContainer;

  readonly mockedMdcDialog = mock(MdcDialog);
  readonly mockedDeleteUserDialogRef: MdcDialogRef<SaDeleteDialogComponent> = mock(MdcDialogRef);
  readonly mockedNoticeService = mock(NoticeService);
  readonly mockedUserService = mock(UserService);
  readonly mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);
  readonly mockedProjectService = mock(ProjectService);

  private readonly userDocs: UserDoc[] = [
    this.createUserDoc('user01', { name: 'User 01', sites: { [environment.siteId]: { projects: ['project01'] } } }),
    this.createUserDoc('user02', { name: 'User 02', sites: { [environment.siteId]: { projects: [] } } }),
    this.createUserDoc('user03', { name: 'User 03', sites: { [environment.siteId]: { projects: ['project01'] } } })
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
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: ProjectService, useFactory: () => instance(this.mockedProjectService) }
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
    this.fixture.detectChanges();
  }

  setupEmptyUserData(): void {
    when(this.mockedUserService.onlineSearch(anything(), anything(), anything())).thenReturn(
      of({ docs: [], totalPagedCount: 0 })
    );
    when(this.mockedProjectService.onlineGetMany(anything())).thenResolve([]);
  }

  setupUserData(): void {
    when(this.mockedUserService.onlineSearch(anything(), anything(), anything())).thenCall(
      (term$: Observable<string>, parameters$: Observable<QueryParameters>, reload$: Observable<void>) => {
        const results: QueryResults<UserDoc>[] = [
          // page 1
          { docs: this.userDocs, totalPagedCount: this.userDocs.length },
          // page 2
          { docs: [this.userDocs[2]], totalPagedCount: 1 }
        ];

        return combineLatest(term$, parameters$, reload$).pipe(map((_value, index) => results[index]));
      }
    );

    when(this.mockedProjectService.onlineGetMany(anything())).thenResolve([
      this.createProjectDoc('project01', { projectName: 'Project 01', userRoles: { user01: 'admin', user03: 'user' } })
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

  private createUserDoc(id: string, user: User): UserDoc {
    return new UserDoc(new MemoryRealtimeDocAdapter(id, OTJson0.type, user), instance(this.mockedRealtimeOfflineStore));
  }

  private createProjectDoc(id: string, project: Project): ProjectDoc {
    return new TestProjectDoc(
      new MemoryRealtimeDocAdapter(id, OTJson0.type, project),
      instance(this.mockedRealtimeOfflineStore)
    );
  }
}
