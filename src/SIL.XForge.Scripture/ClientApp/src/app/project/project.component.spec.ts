import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, Router } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { CheckingShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/esm/scriptureforge/models/sf-project-user-config';
import { TranslateShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { BehaviorSubject, of } from 'rxjs';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../core/models/sf-project-user-config-doc';
import { SF_TYPE_REGISTRY } from '../core/models/sf-type-registry';
import { SFProjectService } from '../core/sf-project.service';
import { ProjectComponent } from './project.component';

const mockedUserService = mock(UserService);
const mockedActivatedRoute = mock(ActivatedRoute);
const mockedRouter = mock(Router);
const mockedSFProjectService = mock(SFProjectService);
const mockedNoticeService = mock(NoticeService);
const mockedTranslocoService = mock(TranslocoService);
const mockedPwaService = mock(PwaService);

describe('ProjectComponent', () => {
  configureTestingModule(() => ({
    declarations: [ProjectComponent],
    imports: [UICommonModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: UserService, useMock: mockedUserService },
      { provide: ActivatedRoute, useMock: mockedActivatedRoute },
      { provide: Router, useMock: mockedRouter },
      { provide: SFProjectService, useMock: mockedSFProjectService },
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: TranslocoService, useMock: mockedTranslocoService },
      { provide: PwaService, useMock: mockedPwaService }
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

  it('check sharing link passes shareKey', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData();
    env.setLinkSharing(true, 'secret123');
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.onlineCheckLinkSharing('project01', 'secret123')).once();
    verify(mockedRouter.navigate(deepEqual(['projects', 'project01', 'translate', 'MAT']), anything())).once();
    expect().nothing();
  }));

  it('check sharing link skipped offline', fakeAsync(() => {
    when(mockedNoticeService.showMessageDialog(anything())).thenResolve();
    const env = new TestEnvironment();
    env.onlineStatus = false;
    env.setProjectData({
      selectedTask: 'translate',
      selectedBooknum: 40,
      memberProjects: ['project01'],
      projectId: 'project02'
    });
    env.setLinkSharing(true, 'secret123');
    env.fixture.detectChanges();
    tick();
    verify(mockedSFProjectService.onlineCheckLinkSharing(anything(), anything())).never();
    verify(mockedNoticeService.showMessageDialog(anything())).once();
    verify(mockedRouter.navigate(deepEqual(['projects', 'project01', 'translate', 'MAT']), anything())).once();
    expect().nothing();
  }));

  it('check sharing link skipped offline and redirect user if not on any projects', fakeAsync(() => {
    when(mockedNoticeService.showMessageDialog(anything())).thenResolve();
    const env = new TestEnvironment();
    env.onlineStatus = false;
    env.setProjectData({ selectedTask: 'translate', projectId: 'project02' });
    env.setLinkSharing(true, 'secret123');
    env.fixture.detectChanges();
    tick();
    verify(mockedSFProjectService.onlineCheckLinkSharing(anything(), anything())).never();
    verify(mockedNoticeService.showMessageDialog(anything())).once();
    verify(mockedRouter.navigateByUrl('/projects', anything())).once();
    expect().nothing();
  }));

  it('check sharing link directs user to project offline when user is already a member', fakeAsync(() => {
    const env = new TestEnvironment();
    env.onlineStatus = false;
    env.setProjectData({
      selectedTask: 'checking',
      projectId: 'project02',
      memberProjects: ['project01', 'project02']
    });
    env.setLinkSharing(true, 'secret123');
    env.fixture.detectChanges();
    tick();
    verify(mockedSFProjectService.onlineCheckLinkSharing(anything(), anything())).never();
    verify(mockedNoticeService.showMessageDialog(anything())).never();
    verify(mockedRouter.navigate(deepEqual(['projects', 'project02', 'checking', 'ALL']), anything())).once();
    expect().nothing();
  }));

  it('check sharing link forbidden', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedSFProjectService.onlineCheckLinkSharing('project01', undefined)).thenReject(
      new CommandError(CommandErrorCode.Forbidden, 'Forbidden')
    );
    env.setProjectData({ selectedTask: 'translate', selectedBooknum: 41 });
    env.setLinkSharing(true);
    env.fixture.detectChanges();
    tick();

    verify(mockedNoticeService.showMessageDialog(anything())).once();
    verify(mockedRouter.navigateByUrl('/projects', anything())).once();
    expect().nothing();
  }));

  it('check sharing link project not found', fakeAsync(() => {
    const env = new TestEnvironment();
    when(mockedSFProjectService.onlineCheckLinkSharing('project01', undefined)).thenReject(
      new CommandError(CommandErrorCode.NotFound, 'NotFound')
    );
    env.setProjectData({ selectedTask: 'translate', selectedBooknum: 41 });
    env.setLinkSharing(true);
    env.fixture.detectChanges();
    tick();

    verify(mockedNoticeService.showMessageDialog(anything())).once();
    verify(mockedRouter.navigateByUrl('/projects', anything())).once();
    expect().nothing();
  }));

  it('ensure local storage is cleared when sharing a project fails', fakeAsync(() => {
    const env = new TestEnvironment();
    const projectId = 'project01';
    when(mockedSFProjectService.onlineCheckLinkSharing(projectId, undefined)).thenReject(
      new CommandError(CommandErrorCode.Forbidden, 'Forbidden')
    );
    env.setProjectData({ selectedTask: 'translate', selectedBooknum: 41, memberProjects: [projectId] });
    env.setLinkSharing(true);
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.localDelete(projectId)).once();
    expect().nothing();
  }));
});

