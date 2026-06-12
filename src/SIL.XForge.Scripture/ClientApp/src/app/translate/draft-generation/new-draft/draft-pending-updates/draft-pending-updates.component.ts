import { Component, DestroyRef, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectDoc } from '../../../../core/models/sf-project-doc';
import { PermissionsService } from '../../../../core/permissions.service';
import { SFProjectService } from '../../../../core/sf-project.service';
import { isSFProjectSyncing } from '../../../../sync/sync.component';
import { SyncProgressComponent } from '../../../../sync/sync-progress/sync-progress.component';

/** How long the "All synced" state lingers before auto-advancing, so the transition isn't jarring. */
const AUTO_ADVANCE_DELAY_MS = 1500;

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
  /** Emits when the user leaves the pre-step, carrying the IDs of the projects that were synced in place (if any). */
  @Output() continue = new EventEmitter<string[]>();

  rows: PendingProjectRow[] = [];
  loading = true;

  private autoAdvanceTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly projectService: SFProjectService,
    private readonly permissionsService: PermissionsService,
    private readonly destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => {
      if (this.autoAdvanceTimeout != null) clearTimeout(this.autoAdvanceTimeout);
    });
  }

  async ngOnInit(): Promise<void> {
    // Load all the project docs concurrently, then build rows in the original order.
    const projectDocs = await Promise.all(this.pendingProjects.map(p => this.projectService.get(p.projectId)));
    for (const [i, { projectId, name }] of this.pendingProjects.entries()) {
      const projectDoc = projectDocs[i];
      const canSync = this.permissionsService.canSync(projectDoc);
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
    this.continue.emit(this.syncedProjectIds());
  }

  /** IDs of the projects that completed a sync during this pre-step (so the wizard can re-derive from fresh data). */
  private syncedProjectIds(): string[] {
    return this.rows.filter(r => r.syncState === 'synced').map(r => r.projectId);
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
    if (this.autoAdvanceTimeout != null || this.syncableRows.length === 0) return;
    const hasCannotSyncRow = this.rows.some(r => !r.canSync);
    const allSyncableSynced = this.syncableRows.every(r => r.syncState === 'synced');
    if (!hasCannotSyncRow && allSyncableSynced) {
      this.autoAdvanceTimeout = setTimeout(() => this.continue.emit(this.syncedProjectIds()), AUTO_ADVANCE_DELAY_MS);
    }
  }
}
