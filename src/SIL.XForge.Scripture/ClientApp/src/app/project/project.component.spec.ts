import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, Router } from '@angular/router';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import {
  getSFProjectUserConfigDocId,
  SFProjectUserConfig
} from 'realtime-server/lib/scriptureforge/models/sf-project-user-config';
import { of } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { CommandError, CommandErrorCode } from 'xforge-common/command.service';
import { MemoryRealtimeOfflineStore } from 'xforge-common/memory-realtime-offline-store';
import { MemoryRealtimeDocAdapter } from 'xforge-common/memory-realtime-remote-store';
import { NoticeService } from 'xforge-common/notice.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../core/models/sf-project-user-config-doc';
import { SFProjectService } from '../core/sf-project.service';
import { ProjectComponent } from './project.component';

describe('ProjectComponent', () => {
  it('navigate to last text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'translate' });
    env.fixture.detectChanges();
    tick();

    verify(env.mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(env.mockedRouter.navigate(deepEqual(['./', 'translate', 'MRK']), anything())).once();
    expect().nothing();
  }));

  it('navigate to first text when no last selected text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData();
    env.fixture.detectChanges();
    tick();

    verify(env.mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(env.mockedRouter.navigate(deepEqual(['./', 'translate', 'MAT']), anything())).once();
    expect().nothing();
  }));

  it('navigate to checking tool if a checker and no last selected text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ role: SFProjectRole.CommunityChecker });
    env.fixture.detectChanges();
    tick();

    verify(env.mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(env.mockedRouter.navigate(deepEqual(['./', 'checking', 'MAT']), anything())).once();
    expect().nothing();
  }));

  it('do not navigate when no texts', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ hasTexts: false });
    env.fixture.detectChanges();
    tick();

    verify(env.mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(env.mockedRouter.navigate(anything(), anything())).never();
    expect().nothing();
  }));

  it('do not navigate when project does not exist', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setNoProjectData();
    env.fixture.detectChanges();
    tick();

    verify(env.mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(env.mockedRouter.navigate(anything(), anything())).never();
    expect().nothing();
  }));

  it('check sharing link', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'translate' });
    env.setLinkSharing(true);
    env.fixture.detectChanges();
    tick();

    verify(env.mockedSFProjectService.onlineCheckLinkSharing('project01', undefined)).once();
    verify(env.mockedRouter.navigate(deepEqual(['./', 'translate', 'MRK']), anything())).once();
    expect().nothing();
  }));

  it('check sharing link passes shareKey', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'translate' });
    env.setLinkSharing(true, 'secret123');
    env.fixture.detectChanges();
    tick();

    verify(env.mockedSFProjectService.onlineCheckLinkSharing('project01', 'secret123')).once();
    expect().nothing();
  }));

  it('check sharing link forbidden', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedSFProjectService.onlineCheckLinkSharing('project01', undefined)).thenReject(
      new CommandError(CommandErrorCode.Forbidden, 'Forbidden')
    );
    env.setProjectData({ selectedTask: 'translate' });
    env.setLinkSharing(true);
    env.fixture.detectChanges();
    tick();

    verify(env.mockedNoticeService.showMessageDialog(anything())).once();
    verify(env.mockedRouter.navigateByUrl('/projects', anything())).once();
    expect().nothing();
  }));

  it('check sharing link project not found', fakeAsync(() => {
    const env = new TestEnvironment();
    when(env.mockedSFProjectService.onlineCheckLinkSharing('project01', undefined)).thenReject(
      new CommandError(CommandErrorCode.NotFound, 'NotFound')
    );
    env.setProjectData({ selectedTask: 'translate' });
    env.setLinkSharing(true);
    env.fixture.detectChanges();
    tick();

    verify(env.mockedNoticeService.showMessageDialog(anything())).once();
    verify(env.mockedRouter.navigateByUrl('/projects', anything())).once();
    expect().nothing();
  }));
});

class TestEnvironment {
  readonly component: ProjectComponent;
  readonly fixture: ComponentFixture<ProjectComponent>;

