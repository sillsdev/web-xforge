import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, Router } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { of } from 'rxjs';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { UserDoc } from 'xforge-common/models/user-doc';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { SFProjectService } from '../core/sf-project.service';
import { ProjectComponent } from './project.component';

const mockedUserService = mock(UserService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedRouter = mock(Router);
const mockedSFProjectService = mock(SFProjectService);
const mockedTranslocoService = mock(TranslocoService);

describe('ProjectComponent', () => {
  configureTestingModule(() => ({
    declarations: [ProjectComponent],
    imports: [UICommonModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: UserService, useMock: mockedUserService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: Router, useMock: mockedRouter },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: TranslocoService, useMock: mockedTranslocoService }
    ]
  }));

  it('navigate to last text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'translate', selectedBooknum: 41, memberProjects: ['project01'] });
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(mockedRouter.navigate(deepEqual(['projects', 'project01', 'translate', 'MRK']), anything())).once();
    expect().nothing();
  }));

  it('navigate to first text when no last selected text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ memberProjects: ['project01'] });
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(mockedRouter.navigate(deepEqual(['projects', 'project01', 'translate', 'MAT']), anything())).once();
    expect().nothing();
  }));

  it('navigate to checking tool if a checker and no last selected text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ role: SFProjectRole.CommunityChecker, memberProjects: ['project01'] });
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(mockedRouter.navigate(deepEqual(['projects', 'project01', 'checking', 'ALL']), anything())).once();
    expect().nothing();
  }));

  it('navigates to last checking question if question stored but bookNum is null', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'checking', memberProjects: ['project01'] });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['projects', 'project01', 'checking', 'ALL']), anything())).once();
    expect().nothing();
  }));

  it('navigates to last checking book if the last book was saved', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'checking', selectedBooknum: 41, memberProjects: ['project01'] });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['projects', 'project01', 'checking', 'MRK']), anything())).once();
    expect().nothing();
  }));

  it('navigate to overview when no texts', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ hasTexts: false, memberProjects: ['project01'] });
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(mockedRouter.navigate(deepEqual(['projects', 'project01', 'translate']), anything())).once();
    expect().nothing();
  }));

  it('if checking is disabled, navigate to translate app, even if last location was in checking app', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({
      selectedTask: 'checking',
      selectedBooknum: 41,
      hasTexts: true,
      checkingEnabled: false,
      memberProjects: ['project01']
    });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['projects', 'project01', 'translate', 'MAT']), anything())).once();
    expect().nothing();
  }));

  it('do not navigate when project does not exist', fakeAsync(() => {
    const env = new TestEnvironment();
    env.subscribeRealtimeDocs('project01');
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
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
});

class TestEnvironment {
  readonly component: ProjectComponent;
  readonly fixture: ComponentFixture<ProjectComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(enableSharing = false) {
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedUserService.currentProjectId(anything())).thenReturn('project01');
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, 'user01')
    );
    when(mockedSFProjectService.onlineCheckLinkSharing(anything())).thenCall(() =>
      this.setProjectData({ memberProjects: ['project01'] })
    );
    when(mockedTranslocoService.translate<string>(anything())).thenReturn('The project link is invalid.');
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.queryParams = enableSharing ? { sharing: 'true', shareKey: 'shareKey01' } : {};
    when(mockedActivatedRoute.snapshot).thenReturn(snapshot);

    this.fixture = TestBed.createComponent(ProjectComponent);
    this.component = this.fixture.componentInstance;
  }

  setProjectData(
    args: {
      projectId?: string;
      hasTexts?: boolean;
      selectedTask?: string;
      selectedBooknum?: number;
      role?: SFProjectRole;
      checkingEnabled?: boolean;
      memberProjects?: string[];
    } = {}
  ): void {
    if (args.projectId != null) {
      when(mockedActivatedRoute.params).thenReturn(of({ projectId: args.projectId }));
    }
    const memberProjects: string[] = args.memberProjects ?? [];
    for (const projectId of memberProjects) {
      this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
        id: getSFProjectUserConfigDocId(projectId, 'user01'),
        data: {
          ownerRef: 'user01',
          projectRef: projectId,
          selectedTask: args.selectedTask,
          selectedBookNum: args.selectedTask == null ? undefined : args.selectedBooknum,
          isTargetTextRight: true,
          confidenceThreshold: 0.2,
          translationSuggestionsEnabled: true,
          numSuggestions: 1,
          selectedSegment: '',
          questionRefsRead: [],
          answerRefsRead: [],
          commentRefsRead: [],
          noteRefsRead: []
        }
      });

      this.realtimeService.addSnapshot<SFProjectProfile>(SFProjectProfileDoc.COLLECTION, {
        id: projectId,
        data: {
          name: projectId,
          shortName: 'P01',
          paratextId: `pt-${projectId}`,
          writingSystem: {
            tag: 'qaa'
          },
          translateConfig: {
            translationSuggestionsEnabled: false,
            shareEnabled: false
          },
          checkingConfig: {
            checkingEnabled: args.checkingEnabled == null ? true : args.checkingEnabled,
            usersSeeEachOthersResponses: true,
            shareEnabled: true,
            answerExportMethod: CheckingAnswerExport.MarkedForExport
          },
          sync: { queuedCount: 0 },
          editable: true,
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
            args.memberProjects == null
              ? {}
              : { user01: args.role == null ? SFProjectRole.ParatextTranslator : args.role },
          userPermissions: {}
        }
      });
      this.subscribeRealtimeDocs(projectId);
    }

    this.realtimeService.addSnapshot<User>(UserDoc.COLLECTION, {
      id: 'user01',
      data: {
        name: 'User 01',
        email: 'user1@example.com',
        role: SystemRole.User,
        isDisplayNameConfirmed: true,
        avatarUrl: '',
        authId: 'auth01',
        displayName: 'User 01',
        sites: { sf: { projects: memberProjects } }
      }
    });
  }

  subscribeRealtimeDocs(projectId: string) {
    when(mockedSFProjectService.getUserConfig(projectId, 'user01')).thenCall(() =>
      this.realtimeService.subscribe(
        SFProjectUserConfigDoc.COLLECTION,
        getSFProjectUserConfigDocId(projectId, 'user01')
      )
    );
    when(mockedSFProjectService.getProfile(projectId)).thenCall(() =>
      this.realtimeService.subscribe(SFProjectProfileDoc.COLLECTION, projectId)
    );
  }
}
