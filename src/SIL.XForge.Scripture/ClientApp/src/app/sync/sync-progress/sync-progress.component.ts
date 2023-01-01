import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ProgressBarMode } from '@angular/material/progress-bar';
import { HubConnectionBuilder } from '@microsoft/signalr';
import { OtJson0Op } from 'ot-json0';
import { isParatextRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { merge, Observable } from 'rxjs';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectService } from '../../core/sf-project.service';

export interface ProgressState {
  progressValue: number;
  progressString: string;
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

  private connection = new HubConnectionBuilder().withUrl('/project-notifications').build();

  constructor(private readonly projectService: SFProjectService) {
    super();

    this.connection.on('notifySyncProgress', (projectId: string, progressState: ProgressState) => {
      if (this.sourceProjectDoc?.data == null) {
        // There is no source project, so only check the target
        if (this._projectDoc?.id == projectId) {
          this.progressPercent = progressState.progressValue;
        }
      } else {
        if (this.sourceProjectDoc.data.sync.queuedCount > 0 && this.sourceProjectDoc.id == projectId) {
          // We are syncing the source project
          this.progressPercent = progressState.progressValue * 0.5;
        } else if (this._projectDoc?.id == projectId) {
          // We are syncing the target project
          // The source project has synchronized so this is the midway point
          this.progressPercent = 0.5 + progressState.progressValue * 0.5;
        }
      }
    });
    this.connection.start();
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
    // Show indeterminate at the beginning and at the halfway point if a source project was synced
    const sourceSyncCompleted = this.sourceProjectDoc?.data != null && this.sourceProjectDoc.data.sync.queuedCount < 1;
    const isDeterminate = sourceSyncCompleted ? this.syncProgressPercent > 50 : this.syncProgressPercent > 0;
    return isDeterminate ? 'determinate' : 'indeterminate';
  }

  async initialize(): Promise<void> {
    if (this._projectDoc?.data == null) {
      return;
    }
    if (this._projectDoc?.data?.translateConfig.source != null) {
      const sourceProjectId: string | undefined = this._projectDoc.data.translateConfig.source?.projectRef;
      if (sourceProjectId != null) {
        const role: string = await this.projectService.onlineGetProjectRole(sourceProjectId);
        // Only show progress for the source project when the user has sync
        if (isParatextRole(role)) {
          this.sourceProjectDoc = await this.projectService.get(sourceProjectId);

          // Subscribe to SignalR notifications for the source project
          this.connection.send('subscribeToProject', this.sourceProjectDoc.id);
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
    this.connection.send('subscribeToProject', this._projectDoc.id);
  }

  override dispose(): void {
    this.connection.stop();
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