  readonly mockedUserService = mock(UserService);
  readonly mockedActivatedRoute = mock(ActivatedRoute);
  readonly mockedRouter = mock(Router);
  readonly mockedSFProjectService = mock(SFProjectService);
  readonly mockedNoticeService = mock(NoticeService);

  private readonly offlineStore = new MemoryRealtimeOfflineStore();

  constructor() {
    when(this.mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.queryParams = { sharing: 'true' };
    when(this.mockedActivatedRoute.snapshot).thenReturn(snapshot);
    when(this.mockedUserService.currentUserId).thenReturn('user01');
    when(this.mockedSFProjectService.onlineCheckLinkSharing('project01')).thenResolve();
    when(this.mockedSFProjectService.onlineCheckLinkSharing('project01', anything())).thenResolve();
    when(this.mockedNoticeService.showMessageDialog(anything())).thenResolve();
    this.setLinkSharing(false);

    TestBed.configureTestingModule({
      declarations: [ProjectComponent],
      imports: [UICommonModule],
      providers: [
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: Router, useFactory: () => instance(this.mockedRouter) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedSFProjectService) },
        { provide: NoticeService, useFactory: () => instance(this.mockedNoticeService) }
      ]
    });
    this.fixture = TestBed.createComponent(ProjectComponent);
    this.component = this.fixture.componentInstance;
  }

  setNoProjectData(): void {
    const projectUserConfigDoc = new SFProjectUserConfigDoc(
      this.offlineStore,
      new MemoryRealtimeDocAdapter(
        SFProjectUserConfigDoc.COLLECTION,
        getSFProjectUserConfigDocId('project01', 'user01')
      )
    );
    when(this.mockedSFProjectService.getUserConfig('project01', 'user01')).thenResolve(projectUserConfigDoc);
    const projectDoc = new SFProjectDoc(
      this.offlineStore,
      new MemoryRealtimeDocAdapter(SFProjectDoc.COLLECTION, 'project01')
    );
    when(this.mockedSFProjectService.get('project01')).thenResolve(projectDoc);
  }

  setProjectData(args: { hasTexts?: boolean; selectedTask?: string; role?: SFProjectRole } = {}): void {
    const projectUserConfig: SFProjectUserConfig = {
      ownerRef: 'user01',
      projectRef: 'project01',
      selectedTask: args.selectedTask,
      selectedBookNum: args.selectedTask == null ? undefined : 41,
      isTargetTextRight: true,
      confidenceThreshold: 0.2,
      translationSuggestionsEnabled: true,
      selectedSegment: '',
      questionRefsRead: [],
      answerRefsRead: [],
      commentRefsRead: []
    };
    const projectUserConfigDoc = new SFProjectUserConfigDoc(
      this.offlineStore,
      new MemoryRealtimeDocAdapter(
        SFProjectUserConfigDoc.COLLECTION,
        getSFProjectUserConfigDocId('project01', 'user01'),
        projectUserConfig
      )
    );
    when(this.mockedSFProjectService.getUserConfig('project01', 'user01')).thenResolve(projectUserConfigDoc);
    const project: SFProject = {
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
        checkingEnabled: true,
        usersSeeEachOthersResponses: true,
        shareEnabled: true,
        shareLevel: CheckingShareLevel.Specific
      },
      sync: { queuedCount: 0 },
      texts:
        args.hasTexts == null || args.hasTexts
          ? [{ bookNum: 40, chapters: [], hasSource: false }, { bookNum: 41, chapters: [], hasSource: false }]
          : [],
      userRoles: { user01: args.role == null ? SFProjectRole.ParatextTranslator : args.role }
    };
    const projectDoc = new SFProjectDoc(
      this.offlineStore,
      new MemoryRealtimeDocAdapter(SFProjectDoc.COLLECTION, 'project01', project)
    );
    when(this.mockedSFProjectService.get('project01')).thenResolve(projectDoc);
  }

  setLinkSharing(enabled: boolean, shareKey?: string): void {
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.queryParams = { sharing: enabled ? 'true' : undefined, shareKey: shareKey ? shareKey : undefined };
    when(this.mockedActivatedRoute.snapshot).thenReturn(snapshot);
  }
}
