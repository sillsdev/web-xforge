import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ProgressBarMode } from '@angular/material/progress-bar';
import { OtJson0Op } from 'ot-json0';
import { isParatextRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { merge, Observable } from 'rxjs';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { ProjectNotificationService } from '../../core/project-notification.service';
import { SFProjectService } from '../../core/sf-project.service';

export class ProgressState {
  constructor(public progressValue: number, public progressString?: string) {}
}

@Component({
  selector: 'app-sync-progress',
  templateUrl: './sync-progress.component.html'
})
export class SyncProgressComponent extends SubscriptionDisposable {
  @Output() inProgress: EventEmitter<boolean> = new EventEmitter<boolean>();

  private sourceProjectDoc?: SFProjectDoc;
  private _projectDoc?: SFProjectDoc;
  private progressPercent: number = 0;

  constructor(
    private readonly projectService: SFProjectService,
    private readonly projectNotificationService: ProjectNotificationService
  ) {
    super();

    this.projectNotificationService.setNotifySyncProgressHandler((projectId: string, progressState: ProgressState) =>
      this.updateProgressState(projectId, progressState)
    );
  }

  @Input() set projectDoc(doc: SFProjectDoc | undefined) {
    if (doc == null) {
      return;
    }
    this._projectDoc = doc;
    this.initialize();
  }

  /** The progress as a percent between 0 and 100 for the target project and the source project, if one exists. */
  get syncProgressPercent(): number {
    return this.progressPercent * 100;
  }

  get mode(): ProgressBarMode {
    // Show indeterminate only at the beginning, as the sync has not yet started
    return this.syncProgressPercent > 0 ? 'determinate' : 'indeterminate';
  }

  async initialize(): Promise<void> {
    if (this._projectDoc?.data == null) {
      return;
    }
    await this.projectNotificationService.start();
    if (this._projectDoc?.data?.translateConfig.source != null) {
      const sourceProjectId: string | undefined = this._projectDoc.data.translateConfig.source?.projectRef;
      if (sourceProjectId != null) {
        const role: string = await this.projectService.onlineGetProjectRole(sourceProjectId);
        // Only show progress for the source project when the user has sync
        if (isParatextRole(role)) {
          this.sourceProjectDoc = await this.projectService.get(sourceProjectId);

          // Subscribe to SignalR notifications for the source project
          await this.projectNotificationService.subscribeToProject(this.sourceProjectDoc.id);
        } else {
          this.sourceProjectDoc = undefined;
        }
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

  public updateProgressState(projectId: string, progressState: ProgressState) {
    const hasSourceProject = this.sourceProjectDoc?.data != null;
    if (projectId === this._projectDoc?.id) {
      this.progressPercent = hasSourceProject ? 0.5 + progressState.progressValue * 0.5 : progressState.progressValue;
    } else if (hasSourceProject && projectId === this.sourceProjectDoc?.id) {
      this.progressPercent = progressState.progressValue * 0.5;
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