class TestEnvironment {
  readonly component: ProjectComponent;
  readonly fixture: ComponentFixture<ProjectComponent>;
  readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private readonly isOnline: BehaviorSubject<boolean>;

  constructor() {
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.queryParams = { sharing: 'true' };
    when(mockedActivatedRoute.snapshot).thenReturn(snapshot);
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedUserService.currentProjectId).thenReturn('project01');
    when(mockedUserService.getCurrentUser()).thenCall(() =>
      this.realtimeService.subscribe(UserDoc.COLLECTION, 'user01')
    );
    when(mockedSFProjectService.onlineCheckLinkSharing('project01', anything())).thenCall(() =>
      this.setProjectData({ memberProjects: ['project01'] })
    );
    when(mockedNoticeService.showMessageDialog(anything())).thenResolve();

    when(mockedTranslocoService.translate<string>(anything())).thenReturn('The project link is invalid.');
    this.isOnline = new BehaviorSubject<boolean>(true);
    when(mockedPwaService.onlineStatus).thenReturn(this.isOnline.asObservable());
    this.setLinkSharing(false);

    this.fixture = TestBed.createComponent(ProjectComponent);
    this.component = this.fixture.componentInstance;
  }

  set onlineStatus(hasConnection: boolean) {
    this.isOnline.next(hasConnection);
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

      this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
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
            shareEnabled: false,
            shareLevel: TranslateShareLevel.Specific
          },
          checkingConfig: {
            checkingEnabled: args.checkingEnabled == null ? true : args.checkingEnabled,
            usersSeeEachOthersResponses: true,
            shareEnabled: true,
            shareLevel: CheckingShareLevel.Specific
          },
          sync: { queuedCount: 0 },
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

  setLinkSharing(enabled: boolean, shareKey?: string): void {
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.queryParams = { sharing: enabled ? 'true' : undefined, shareKey: shareKey ? shareKey : undefined };
    when(mockedActivatedRoute.snapshot).thenReturn(snapshot);
  }

  subscribeRealtimeDocs(projectId: string) {
    when(mockedSFProjectService.getUserConfig(projectId, 'user01')).thenCall(() =>
      this.realtimeService.subscribe(
        SFProjectUserConfigDoc.COLLECTION,
        getSFProjectUserConfigDocId(projectId, 'user01')
      )
    );
    when(mockedSFProjectService.get(projectId)).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, projectId)
    );
  }
}
