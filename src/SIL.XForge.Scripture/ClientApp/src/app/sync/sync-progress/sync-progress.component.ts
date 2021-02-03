import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ProgressBarMode } from '@angular/material/progress-bar';
import { OtJson0Op } from 'ot-json0';
import { hasParatextRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { merge, Observable } from 'rxjs';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectService } from '../../core/sf-project.service';

@Component({
  selector: 'app-sync-progress',
  templateUrl: './sync-progress.component.html'
})
export class SyncProgressComponent extends SubscriptionDisposable implements OnInit {
  @Input() projectDoc?: SFProjectDoc;
  @Output() inProgress: EventEmitter<boolean> = new EventEmitter<boolean>();

  private sourceProjectDoc?: SFProjectDoc;

  constructor(private readonly projectService: SFProjectService) {
    super();
  }

  /** The progress as a percent between 0 and 100 for the target project and the source project, if one exists. */
  get syncProgressPercent(): number | undefined {
    if (this.sourceProjectDoc?.data == null) {
      return (this.projectDoc?.data?.sync.percentCompleted || 0) * 100;
    }
    let progress: number = 0;
    if (this.sourceProjectDoc.data.sync.queuedCount > 0) {
      progress += (this.sourceProjectDoc.data.sync.percentCompleted || 0) * 0.5;
    } else {
      // The source project has synchronized so this is the midway point
      progress = 0.5;
    }
    progress += (this.projectDoc?.data?.sync.percentCompleted || 0) * 0.5;
    return progress * 100;
  }

  get mode(): ProgressBarMode {
    // Show indeterminate at the beginning and at the halfway point if a source project was synced
    const sourceSyncCompleted = this.sourceProjectDoc?.data != null && this.sourceProjectDoc.data.sync.queuedCount < 1;
    const determinate =
      this.syncProgressPercent != null &&
      (sourceSyncCompleted ? this.syncProgressPercent > 50 : this.syncProgressPercent > 0);
    return determinate ? 'determinate' : 'indeterminate';
  }

  async ngOnInit(): Promise<void> {
    if (this.projectDoc?.data == null) {
      return;
    }
    if (this.projectDoc?.data?.translateConfig.translationSuggestionsEnabled) {
      const sourceProjectId: string | undefined = this.projectDoc.data.translateConfig.source?.projectRef;
      if (sourceProjectId != null) {
        const role: string = await this.projectService.onlineGetProjectRole(sourceProjectId);
        // Only show progress for the source project when the user has sync permission
        this.sourceProjectDoc = hasParatextRole(role) ? await this.projectService.get(sourceProjectId) : undefined;
      }
    }

    const checkSyncStatus$: Observable<OtJson0Op[]> =
      this.sourceProjectDoc == null
        ? this.projectDoc.remoteChanges$
        : merge(this.projectDoc.remoteChanges$, this.sourceProjectDoc.remoteChanges$);
    this.subscribe(checkSyncStatus$, () => this.checkSyncStatus());
  }

  private checkSyncStatus(): void {
    if (this.projectDoc?.data == null) {
      return;
    }

    if (this.projectDoc.data.sync.queuedCount > 0) {
      this.inProgress.emit(true);
    } else {
      this.inProgress.emit(false);
    }
  }
}
