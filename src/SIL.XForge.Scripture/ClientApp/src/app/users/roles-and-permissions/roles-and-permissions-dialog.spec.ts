import { HttpClient, HttpHandler } from '@angular/common/http';
import { Component, DebugElement, Input, NgModule } from '@angular/core';
import { ComponentFixture, fakeAsync, flush, TestBed, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { forEach } from 'lodash-es';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { UserProfile } from 'realtime-server/lib/esm/common/models/user';
import { SFProject, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { isParatextRole, SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import {
  createTestProject,
  createTestProjectProfile
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import {
  getSFProjectUserConfigDocId,
  SF_PROJECT_USER_CONFIGS_COLLECTION
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { BehaviorSubject } from 'rxjs';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import {
  ChildViewContainerComponent,
  configureTestingModule,
  matDialogCloseDelay,
  TestTranslocoModule
} from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';
import { NoticeComponent } from '../../shared/notice/notice.component';
import { paratextUsersFromRoles } from '../../shared/test-utils';
import { RolesAndPermissionsDialogComponent, UserData } from './roles-and-permissions-dialog.component';

const mockedOnlineStatusService = mock(OnlineStatusService);
const mockedProjectService = mock(SFProjectService);

describe('RolesAndPermissionsComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: ExternalUrlService },
      { provide: HttpClient },
      { provide: HttpHandler },
      { provide: I18nService },
      { provide: OnlineStatusService, useMock: mockedOnlineStatusService },
      { provide: SFProjectService, useMock: mockedProjectService }
    ]
  }));

  let rolesByUser = {};
  let env: TestEnvironment;
  beforeEach(fakeAsync(() => {
    rolesByUser = {
      communityChecker: SFProjectRole.CommunityChecker,
      observer: SFProjectRole.Viewer,
      ptAdmin: SFProjectRole.ParatextAdministrator,
      ptTranslator: SFProjectRole.ParatextTranslator
    };
    env = new TestEnvironment();
  }));
  afterEach(fakeAsync(() => {
    env.closeDialog();
  }));

  it('disables the form when offline', fakeAsync(() => {
    env.setupProjectData();
    env.openDialog();

    expect(env.component?.form.disabled).toBe(false);

    env.isOnline$.next(false);
    expect(env.component?.form.disabled).toBe(true);

    env.isOnline$.next(true);
    expect(env.component?.form.disabled).toBe(false);
  }));

  it('initializes values from the project', fakeAsync(() => {
    env.setupProjectData(rolesByUser, {
      ptTranslator: [
        SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Create),
        SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Edit),
        SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.TextAudio, Operation.Create),
        SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.TextAudio, Operation.Edit),
        SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.TextAudio, Operation.Delete)
      ]
    });
    env.openDialog();

    expect(env.component?.roles.value).toBe(SFProjectRole.ParatextTranslator);
    //translator does not have these permissions by default
    expect(env.component?.canAddEditQuestions.value).toBe(true);
    expect(env.component?.canManageAudio.value).toBe(true);
  }));

  it('reflects whether or not the user is from Paratext', fakeAsync(() => {
    env.setupProjectData(rolesByUser);
    env.openDialog();

    expect(env.component?.isParatextUser()).toBe(true);

    env.closeDialog();
    env.openDialog('communityChecker');

    expect(env.component?.isParatextUser()).toBe(false);
  }));

  it('reflects Paratext roles for Paratext users', fakeAsync(() => {
    env.setupProjectData(rolesByUser);
    env.openDialog();

    expect(env.component?.roleOptions.length).toBeGreaterThan(0);
    forEach(env.component?.roleOptions, r => expect(isParatextRole(r)).toBe(true));
    expect(env.component?.roles.disabled).toBe(true);
  }));

  it('reflects Scripture Forge roles for Scripture Forge users', fakeAsync(() => {
    env.setupProjectData(rolesByUser);
    env.openDialog('communityChecker');

    expect(env.component?.roleOptions.length).toBeGreaterThan(0);
    forEach(env.component?.roleOptions, r => expect(!isParatextRole(r)));
    expect(env.component?.roles.disabled).toBe(false);
  }));

  it('doesnt save if the form is disabled', fakeAsync(() => {
    env.setupProjectData();
    env.openDialog();
    env.isOnline$.next(false);
    expect(env.component?.form.disabled).toBe(true);

    env.component?.save();

    verify(mockedProjectService.onlineSetUserProjectPermissions(anything(), anything(), anything())).never();
  }));

  it('saves correct permissions without changing unrelated ones', fakeAsync(() => {
    let permissions = [
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.View),
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Delete)
    ];
    env.setupProjectData(rolesByUser, {
      ptTranslator: [SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Delete)],
      observer: permissions
    });
    env.openDialog('ptTranslator');

    //prep for role change
    when(mockedProjectService.onlineUpdateUserRole(anything(), anything(), anything())).thenCall((p, u, r) => {
      rolesByUser[u] = r;
      const projectDoc: SFProjectDoc = env.realtimeService.get(SFProjectDoc.COLLECTION, p);
      projectDoc.submitJson0Op(op => {
        op.set(p => p.userRoles, rolesByUser);
        op.set(p => p.userPermissions, {
          ptTranslator: permissions
        });
      });
    });

    env.component?.canAddEditQuestions.setValue(true);
    env.component?.canManageAudio.setValue(true);
    env.component?.roles.setValue(SFProjectRole.Viewer);
    env.component?.save();
    tick();

    verify(mockedProjectService.onlineUpdateUserRole('project01', 'ptTranslator', SFProjectRole.Viewer)).once();

    permissions = permissions.concat([
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Create),
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Edit),
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.TextAudio, Operation.Create),
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.TextAudio, Operation.Edit),
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.TextAudio, Operation.Delete)
    ]);

    verify(
      mockedProjectService.onlineSetUserProjectPermissions('project01', 'ptTranslator', deepEqual(permissions))
    ).once();
    expect().nothing();
  }));
});

