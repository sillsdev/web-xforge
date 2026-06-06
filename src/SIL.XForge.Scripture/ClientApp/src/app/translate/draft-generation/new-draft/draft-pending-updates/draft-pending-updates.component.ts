import { Component, DestroyRef, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { UserService } from 'xforge-common/user.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectDoc } from '../../../../core/models/sf-project-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { isSFProjectSyncing } from '../../../../sync/sync.component';
import { SyncProgressComponent } from '../../../../sync/sync-progress/sync-progress.component';

interface PendingProjectRow {
  projectId: string;
  name: string;
  canSync: boolean;
  projectDoc?: SFProjectDoc;
  syncState: 'pending' | 'syncing' | 'synced' | 'failed';
  /** Latch tracking whether this project has been observed actively syncing, so completion is the high→low edge. */
  wasSyncing: boolean;
  /** Whether a remoteChanges$ subscription is already watching this row's sync state. */
  monitoring: boolean;
}

@Component({
  selector: 'app-draft-pending-updates',
  templateUrl: './draft-pending-updates.component.html',
  styleUrls: ['./draft-pending-updates.component.scss'],
  imports: [MatButtonModule, MatIconModule, MatProgressSpinner, SyncProgressComponent, TranslocoModule]
})
export class DraftPendingUpdatesComponent implements OnInit {
  @Input() pendingProjects: { projectId: string; name: string }[] = [];
  @Output() continue = new EventEmitter<void>();

  rows: PendingProjectRow[] = [];
  loading = true;

  constructor(
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly destroyRef: DestroyRef
  ) {}

  async ngOnInit(): Promise<void> {
    for (const { projectId, name } of this.pendingProjects) {
      const projectDoc = await this.projectService.get(projectId);
      const canSync =
        projectDoc.data != null &&
        SF_PROJECT_RIGHTS.hasRight(
          projectDoc.data,
          this.userService.currentUserId,
          SFProjectDomain.Texts,
          Operation.Edit
        );
      const syncing = projectDoc.data != null && isSFProjectSyncing(projectDoc.data);
      const row: PendingProjectRow = {
        projectId,
        name,
        canSync,
        projectDoc,
        syncState: syncing ? 'syncing' : 'pending',
        wasSyncing: syncing,
        monitoring: false
      };
      this.rows.push(row);
      // A project already syncing when the wizard opens still needs its completion observed.
      if (syncing) this.monitorSync(row);
    }
    this.loading = false;
  }

  get syncableRows(): PendingProjectRow[] {
    return this.rows.filter(r => r.canSync);
  }

  syncProject(row: PendingProjectRow): void {
    if (!row.canSync || row.syncState === 'syncing') return;
    row.syncState = 'syncing';
    // Subscribe before the network round-trip so the queuedCount transition can't be missed.
    this.monitorSync(row);
    this.projectService.onlineSync(row.projectId).catch(() => {
      // Failure to even enqueue the sync (e.g. RPC/network error).
      row.syncState = 'failed';
    });
  }

  retrySyncProject(row: PendingProjectRow): void {
    row.syncState = 'pending';
    this.syncProject(row);
  }

  syncAll(): void {
    for (const row of this.syncableRows) {
      if (row.syncState === 'pending') this.syncProject(row);
    }
  }

  continueAnyway(): void {
    this.continue.emit();
  }

  /** Watches a row's project doc for the sync to complete (queuedCount returning to 0). */
  private monitorSync(row: PendingProjectRow): void {
    if (row.monitoring || row.projectDoc == null) return;
    row.monitoring = true;
    row.projectDoc.remoteChanges$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.checkSyncStatus(row));
    // Resolve immediately in case the sync already finished during the get()/subscribe gap.
    this.checkSyncStatus(row);
  }

  private checkSyncStatus(row: PendingProjectRow): void {
    const data = row.projectDoc?.data;
    if (data == null) return;
    if (isSFProjectSyncing(data)) {
      row.wasSyncing = true;
      row.syncState = 'syncing';
    } else if (row.wasSyncing) {
      // High→low edge of queuedCount: the sync that we observed running has now completed.
      row.wasSyncing = false;
      row.syncState = data.sync.lastSyncSuccessful === true ? 'synced' : 'failed';
      this.checkAutoAdvance();
    }
  }

  private checkAutoAdvance(): void {
    if (this.syncableRows.length === 0) return;
    const hasCannotSyncRow = this.rows.some(r => !r.canSync);
    const allSyncableSynced = this.syncableRows.every(r => r.syncState === 'synced');
    if (!hasCannotSyncRow && allSyncableSynced) {
      setTimeout(() => this.continue.emit(), 1500);
    }
  }
}
