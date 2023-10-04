import { DebugElement, NgModule } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { By } from '@angular/platform-browser';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { forEach } from 'lodash-es';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProject, SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole, isParatextRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import {
  createTestProject,
  createTestProjectProfile
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import {
  SF_PROJECT_USER_CONFIGS_COLLECTION,
  getSFProjectUserConfigDocId
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { BehaviorSubject } from 'rxjs';
import { SFProjectDoc } from 'src/app/core/models/sf-project-doc';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { paratextUsersFromRoles } from 'src/app/shared/test-utils';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import {
  ChildViewContainerComponent,
  TestTranslocoModule,
  configureTestingModule,
  matDialogCloseDelay
} from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { RolesAndPermissionsComponent, UserData } from './roles-and-permissions.component';

const mockedOnlineStatusService = mock(OnlineStatusService);
const mockedProjectService = mock(SFProjectService);

const roles = {
  communityChecker: SFProjectRole.CommunityChecker,
  ptAdmin: SFProjectRole.ParatextAdministrator,
  ptTranslator: SFProjectRole.ParatextTranslator
};

describe('RolesAndPermissionsComponent', () => {
  configureTestingModule(() => ({
    imports: [DialogTestModule, NoopAnimationsModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: ExternalUrlService },
      { provide: I18nService },
      { provide: OnlineStatusService, useMock: mockedOnlineStatusService },
      { provide: SFProjectService, useMock: mockedProjectService }
    ]
  }));

  let env: TestEnvironment;
  beforeEach(fakeAsync(() => {
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
    env.setupProjectData(roles, {
      communityChecker: [],
      ptAdmin: [],
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
    env.setupProjectData(roles);
    env.openDialog();

    expect(env.component?.isParatextUser()).toBe(true);

    env.closeDialog();
    env.openDialog('communityChecker');

    expect(env.component?.isParatextUser()).toBe(false);
  }));

  it('reflects Paratext roles for Paratext users', fakeAsync(async () => {
    env.setupProjectData(roles);
    env.openDialog();

    expect(env.component?.roleOptions.length).toBeGreaterThan(0);
    forEach(env.component?.roleOptions, r => expect(isParatextRole(r)));
    expect(env.component?.roles.disabled).toBe(true);
  }));

  it('reflects Scripture Forge roles for Scripture Forge users', fakeAsync(() => {
    env.setupProjectData(roles);
    env.openDialog('communityChecker');

    expect(env.component?.roleOptions.length).toBeGreaterThan(0);
    forEach(env.component?.roleOptions, r => expect(!isParatextRole(r)));
  }));

  it('doesnt save if the form is disabled', fakeAsync(() => {
    env.setupProjectData();
    env.openDialog();
    env.isOnline$.next(false);
    expect(env.component?.form.disabled).toBe(true);

    env.component?.save();

    verify(mockedProjectService.onlineSetUserProjectPermissions(anything(), anything(), anything())).never();
  }));

  it('saves the selected permissions without changing unrelated ones', fakeAsync(() => {
    let permissions = [
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.View),
      SF_PROJECT_RIGHTS.joinRight(SFProjectDomain.Questions, Operation.Delete)
    ];
    env.setupProjectData(roles, {
      communityChecker: [],
      ptAdmin: [],
      ptTranslator: permissions
    });
    env.openDialog();

    env.component?.canAddEditQuestions.setValue(true);
    env.component?.canManageAudio.setValue(true);
    env.component?.save();

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
  }));
});

@NgModule({
  imports: [UICommonModule, TestTranslocoModule],
  declarations: [RolesAndPermissionsComponent]
})
class DialogTestModule {}

class TestEnvironment {
  component?: RolesAndPermissionsComponent;
  readonly isOnline$: BehaviorSubject<boolean> = new BehaviorSubject(true);

  private readonly fixture: ComponentFixture<ChildViewContainerComponent>;
  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

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
        const dialogRef = TestBed.inject(MatDialog).open(RolesAndPermissionsComponent, config);
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
