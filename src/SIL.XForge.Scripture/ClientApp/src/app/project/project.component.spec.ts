import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, Router } from '@angular/router';
import { TranslocoService } from '@ngneat/transloco';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { of } from 'rxjs';
import { anything, deepEqual, mock, verify, when } from 'ts-mockito';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { NoticeService } from 'xforge-common/notice.service';
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
      { provide: TranslocoService, useMock: mockedTranslocoService }
    ]
  }));

  it('navigate to last text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'translate', selectedBooknum: 41 });
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(mockedRouter.navigate(deepEqual(['./', 'translate', 'MRK']), anything())).once();
    expect().nothing();
  }));

  it('navigate to first text when no last selected text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData();
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(mockedRouter.navigate(deepEqual(['./', 'translate', 'MAT']), anything())).once();
    expect().nothing();
  }));

  it('navigate to checking tool if a checker and no last selected text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ role: SFProjectRole.CommunityChecker });
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(mockedRouter.navigate(deepEqual(['./', 'checking', 'ALL']), anything())).once();
    expect().nothing();
  }));

  it('navigates to last checking question if question stored but bookNum is null', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'checking' });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['./', 'checking', 'ALL']), anything())).once();
    expect().nothing();
  }));

  it('navigates to last checking book if the last book was saved', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'checking', selectedBooknum: 41 });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['./', 'checking', 'MRK']), anything())).once();
    expect().nothing();
  }));

  it('navigate to overview when no texts', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ hasTexts: false });
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(mockedRouter.navigate(deepEqual(['./', 'translate']), anything())).once();
    expect().nothing();
  }));

  it('if checking is disabled, navigate to translate app, even if last location was in checking app', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'checking', selectedBooknum: 41, hasTexts: true, checkingEnabled: false });
    env.fixture.detectChanges();
    tick();

    verify(mockedRouter.navigate(deepEqual(['./', 'translate', 'MAT']), anything())).once();
    expect().nothing();
  }));

  it('do not navigate when project does not exist', fakeAsync(() => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(mockedRouter.navigate(anything(), anything())).never();
    expect().nothing();
  }));

  it('check sharing link', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'translate', selectedBooknum: 41 });
    env.setLinkSharing(true);
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.onlineCheckLinkSharing('project01', undefined)).once();
    verify(mockedRouter.navigate(deepEqual(['./', 'translate', 'MRK']), anything())).once();
    expect().nothing();
  }));

  it('check sharing link passes shareKey', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'translate', selectedBooknum: 41 });
    env.setLinkSharing(true, 'secret123');
    env.fixture.detectChanges();
    tick();

    verify(mockedSFProjectService.onlineCheckLinkSharing('project01', 'secret123')).once();
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
    env.setProjectData({ selectedTask: 'translate', selectedBooknum: 41 });
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

  readonly realtimeService: TestRealtimeService = TestBed.get<TestRealtimeService>(TestRealtimeService);

  constructor() {
    when(mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.queryParams = { sharing: 'true' };
    when(mockedActivatedRoute.snapshot).thenReturn(snapshot);
    when(mockedUserService.currentUserId).thenReturn('user01');
    when(mockedSFProjectService.onlineCheckLinkSharing('project01')).thenResolve();
    when(mockedSFProjectService.onlineCheckLinkSharing('project01', anything())).thenResolve();
    when(mockedNoticeService.showMessageDialog(anything())).thenResolve();
    when(mockedSFProjectService.getUserConfig('project01', 'user01')).thenCall(() =>
      this.realtimeService.subscribe(
        SFProjectUserConfigDoc.COLLECTION,
        getSFProjectUserConfigDocId('project01', 'user01')
      )
    );
    when(mockedSFProjectService.get('project01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'project01')
    );
    when(mockedTranslocoService.translate<string>(anything())).thenReturn('The project link is invalid.');
    this.setLinkSharing(false);

    this.fixture = TestBed.createComponent(ProjectComponent);
    this.component = this.fixture.componentInstance;
  }

  setProjectData(
    args: {
      hasTexts?: boolean;
      selectedTask?: string;
      selectedBooknum?: number;
      role?: SFProjectRole;
      checkingEnabled?: boolean;
    } = {}
  ): void {
    this.realtimeService.addSnapshot<SFProjectUserConfig>(SFProjectUserConfigDoc.COLLECTION, {
      id: getSFProjectUserConfigDocId('project01', 'user01'),
      data: {
        ownerRef: 'user01',
        projectRef: 'project01',
        selectedTask: args.selectedTask,
        selectedBookNum: args.selectedTask == null ? undefined : args.selectedBooknum,
        isTargetTextRight: true,
        confidenceThreshold: 0.2,
        translationSuggestionsEnabled: true,
        numSuggestions: 1,
        selectedSegment: '',
        questionRefsRead: [],
        answerRefsRead: [],
        commentRefsRead: []
      }
    });

    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'project01',
      data: {
        name: 'project 01',
        shortName: 'P01',
        paratextId: 'pt01',
        writingSystem: {
          tag: 'qaa'
        },
        translateConfig: {
          translationSuggestionsEnabled: false
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
                  permissions: {},
                  sourcePermissions: {}
                },
                {
                  bookNum: 41,
                  chapters: [],
                  hasSource: false,
                  permissions: {},
                  sourcePermissions: {}
                }
              ]
            : [],
        userRoles: { user01: args.role == null ? SFProjectRole.ParatextTranslator : args.role }
      }
    });
  }

  setLinkSharing(enabled: boolean, shareKey?: string): void {
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.queryParams = { sharing: enabled ? 'true' : undefined, shareKey: shareKey ? shareKey : undefined };
    when(mockedActivatedRoute.snapshot).thenReturn(snapshot);
  }
}
