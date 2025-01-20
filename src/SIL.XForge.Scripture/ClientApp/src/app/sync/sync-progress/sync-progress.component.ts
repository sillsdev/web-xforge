import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ProgressBarMode } from '@angular/material/progress-bar';
import { OtJson0Op } from 'ot-json0';
import { isParatextRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { BehaviorSubject, map, merge, Observable } from 'rxjs';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';

import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { ProjectNotificationService } from '../../core/project-notification.service';
import { SFProjectService } from '../../core/sf-project.service';

export class ProgressState {
  constructor(
    public progressValue: number,
    public progressString?: string,
    public syncPhase?: SyncPhase,
    public syncProgress?: number
  ) {}
}

enum SyncPhase {
  Phase1 = 0, // Initial methods
  Phase2 = 1, // Update Paratext books and notes
  Phase3 = 2, // Update Paratext biblical term renderings
  Phase4 = 3, // Paratext Sync
  Phase5 = 4, // Deleting texts and granting resource access
  Phase6 = 5, // Getting the resource texts
  Phase7 = 6, // Updating texts from Paratext books
  Phase8 = 7, // Update biblical terms from Paratext
  Phase9 = 8 // Final methods
}

@Component({
  selector: 'app-sync-progress',
  templateUrl: './sync-progress.component.html',
  styleUrl: '../sync.component.scss'
})
export class SyncProgressComponent extends SubscriptionDisposable {
  @Input() showSyncStatus: boolean = true;
  @Output() inProgress: EventEmitter<boolean> = new EventEmitter<boolean>();

  syncPhase?: SyncPhase;
  phasePercentage: number = 0;
  syncProgress: number = 0;
  activeSyncProjectName: string = '';
  private progressPercent$ = new BehaviorSubject<number>(0);

  /** The progress as a percent between 0 and 100 for the target project and the source project, if one exists. */
  syncProgressPercent$: Observable<number> = this.progressPercent$.pipe(map(p => p * 100));
  syncProgressMode$: Observable<ProgressBarMode> = this.progressPercent$.pipe(
    map(percent => {
      if (this.featureFlags.stillness.enabled) {
        return 'determinate';
      }

      // Show indeterminate only at the beginning, as the sync has not yet started
      return percent > 0 ? 'determinate' : 'indeterminate';
    })
  );

  private sourceProjectDoc?: SFProjectDoc;
  private _projectDoc?: SFProjectDoc;

  constructor(
    private readonly projectService: SFProjectService,
    private readonly projectNotificationService: ProjectNotificationService,
    private readonly featureFlags: FeatureFlagService,
    private readonly errorReportingService: ErrorReportingService,
    private readonly onlineStatus: OnlineStatusService
  ) {
    super();

    this.projectNotificationService.setNotifySyncProgressHandler((projectId: string, progressState: ProgressState) => {
      this.updateProgressState(projectId, progressState);
    });
  }

  get appOnline(): boolean {
    return this.onlineStatus.isOnline && this.onlineStatus.isBrowserOnline;
  }

  get syncPhaseMessage(): string {
    if (this.phasePercentage > 0) return `phase_${this.syncPhase}_percent`;
    if (this.syncPhase != null) return `phase_${this.syncPhase}`;
    return 'initialize_sync';
  }

  @Input() set projectDoc(doc: SFProjectDoc | undefined) {
    if (doc == null) {
      return;
    }
    this._projectDoc = doc;
    this.initialize();
  }

  async initialize(): Promise<void> {
    if (this._projectDoc?.data == null || !this.appOnline) {
      return;
    }
    await this.projectNotificationService.start();
    if (this._projectDoc?.data?.translateConfig.source != null) {
      const sourceProjectId: string | undefined = this._projectDoc.data.translateConfig.source?.projectRef;
      if (sourceProjectId != null) {
        try {
          const role: string = await this.projectService.onlineGetProjectRole(sourceProjectId);
          // Only show progress for the source project when the user has sync
          if (isParatextRole(role)) {
            this.sourceProjectDoc = await this.projectService.get(sourceProjectId);

            // Subscribe to SignalR notifications for the source project
            await this.projectNotificationService.subscribeToProject(this.sourceProjectDoc.id);
          }
        } catch (error) {
          this.sourceProjectDoc = undefined;
          this.errorReportingService.silentError(
            'Error while accessing source project',
            ErrorReportingService.normalizeError(error)
          );
        }
      } else {
        this.sourceProjectDoc = undefined;
      }
    }

    const checkSyncStatus$: Observable<OtJson0Op[]> =
      this.sourceProjectDoc == null
        ? this._projectDoc.remoteChanges$
        : merge(this._projectDoc.remoteChanges$, this.sourceProjectDoc.remoteChanges$);
    this.subscribe(checkSyncStatus$, () => this.checkSyncStatus());

    // Subscribe to SignalR notifications for the target project
    await this.projectNotificationService.subscribeToProject(this._projectDoc.id);
  }

  override async dispose(): Promise<void> {
    await this.projectNotificationService.stop();
    super.dispose();
  }

  public updateProgressState(projectId: string, progressState: ProgressState): void {
    const hasSourceProject = this.sourceProjectDoc?.data != null;
    this.syncPhase = progressState.syncPhase;
    this.syncProgress = Math.floor(progressState.syncProgress ?? 0);
    this.phasePercentage =
      progressState.syncProgress != null ? Math.round((progressState.syncProgress - this.syncProgress) * 100) : 0;
    if (projectId === this._projectDoc?.id) {
      this.activeSyncProjectName = this._projectDoc?.data?.name ?? '';
      this.progressPercent$.next(
        hasSourceProject ? 0.5 + progressState.progressValue * 0.5 : progressState.progressValue
      );
    } else if (hasSourceProject && projectId === this.sourceProjectDoc?.id) {
      this.activeSyncProjectName = this.sourceProjectDoc?.data?.name ?? '';
      this.progressPercent$.next(progressState.progressValue * 0.5);
    }
  }

  private checkSyncStatus(): void {
    if (this._projectDoc?.data == null) {
      return;
    }

    if (this._projectDoc.data.sync.queuedCount > 0) {
      this.inProgress.emit(true);
    } else {
      this.inProgress.emit(false);
    }
  }
}
