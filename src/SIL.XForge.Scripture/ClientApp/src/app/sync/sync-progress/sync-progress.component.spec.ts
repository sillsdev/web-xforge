import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideAnimations } from '@angular/platform-browser/animations';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { createTestProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-test-data';
import { firstValueFrom } from 'rxjs';
import { anything, mock, verify, when } from 'ts-mockito';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { NoticeService } from 'xforge-common/notice.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { ProjectNotificationService } from '../../core/project-notification.service';
import { SFProjectService } from '../../core/sf-project.service';
import { paratextUsersFromRoles } from '../../shared/test-utils';
import { ProgressState, SyncProgressComponent } from './sync-progress.component';

const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(SFProjectService);
const mockedProjectNotificationService = mock(ProjectNotificationService);
const mockedErrorReportingService = mock(ErrorReportingService);

describe('SyncProgressComponent', () => {
  configureTestingModule(() => ({
    declarations: [HostComponent, SyncProgressComponent],
    imports: [
      TestOnlineStatusModule.forRoot(),
      UICommonModule,
      TestTranslocoModule,
      TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)
    ],
    providers: [
      provideAnimations(),
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ProjectNotificationService, useMock: mockedProjectNotificationService },
      { provide: SFProjectService, useMock: mockedProjectService },
      { provide: ErrorReportingService, useMock: mockedErrorReportingService },
      { provide: OnlineStatusService, useClass: TestOnlineStatusService }
    ]
  }));

  it('does not initialize if projectDoc is undefined', fakeAsync(async () => {
    const env = new TestEnvironment({ userId: 'user01' });
    expect(env.host.projectDoc).toBeUndefined();
    verify(mockedProjectService.get('sourceProject02')).never();
    expect(await env.getMode()).toBe('indeterminate');
  }));

  it('does not initialize if app is offline', fakeAsync(async () => {
    const env = new TestEnvironment({ userId: 'user01' });
    env.setupProjectDoc();
    env.onlineStatus = false;
    verify(mockedProjectService.get('sourceProject02')).never();
    expect(await env.getMode()).toBe('indeterminate');
  }));

  it('ignores source if source project is invalid', fakeAsync(async () => {
    when(mockedProjectService.onlineGetProjectRole('invalid_source')).thenResolve(SFProjectRole.None);
    const env = new TestEnvironment({ userId: 'user01', sourceProject: 'invalid_source' });
    env.setupProjectDoc();
    verify(mockedProjectService.onlineGetProjectRole('invalid_source')).once();
    env.updateSyncProgress(0.5, 'testProject01');
    expect(env.host.inProgress).toBe(true);
    expect(await env.getPercent()).toEqual(50);
    env.emitSyncComplete(true, 'testProject01');
    expect(env.host.inProgress).toBe(false);
  }));

  it('should show progress when sync is active', fakeAsync(async () => {
    const env = new TestEnvironment({ userId: 'user01' });
    env.setupProjectDoc();
    // Simulate sync starting
    env.updateSyncProgress(0, 'testProject01');
    expect(env.progressBar).not.toBeNull();
    expect(await env.getMode()).toBe('indeterminate');
    verify(mockedProjectService.onlineGetProjectRole('sourceProject02')).never();
    // Simulate sync in progress
    env.updateSyncProgress(0.5, 'testProject01');
    expect(await env.getMode()).toBe('determinate');
    // Simulate sync completed
    env.emitSyncComplete(true, 'testProject01');
    tick();
  }));

  it('show progress as source and target combined', fakeAsync(() => {
    const env = new TestEnvironment({
      userId: 'user01',
      sourceProject: 'sourceProject02',
      translationSuggestionsEnabled: true
    });
    env.setupProjectDoc();
    env.checkCombinedProgress();
    tick();
  }));

  it('show source and target progress combined when translation suggestions disabled', fakeAsync(() => {
    const env = new TestEnvironment({
      userId: 'user01',
      sourceProject: 'sourceProject02',
      translationSuggestionsEnabled: false
    });
    env.setupProjectDoc();
    env.checkCombinedProgress();
    tick();
  }));

  it('does not access source project if user does not have a paratext role', fakeAsync(async () => {
    const env = new TestEnvironment({ userId: 'user02', sourceProject: 'sourceProject02' });
    env.setupProjectDoc();
    env.updateSyncProgress(0, 'testProject01');
    env.updateSyncProgress(0, 'sourceProject02');
    verify(mockedProjectService.get('sourceProject02')).never();
    env.emitSyncComplete(true, 'sourceProject02');
    env.updateSyncProgress(0.5, 'testProject01');
    expect(await env.getPercent()).toEqual(50);
    env.emitSyncComplete(true, 'testProject01');
  }));

  it('does not throw error if get project role times out', fakeAsync(() => {
    const env = new TestEnvironment({ userId: 'user01', sourceProject: 'sourceProject02' });
    when(mockedProjectService.onlineGetProjectRole('sourceProject02')).thenReject(new Error('504: Gateway Timeout'));
    env.setupProjectDoc();
    verify(mockedProjectService.onlineGetProjectRole('sourceProject02')).once();
    verify(mockedProjectService.get('sourceProject02')).never();
    verify(mockedErrorReportingService.silentError(anything(), anything())).once();
    expect(env.progressBar).not.toBeNull();
  }));
});