@Component({ selector: 'app-avatar' })
class FakeAvatarComponent {
  @Input() user?: UserProfile;
  @Input() size?: number;
  @Input() round?: boolean;
}

@NgModule({
  imports: [UICommonModule, TestTranslocoModule, NoticeComponent],
  declarations: [RolesAndPermissionsDialogComponent, FakeAvatarComponent]
})
class DialogTestModule {}

class TestEnvironment {
  component?: RolesAndPermissionsDialogComponent;
  readonly isOnline$: BehaviorSubject<boolean> = new BehaviorSubject(true);
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  private readonly fixture: ComponentFixture<ChildViewContainerComponent>;

  constructor() {
    when(mockedOnlineStatusService.onlineStatus$).thenReturn(this.isOnline$.asObservable());
    when(mockedProjectService.get(anything())).thenCall(projectId =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, projectId)
    );

    this.fixture = TestBed.createComponent(ChildViewContainerComponent);
  }

  get overlayContainerElement(): HTMLElement {
    return this.fixture.nativeElement.parentElement.querySelector('.cdk-overlay-container');
  }

  get roleOptions(): DebugElement {
    return this.fixture.debugElement.parent!.query(By.css('mat-radio-group'));
  }

  get closeButton(): HTMLElement {
    return this.overlayContainerElement.querySelector('button[mat-dialog-close]') as HTMLElement;
  }

  closeDialog(): void {
    this.click(this.closeButton);
    tick(matDialogCloseDelay);
  }

  openDialog(userId: string = 'ptTranslator'): void {
    this.realtimeService
      .subscribe<SFProjectUserConfigDoc>(
        SF_PROJECT_USER_CONFIGS_COLLECTION,
        getSFProjectUserConfigDocId('project01', userId)
      )
      .then(() => {
        const config: MatDialogConfig<UserData> = {
          data: {
            projectId: 'project01',
            userId,
            userProfile: {
              displayName: 'User',
              avatarUrl: ''
            }
          }
        };
        const dialogRef = TestBed.inject(MatDialog).open(RolesAndPermissionsDialogComponent, config);
        this.component = dialogRef.componentInstance;
      });
    this.wait();
  }

  setupProjectData(
    userRoles: { [userRef: string]: string } = {},
    userPermissions: { [userRef: string]: string[] } = {}
  ): void {
    this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
      id: 'project01',
      data: createTestProjectProfile({
        userRoles
      })
    });
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'project01',
      data: createTestProject({
        userPermissions,
        userRoles,
        paratextUsers: paratextUsersFromRoles(userRoles)
      })
    });
  }

  click(element: HTMLElement): void {
    element.click();
    flush();
    this.fixture.detectChanges();
    tick();
  }

  wait(): void {
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
    // open dialog animation
    tick(166);
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }
}
