import { Component, ViewChild } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { CheckingShareLevel } from 'realtime-server/lib/scriptureforge/models/checking-config';
import { SFProject } from 'realtime-server/lib/scriptureforge/models/sf-project';
import { mock, verify, when } from 'ts-mockito';
import { NoticeService } from 'xforge-common/notice.service';
import { ProjectService } from 'xforge-common/project.service';
import { TestRealtimeModule } from 'xforge-common/test-realtime.module';
import { TestRealtimeService } from 'xforge-common/test-realtime.service';
import { configureTestingModule, TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_TYPE_REGISTRY } from '../../core/models/sf-type-registry';
import { SFProjectService } from '../../core/sf-project.service';

import { SyncProgressComponent } from './sync-progress.component';

const mockedNoticeService = mock(NoticeService);
const mockedProjectService = mock(ProjectService);

describe('SyncProgressComponent', () => {
  configureTestingModule(() => ({
    declarations: [HostComponent, SyncProgressComponent],
    imports: [UICommonModule, TestTranslocoModule, TestRealtimeModule.forRoot(SF_TYPE_REGISTRY)],
    providers: [
      { provide: NoticeService, useMock: mockedNoticeService },
      { provide: SFProjectService, useMock: mockedProjectService }
    ]
  }));

  it('should show progress when sync is active', fakeAsync(() => {
    const env = new TestEnvironment(false);
    expect(env.progressBar).toBeNull();
    // Simulate sync starting
    env.emitSyncProgress(0, 'testProject01');
    expect(env.progressBar).not.toBeNull();
    expect(env.host.syncProgress.isProgressDeterminate).toBe('indeterminate');
    // Simulate sync in progress
    env.emitSyncProgress(0.5, 'testProject01');
    expect(env.host.syncProgress.isProgressDeterminate).toBe('determinate');
    // Simulate sync completed
    env.emitSyncComplete(true, 'testProject01');
    expect(env.progressBar).toBeNull();
    tick();
  }));

  it('show progress as source and target combined', fakeAsync(() => {
    const env = new TestEnvironment(true);
    expect(env.progressBar).toBeNull();
    env.emitSyncProgress(0, 'testProject01');
    env.emitSyncProgress(0, 'sourceProject02');
    verify(mockedProjectService.get('sourceProject02')).once();
    expect(env.progressBar).not.toBeNull();
    expect(env.host.syncProgress.isProgressDeterminate).toBe('indeterminate');
    env.emitSyncProgress(0.8, 'sourceProject02');
    expect(env.host.syncProgress.syncProgressPercent).toEqual(40);
    expect(env.host.syncProgress.isProgressDeterminate).toBe('determinate');
    env.emitSyncComplete(true, 'sourceProject02');
    expect(env.host.syncProgress.syncProgressPercent).toEqual(50);
    expect(env.host.syncProgress.isProgressDeterminate).toBe('indeterminate');
    env.emitSyncProgress(0.8, 'testProject01');
    expect(env.host.syncProgress.syncProgressPercent).toEqual(90);
    env.emitSyncComplete(true, 'testProject01');
    expect(env.fixture.componentInstance.inProgress).toBe(false);
  }));
});

@Component({
  template: `<app-sync-progress
    *ngIf="inProgress"
    [projectDoc]="projectDoc"
    (inProgress)="inProgress = $event"
  ></app-sync-progress>`
})
class HostComponent {
  inProgress: boolean = false;
  projectDoc?: SFProjectDoc;
  @ViewChild(SyncProgressComponent) syncProgress!: SyncProgressComponent;

  constructor(private readonly projectService: SFProjectService) {
    this.projectService.get('testProject01').then(doc => (this.projectDoc = doc));
  }
}

class TestEnvironment {
  readonly fixture: ComponentFixture<HostComponent>;
  readonly component: SyncProgressComponent;
  readonly host: HostComponent;

  private readonly realtimeService: TestRealtimeService = TestBed.inject<TestRealtimeService>(TestRealtimeService);

  constructor(hasSource: boolean, isInProgress = false) {
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
        translateConfig: hasSource
          ? {
              translationSuggestionsEnabled: true,
              source: {
                paratextId: 'pt02',
                projectRef: 'sourceProject02',
                isRightToLeft: false,
                writingSystem: { tag: 'en' },
                name: 'Sync Source Project',
                shortName: 'P02'
              }
            }
          : { translationSuggestionsEnabled: false },
        checkingConfig: {
          checkingEnabled: false,
          usersSeeEachOthersResponses: true,
          shareEnabled: true,
          shareLevel: CheckingShareLevel.Specific
        },
        sync: {
          queuedCount: isInProgress ? 1 : 0,
          percentCompleted: isInProgress ? 0.1 : undefined,
          lastSyncSuccessful: true,
          dateLastSuccessfulSync: date.toJSON()
        },
        texts: [],
        userRoles: {}
      }
    });

    if (hasSource) {
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
            translationSuggestionsEnabled: false
          },
          checkingConfig: {
            checkingEnabled: false,
            usersSeeEachOthersResponses: true,
            shareEnabled: true,
            shareLevel: CheckingShareLevel.Specific
          },
          sync: {
            queuedCount: 0,
            lastSyncSuccessful: true,
            dateLastSuccessfulSync: date.toJSON()
          },
          texts: [],
          userRoles: {}
        }
      });
    }
    when(mockedProjectService.get('testProject01')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'testProject01')
    );
    when(mockedProjectService.get('sourceProject02')).thenCall(() =>
      this.realtimeService.subscribe(SFProjectDoc.COLLECTION, 'sourceProject02')
    );

    this.fixture = TestBed.createComponent(HostComponent);
    this.host = this.fixture.componentInstance;
    this.component = this.fixture.componentInstance.syncProgress;
    this.fixture.detectChanges();
    tick();
    this.fixture.detectChanges();
  }

  get progressBar(): HTMLElement | null {
    return this.fixture.nativeElement.querySelector('mat-progress-bar');
  }

  emitSyncProgress(percentCompleted: number, projectId: string): void {
    this.host.inProgress = true;
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(ops => {
      ops.set<number>(p => p.sync.queuedCount, 1);
      ops.set(p => p.sync.percentCompleted!, percentCompleted);
    }, false);
    tick();
    this.fixture.detectChanges();
    tick();
  }

  emitSyncComplete(successful: boolean, projectId: string): void {
    const projectDoc = this.realtimeService.get<SFProjectDoc>(SFProjectDoc.COLLECTION, projectId);
    projectDoc.submitJson0Op(ops => {
      ops.set<number>(p => p.sync.queuedCount, 0);
      ops.unset(p => p.sync.percentCompleted!);
      ops.set(p => p.sync.lastSyncSuccessful!, successful);
      if (successful) {
        ops.set(p => p.sync.dateLastSuccessfulSync!, new Date().toJSON());
      }
    }, false);
    this.fixture.detectChanges();
  }
}
