import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { CheckingShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TranslateShareLevel } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { mock, verify, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { CheckingAnswerExport } from 'realtime-server/lib/esm/scriptureforge/models/checking-config';
import { paratextUsersFromRoles } from '../../../app/shared/test-utils';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { ProjectNotificationService } from '../../core/project-notification.service';
import { SFProjectService } from '../../core/sf-project.service';
import { ProgressState, SyncProgressComponent } from './sync-progress.component';

const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(SFProjectService);
const mockedProjectNotificationService = mock(ProjectNotificationService);

describe('SyncProgressComponent', () => {
  configureTestingModule(() => ({
    declarations: [HostComponent, SyncProgressComponent],
    imports: [UICommonModule, TestTranslocoModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: ProjectNotificationService, useMock: mockedProjectNotificationService },
      { provide: SFProjectService, useMock: mockedProjectService }
    ]
  }));

  it('does not initialize if projectDoc is undefined', fakeAsync(() => {
    const env = new TestEnvironment({ userId: 'user01' });
    expect(env.host.projectDoc).toBeUndefined();
    verify(mockedProjectService.get('sourceProject02')).never();
    expect(env.host.syncProgress!.mode).toBe('indeterminate');
  }));

  it('ignores source if source project is invalid', fakeAsync(() => {
    when(mockedProjectService.onlineGetProjectRole('invalid_source')).thenResolve(SFProjectRole.None);
    const env = new TestEnvironment({ userId: 'user01', sourceProject: 'invalid_source' });
    env.setupProjectDoc();
    verify(mockedProjectService.onlineGetProjectRole('invalid_source')).once();
    env.emitSyncProgress(0.5, 'testProject01');
    expect(env.host.inProgress).toBe(true);
    expect(env.host.syncProgress.syncProgressPercent).toEqual(50);
    env.emitSyncComplete(true, 'testProject01');
    expect(env.host.inProgress).toBe(false);
  }));

  it('should show progress when sync is active', fakeAsync(() => {
    const env = new TestEnvironment({ userId: 'user01' });
    env.setupProjectDoc();
    // Simulate sync starting
    env.emitSyncProgress(0, 'testProject01');
    expect(env.progressBar).not.toBeNull();
    expect(env.host.syncProgress.mode).toBe('indeterminate');
    verify(mockedProjectService.onlineGetProjectRole('sourceProject02')).never();
    // Simulate sync in progress
    env.emitSyncProgress(0.5, 'testProject01');
    expect(env.host.syncProgress.mode).toBe('determinate');
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
  }));

  it('show source and target progress combined when translation suggestions disabled', fakeAsync(() => {
    const env = new TestEnvironment({
      userId: 'user01',
      sourceProject: 'sourceProject02',
      translationSuggestionsEnabled: false
    });
    env.setupProjectDoc();
    env.checkCombinedProgress();
  }));

  it('does not access source project if user does not have a paratext role', fakeAsync(() => {
    const env = new TestEnvironment({ userId: 'user01' });
    env.setupProjectDoc();
    env.emitSyncProgress(0, 'testProject01');
    env.emitSyncProgress(0, 'sourceProject02');
    verify(mockedProjectService.get('sourceProject02')).never();
    env.emitSyncComplete(true, 'sourceProject02');
    env.emitSyncProgress(0.5, 'testProject01');
    expect(env.host.syncProgress.syncProgressPercent).toEqual(50);
    env.emitSyncComplete(true, 'testProject01');
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
  readonly fixture: ComponentFixture<HostComponent>;
  readonly host: HostComponent;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);
  private userRoleTarget = { user01: SFProjectRole.ParatextAdministrator, user02: SFProjectRole.ParatextAdministrator };
  private userRoleSource = { user01: SFProjectRole.ParatextAdministrator };

  constructor(args: TestEnvArgs) {
    const date = new Date();
    date.setMonth(date.getMonth() - 2);
    this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
      id: 'testProject01',
      data: {
        name: 'Sync Test Project',
        paratextId: 'pt01',
        shortName: 'P01',
        writingSystem: {
          tag: 'en'
        },
        translateConfig: {
          translationSuggestionsEnabled: !!args.translationSuggestionsEnabled,
          shareEnabled: false,
          shareLevel: TranslateShareLevel.Specific,
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
        checkingConfig: {
          checkingEnabled: false,
          usersSeeEachOthersResponses: true,
          shareEnabled: true,
          shareLevel: CheckingShareLevel.Specific,
          answerExportMethod: CheckingAnswerExport.MarkedForExport
        },
        sync: {
          queuedCount: args.isInProgress === true ? 1 : 0,
          lastSyncSuccessful: true,
          dateLastSuccessfulSync: date.toJSON()
        },
        editable: true,
        texts: [],
        userRoles: this.userRoleTarget,
        paratextUsers: paratextUsersFromRoles(this.userRoleTarget),
        userPermissions: {}
      }
    });

    if (args.sourceProject != null) {
      this.realtimeService.addSnapshot<SFProject>(SFProjectDoc.COLLECTION, {
        id: 'sourceProject02',
        data: {
          name: 'Sync Source Project',
          paratextId: 'pt02',
          shortName: 'P02',
          writingSystem: {
            tag: 'en'
          },
          translateConfig: {
            translationSuggestionsEnabled: false,
            shareEnabled: false,
            shareLevel: TranslateShareLevel.Specific
          },
          checkingConfig: {
            checkingEnabled: false,
            usersSeeEachOthersResponses: true,
            shareEnabled: true,
            shareLevel: CheckingShareLevel.Specific,
            answerExportMethod: CheckingAnswerExport.MarkedForExport
          },
          sync: {
            queuedCount: 0,
            lastSyncSuccessful: true,
            dateLastSuccessfulSync: date.toJSON()
          },
          editable: true,
          texts: [],
          userRoles: this.userRoleSource,
          paratextUsers: paratextUsersFromRoles(this.userRoleSource),
          userPermissions: {}
        }
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

  emitSyncProgress(percentCompleted: number, projectId: string): void {
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

  checkCombinedProgress(): void {
    this.emitSyncProgress(0, 'testProject01');
    this.emitSyncProgress(0, 'sourceProject02');
    verify(mockedProjectService.onlineGetProjectRole('sourceProject02')).once();
    verify(mockedProjectService.get('sourceProject02')).once();
    expect(this.progressBar).not.toBeNull();
    expect(this.host.syncProgress.mode).toBe('indeterminate');
    this.emitSyncProgress(0.8, 'sourceProject02');
    expect(this.host.syncProgress.syncProgressPercent).toEqual(40);
    expect(this.host.syncProgress.mode).toBe('determinate');
    this.emitSyncComplete(true, 'sourceProject02');
    expect(this.host.syncProgress.syncProgressPercent).toEqual(50);
    expect(this.host.syncProgress.mode).toBe('indeterminate');
    this.emitSyncProgress(0.8, 'testProject01');
    expect(this.host.syncProgress.syncProgressPercent).toEqual(90);
    this.emitSyncComplete(true, 'testProject01');
  }
}
