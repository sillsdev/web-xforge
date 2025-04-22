import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, Router } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { createTestUser } from 'realtime-server/lib/esm/common/models/user-test-data';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { createTestProjectUserConfig } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config-test-data';
import { of } from 'rxjs';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { DialogService } from 'xforge-common/dialog.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UserService } from 'xforge-common/user.service';
import { ResumeCheckingService } from '../checking/checking/resume-checking.service';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { ProjectComponent } from './project.component';

const mockedUserService = mock(UserService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedRouter = mock(Router);
const mockedTranslocoService = mock(TranslocoService);
const mockResumeCheckingService = mock(ResumeCheckingService);
const mockedDialogService = mock(DialogService);

describe('ProjectComponent', () => {
  configureTestingModule(() => ({
    imports: [TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: UserService, useMock: mockedUserService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: Router, useMock: mockedRouter },
      { provide: TranslocoService, useMock: mockedTranslocoService },
      { provide: ResumeCheckingService, useMock: mockResumeCheckingService },
      { provide: DialogService, useMock: mockedDialogService },
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting()
    ]
  }));

  it('navigate to last text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'translate', selectedBooknum: 41, memberProjectIdSuffixes: [1] });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['projects', 'project1', 'translate', 'MRK']), anything())).once();
    expect().nothing();
  }));

  it('navigate to first text when no last selected text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ memberProjectIdSuffixes: [1] });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['projects', 'project1', 'translate', 'MAT']), anything())).once();
    expect().nothing();
  }));

  it('navigate to first text when last selected text missing', fakeAsync(() => {
    const env = new TestEnvironment();
    const missingBookNum = 44;
    env.setProjectData({ selectedTask: 'translate', selectedBooknum: missingBookNum, memberProjectIdSuffixes: [1] });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['projects', 'project1', 'translate', 'ACT']), anything())).never();
    verify(mockedRouter.navigate(deepEqual(['projects', 'project1', 'translate', 'MAT']), anything())).once();
    expect().nothing();
  }));

  it('navigate to checking tool if a checker and no last selected task', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ role: SFProjectRole.CommunityChecker, memberProjectIdSuffixes: [1] });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['projects', 'project1', 'checking', 'JHN', '1']), anything())).once();
    expect().nothing();
  }));

  it('navigates to checking tool if selected task is checking', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'checking', memberProjectIdSuffixes: [1] });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['projects', 'project1', 'checking', 'JHN', '1']), anything())).once();
    expect().nothing();
  }));

  it('navigate to overview when no texts', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ hasTexts: false, memberProjectIdSuffixes: [1] });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['projects', 'project1', 'translate']), anything())).once();
    expect().nothing();
  }));

  it('if checking is disabled, navigate to translate app, even if last location was in checking app', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({
      selectedTask: 'checking',
      selectedBooknum: 41,
      hasTexts: true,
      checkingEnabled: false,
      memberProjectIdSuffixes: [1]
    });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['projects', 'project1', 'translate', 'MRK']), anything())).once();
    expect().nothing();
  }));

  it('doesnt allow commenters to navigate to community checking', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({
      selectedTask: 'checking',
      memberProjectIdSuffixes: [1],
      selectedBooknum: 41,
      role: SFProjectRole.Commenter
    });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['projects', 'project1', 'translate', 'MRK']), anything())).once();
    expect().nothing();
  }));

  it('do not navigate when project does not exist', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(anything(), anything())).never();
    expect().nothing();
  }));

  it('navigate old sharing link to new joining link', fakeAsync(() => {
    const env = new TestEnvironment(true);
    env.fixture.detectChanges();
    tick();
    verify(mockedRouter.navigateByUrl('/join/shareKey01', anything())).once();
    verify(mockedRouter.navigate(anything(), anything())).never();
    expect().nothing();
  }));

  it('should only navigate to project if user is on the project', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({
      selectedTask: 'checking',
      selectedBooknum: 41,
      hasTexts: true,
      checkingEnabled: false,
      memberProjectIdSuffixes: []
    });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(anything(), anything())).never();

    env.addUserToProject(1);
    verify(mockedRouter.navigate(deepEqual(['projects', 'project1', 'translate', 'MAT']), anything())).once();
    expect().nothing();
  }));
});

class TestEnvironment {
  readonly component: ProjectComponent;
  readonly fixture: ComponentFixture<ProjectComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(enableSharing = false) {
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project1' }));
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedUserService.currentProjectId(anything())).thenReturn('project1');
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, 'user01')
    );
    when(mockedTranslocoService.translate<string>(anything())).thenReturn('The project link is invalid.');
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.queryParams = enableSharing ? { sharing: 'true', shareKey: 'shareKey01' } : {};
    when(mockedActivatedRoute.snapshot).thenReturn(snapshot);

    // Just mock the response.  Testing of the actual service functionality can be in the service spec.
    when(mockResumeCheckingService.checkingLink$).thenReturn(of(['projects', 'project1', 'checking', 'JHN', '1']));

    when(mockedDialogService.message(anything())).thenResolve();

    this.fixture = TestBed.createComponent(ProjectComponent);
    this.component = this.fixture.componentInstance;
  }

  setProjectData(
    args: {
      projectIdSuffix?: number;
      hasTexts?: boolean;
      selectedTask?: string;
      selectedBooknum?: number;
      role?: SFProjectRole;
      checkingEnabled?: boolean;
      memberProjectIdSuffixes?: number[];
    } = {}
  ): void {
    if (args.projectIdSuffix != null) {
      when(mockedActivatedRoute.params).thenReturn(of({ projectId: `project${args.projectIdSuffix}` }));
    }
    const memberProjectIdSuffixes: number[] = args.memberProjectIdSuffixes ?? [];
    for (const projectIdSuffix of memberProjectIdSuffixes) {
      const projectId = `project${projectIdSuffix}`;
      this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
        id: getSFProjectUserConfigDocId(projectId, 'user01'),
        data: createTestProjectUserConfig({
          projectRef: projectId,
          ownerRef: 'user01',
          selectedTask: args.selectedTask,
          selectedBookNum: args.selectedTask == null ? undefined : args.selectedBooknum,
          isTargetTextRight: true
        })
      });

      this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
        id: projectId,
        data: createTestProjectProfile(
          {
            checkingConfig: {
              checkingEnabled: args.checkingEnabled == null ? true : args.checkingEnabled
            },
            texts:
              args.hasTexts == null || args.hasTexts
                ? [
                    {
                      bookNum: 40,
                      chapters: [],
                      hasSource: false,
                      permissions: {}
                    },
                    {
                      bookNum: 41,
                      chapters: [],
                      hasSource: false,
                      permissions: {}
                    }
                  ]
                : [],
            userRoles:
              args.memberProjectIdSuffixes == null
                ? {}
                : { user01: args.role == null ? SFProjectRole.ParatextTranslator : args.role }
          },
          projectIdSuffix
        )
      });
    }

    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: 'user01',
      data: createTestUser({ sites: { sf: { projects: memberProjectIdSuffixes.map(suffix => `project${suffix}`) } } })
    });
  }

  addUserToProject(projectIdSuffix: number): void {
    this.setProjectData({ memberProjectIdSuffixes: [projectIdSuffix] });
    const userDoc: UserDoc = this.realtimeService.get(UserDoc.COLLECTION, 'user01');
    userDoc.submitJson0Op(op => op.set(u => u.sites, { sf: { projects: [`project${projectIdSuffix}`] } }), false);
    tick();
  }
}
