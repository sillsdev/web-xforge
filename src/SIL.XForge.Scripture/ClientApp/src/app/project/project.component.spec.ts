import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, Router } from '@angular/router';
import * as OTJson0 from 'ot-json0';
import { of } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { SFProject } from '../core/models/sfproject';
import { SFProjectDoc } from '../core/models/sfproject-doc';
import { SFProjectRoles } from '../core/models/sfproject-roles';
import { SFProjectUserConfig } from '../core/models/sfproject-user-config';
import { SFProjectUserConfigDoc } from '../core/models/sfproject-user-config-doc';
import { SFProjectService } from '../core/sfproject.service';
import { ProjectComponent } from './project.component';

describe('ProjectComponent', () => {
  it('navigate to last text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ selectedTask: 'translate' });
    env.fixture.detectChanges();
    tick();

    verify(env.mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(env.mockedRouter.navigate(deepEqual(['./', 'translate', 'text02']), anything())).once();
    expect().nothing();
  }));

  it('navigate to first text when no last selected text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ isTranslateEnabled: false });
    env.fixture.detectChanges();
    tick();

    verify(env.mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(env.mockedRouter.navigate(deepEqual(['./', 'checking', 'text01']), anything())).once();
    expect().nothing();
  }));

  it('navigate to checking task if a reviewer and no last selected text', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ role: SFProjectRoles.Reviewer });
    env.fixture.detectChanges();
    tick();

    verify(env.mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(env.mockedRouter.navigate(deepEqual(['./', 'checking', 'text01']), anything())).once();
    expect().nothing();
  }));

  it('do not navigate when no texts', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setProjectData({ isTranslateEnabled: false, hasTexts: false });
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
    verify(env.mockedRouter.navigate(deepEqual(['./', 'translate', 'text02']), anything())).once();
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
});

class TestEnvironment {
  readonly component: ProjectComponent;
  readonly fixture: ComponentFixture<ProjectComponent>;

  readonly mockedUserService = mock(UserService);
  readonly mockedActivatedRoute = mock(ActivatedRoute);
  readonly mockedRouter = mock(Router);
  readonly mockedSFProjectService = mock(SFProjectService);
  readonly mockedRealtimeOfflineStore = mock(RealtimeOfflineStore);

  constructor() {
    when(this.mockedActivatedRoute.params).thenReturn(of({ projectId: 'project01' }));
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.queryParams = { sharing: 'true' };
    when(this.mockedActivatedRoute.snapshot).thenReturn(snapshot);
    when(this.mockedUserService.currentUserId).thenReturn('user01');
    when(this.mockedSFProjectService.onlineCheckLinkSharing('project01')).thenResolve();
    when(this.mockedSFProjectService.onlineCheckLinkSharing('project01', anything())).thenResolve();
    this.setLinkSharing(false);

    TestBed.configureTestingModule({
      declarations: [ProjectComponent],
      imports: [UICommonModule],
      providers: [
        { provide: UserService, useFactory: () => instance(this.mockedUserService) },
        { provide: ActivatedRoute, useFactory: () => instance(this.mockedActivatedRoute) },
        { provide: Router, useFactory: () => instance(this.mockedRouter) },
        { provide: SFProjectService, useFactory: () => instance(this.mockedSFProjectService) }
      ]
    });
    this.fixture = TestBed.createComponent(ProjectComponent);
    this.component = this.fixture.componentInstance;
  }

  setNoProjectData(): void {
    const projectUserConfigDoc = new SFProjectUserConfigDoc(
      new MemoryRealtimeDocAdapter('project01:user01'),
      instance(this.mockedRealtimeOfflineStore)
    );
    when(this.mockedSFProjectService.getUserConfig('project01', 'user01')).thenResolve(projectUserConfigDoc);
    const projectDoc = new SFProjectDoc(
      new MemoryRealtimeDocAdapter('project01'),
      instance(this.mockedRealtimeOfflineStore)
    );
    when(this.mockedSFProjectService.get('project01')).thenResolve(projectDoc);
  }

  setProjectData(args: {
    isTranslateEnabled?: boolean;
    hasTexts?: boolean;
    selectedTask?: string;
    role?: SFProjectRoles;
  }): void {
    const projectUserConfig: SFProjectUserConfig = {
      ownerRef: 'user01',
      selectedTask: args.selectedTask,
      selectedBookId: args.selectedTask == null ? undefined : 'text02'
    };
    const projectUserConfigDoc = new SFProjectUserConfigDoc(
      new MemoryRealtimeDocAdapter('project01:user01', OTJson0.type, projectUserConfig),
      instance(this.mockedRealtimeOfflineStore)
    );
    when(this.mockedSFProjectService.getUserConfig('project01', 'user01')).thenResolve(projectUserConfigDoc);
    const project: SFProject = {
      translateEnabled: args.isTranslateEnabled == null || args.isTranslateEnabled,
      checkingEnabled: true,
      texts: args.hasTexts == null || args.hasTexts ? [{ bookId: 'text01' }, { bookId: 'text02' }] : undefined,
      userRoles: { user01: args.role == null ? SFProjectRoles.ParatextTranslator : args.role }
    };
    const projectDoc = new SFProjectDoc(
      new MemoryRealtimeDocAdapter('project01', OTJson0.type, project),
      instance(this.mockedRealtimeOfflineStore)
    );
    when(this.mockedSFProjectService.get('project01')).thenResolve(projectDoc);
  }

  setLinkSharing(enabled: boolean, shareKey?: string): void {
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.queryParams = { sharing: enabled ? 'true' : undefined, shareKey: shareKey ? shareKey : undefined };
    when(this.mockedActivatedRoute.snapshot).thenReturn(snapshot);
  }
}
