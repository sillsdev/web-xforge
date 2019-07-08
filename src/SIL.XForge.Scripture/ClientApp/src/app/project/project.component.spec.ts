import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, Router } from '@angular/router';
import * as OTJson0 from 'ot-json0';
import { of } from 'rxjs';
import { anything, deepEqual, instance, mock, verify, when } from 'ts-mockito';
import { MapQueryResults } from 'xforge-common/json-api.service';
import { UserRef } from 'xforge-common/models/user';
import { MemoryRealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { nameof } from 'xforge-common/utils';
import { SFProject, SFProjectRef } from '../core/models/sfproject';
import { SFProjectData } from '../core/models/sfproject-data';
import { SFProjectDataDoc } from '../core/models/sfproject-data-doc';
import { SFProjectRoles } from '../core/models/sfproject-roles';
import { SFProjectUser, SFProjectUserRef } from '../core/models/sfproject-user';
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

  it('do not navigate when project is null', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setNoProjectData();
    env.fixture.detectChanges();
    tick();

    verify(env.mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(env.mockedRouter.navigate(anything(), anything())).never();
    expect().nothing();
  }));

  it('do not navigate when projectUser is null', fakeAsync(() => {
    const env = new TestEnvironment();
    env.setNoProjectUserData();
    env.fixture.detectChanges();
    tick();

    verify(env.mockedSFProjectService.onlineCheckLinkSharing('project01')).never();
    verify(env.mockedRouter.navigate(anything(), anything())).never();
    expect().nothing();
  }));

  it('handle partial data', fakeAsync(() => {
    // Similar to SF-229
    const env = new TestEnvironment();
    env.setLimitedProjectUserData();

    expect(() => {
      env.fixture.detectChanges();
      tick();
    }).not.toThrow();
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

    verify(env.mockedSFProjectService.onlineCheckLinkSharing('project01')).once();
    verify(env.mockedRouter.navigate(deepEqual(['./', 'translate', 'text02']), anything())).once();
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
    when(this.mockedSFProjectService.get('project01', deepEqual([[nameof<SFProject>('users')]]))).thenReturn(
      of(new MapQueryResults(null))
    );
  }

  setNoProjectUserData(): void {
    when(this.mockedSFProjectService.get('project01', deepEqual([[nameof<SFProject>('users')]]))).thenReturn(
      of(
        new MapQueryResults(
          new SFProject({
            id: 'project01',
            translateEnabled: true,
            checkingEnabled: true
          })
        )
      )
    );
    this.setProjectDataDoc();
  }

  setProjectData(args: {
    isTranslateEnabled?: boolean;
    hasTexts?: boolean;
    selectedTask?: string;
    role?: SFProjectRoles;
  }): void {
    when(this.mockedSFProjectService.get('project01', deepEqual([[nameof<SFProject>('users')]]))).thenReturn(
      of(
        new MapQueryResults(
          new SFProject({
            id: 'project01',
            translateEnabled: args.isTranslateEnabled == null || args.isTranslateEnabled,
            checkingEnabled: true,
            users: [new SFProjectUserRef('projectuser01')]
          }),
          undefined,
          [
            new SFProjectUser({
              id: 'projectuser01',
              user: new UserRef('user01'),
              project: new SFProjectRef('project01'),
              role: args.role == null ? SFProjectRoles.ParatextTranslator : args.role,
              selectedTask: args.selectedTask,
              selectedBookId: args.selectedTask == null ? undefined : 'text02'
            })
          ]
        )
      )
    );
    this.setProjectDataDoc(args.hasTexts == null || args.hasTexts);
  }

  // Such as from an incomplete offline storage
  setLimitedProjectUserData(): void {
    when(this.mockedSFProjectService.get('project01', deepEqual([[nameof<SFProject>('users')]]))).thenReturn(
      of(
        new MapQueryResults(
          new SFProject({
            id: 'project01',
            translateEnabled: true,
            checkingEnabled: true,
            users: [new SFProjectUserRef('projectuser01')]
          }),
          undefined,
          [
            new SFProjectUser({
              id: 'projectuser01',
              project: new SFProjectRef('project01')
            })
          ]
        )
      )
    );
    this.setProjectDataDoc();
  }

  setLinkSharing(enabled: boolean): void {
    const snapshot = new ActivatedRouteSnapshot();
    snapshot.queryParams = { sharing: enabled ? 'true' : undefined };
    when(this.mockedActivatedRoute.snapshot).thenReturn(snapshot);
  }

  private setProjectDataDoc(hasTexts: boolean = true): void {
    const projectData: SFProjectData = {
      texts: hasTexts ? [{ bookId: 'text01' }, { bookId: 'text02' }] : undefined
    };
    const adapter = new MemoryRealtimeDocAdapter(OTJson0.type, 'project01', projectData);
    const doc = new SFProjectDataDoc(adapter, instance(this.mockedRealtimeOfflineStore));
    when(this.mockedSFProjectService.getDataDoc('project01')).thenResolve(doc);
  }
}