@Component({
  template: `<app-sync-progress [projectDoc]="projectDoc" (inProgress)="inProgress = $event"></app-sync-progress>`
})
class HostComponent {
  projectDoc?: SFProjectDoc;
  inProgress: boolean = false;
  @ViewChild(SyncProgressComponent) syncProgress!: SyncProgressComponent;

  constructor(private readonly projectService: SFProjectService) {}

  setProjectDoc(): void {
    this.projectService.get('testProject01').then(doc => (this.projectDoc = doc));
  }
}

interface TestEnvArgs {
  userId: string;
  sourceProject?: string;
  translationSuggestionsEnabled?: boolean;
  isInProgress?: boolean;
}

class TestEnvironment {
  readonly testOnlineStatusService: TestOnlineStatusService = TestBed.inject(
    OnlineStatusService
  ) as TestOnlineStatusService;
  readonly fixture: ComponentFixture<HostComponent>;
  readonly host: HostComponent;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private userRoleTarget = { user01: SFProjectRole.ParatextAdministrator, user02: SFProjectRole.ParatextAdministrator };
  private userRoleSource = { user01: SFProjectRole.ParatextAdministrator };

  constructor(args: TestEnvArgs) {
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'testProject01',
      data: createTestProject(
        {
          translateConfig: {
            translationSuggestionsEnabled: !!args.translationSuggestionsEnabled,
            source:
              args.sourceProject != null
                ? {
                    paratextId: 'pt02',
                    projectRef: args.sourceProject,
                    isRightToLeft: false,
                    writingSystem: { tag: 'en' },
                    name: 'Sync Source Project',
                    shortName: 'P02'
                  }
                : undefined
          },
          sync: {
            queuedCount: args.isInProgress === true ? 1 : 0
          },
          userRoles: this.userRoleTarget,
          paratextUsers: paratextUsersFromRoles(this.userRoleTarget)
        },
        1
      )
    });

    if (args.sourceProject != null) {
      this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
        id: 'sourceProject02',
        data: createTestProject(
          {
            userRoles: this.userRoleSource,
            paratextUsers: paratextUsersFromRoles(this.userRoleSource)
          },
          2
        )
      });
    }
    when(mockedProjectService.get('testProject01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'testProject01')
    );
    when(mockedProjectService.get('sourceProject02')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'sourceProject02')
    );
    when(mockedProjectService.onlineGetProjectRole('sourceProject02')).thenResolve(this.userRoleSource[args.userId]);

    this.fixture = TestBed.createComponent(HostComponent);
    this.host = this.fixture.componentInstance;
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  get progressBar(): HTMLElement | null {
    return this.fixture.nativeElement.querySelector('mat-progress-bar');
  }

  set onlineStatus(isOnline: boolean) {
    this.testOnlineStatusService.setIsOnline(isOnline);
    tick();
    this.fixture.detectChanges();
  }

  updateSyncProgress(percentCompleted: number, projectId: string): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(ops => {
      ops.set<number>(p => p.sync.queuedCount, 1);
    }, false);
    this.host.syncProgress.updateProgressState(projectId, new ProgressState(percentCompleted));
    tick();
    this.fixture.detectChanges();
    tick();
  }

  emitSyncComplete(successful: boolean, projectId: string): void {
    this.host.syncProgress.updateProgressState(projectId, new ProgressState(1));
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(ops => {
      ops.set<number>(p => p.sync.queuedCount, 0);
      ops.set(p => p.sync.lastSyncSuccessful!, successful);
      if (successful) {
        ops.set(p => p.sync.dateLastSuccessfulSync!, new Date().toJSON());
      }
    }, false);
    this.fixture.detectChanges();
  }

  setupProjectDoc(): void {
    this.host.setProjectDoc();
    tick();
    this.fixture.detectChanges();
    tick();
  }

  async checkCombinedProgress(): Promise<void> {
    this.updateSyncProgress(0, 'testProject01');
    this.updateSyncProgress(0, 'sourceProject02');
    verify(mockedProjectService.onlineGetProjectRole('sourceProject02')).once();
    verify(mockedProjectService.get('sourceProject02')).once();
    expect(this.progressBar).not.toBeNull();

    expect(await this.getMode()).toBe('indeterminate');
    this.updateSyncProgress(0.8, 'sourceProject02');
    expect(await this.getPercent()).toEqual(40);
    expect(await this.getMode()).toBe('determinate');
    this.emitSyncComplete(true, 'sourceProject02');
    expect(await this.getPercent()).toEqual(50);
    expect(await this.getMode()).toBe('determinate');
    this.updateSyncProgress(0.8, 'testProject01');
    expect(await this.getPercent()).toEqual(90);
    this.emitSyncComplete(true, 'testProject01');
  }

  async getMode(): Promise<string> {
    return firstValueFrom(this.host.syncProgress.syncProgressMode$);
  }

  async getPercent(): Promise<number> {
    return firstValueFrom(this.host.syncProgress.syncProgressPercent$);
  }
}
