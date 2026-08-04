import { Component, DestroyRef, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
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
  /** Undefined when the doc failed to load; the row is then read-only (canSync false, sync state unobservable). */
  projectDoc?: SFProjectDoc;
  syncState: 'pending' | 'syncing' | 'synced' | 'failed';
  /** Latch tracking whether this project has been observed actively syncing, so completion is the high→low edge. */
  wasSyncing: boolean;
  /**
   * Whether the user kicked off this row's sync from the pre-step (vs. it already syncing on entry). A user-initiated
   * sync suppresses "Continue anyway" (they chose to wait); a pre-existing one does not (it may be stuck, and we must
   * not trap the user).
   */
  userInitiated: boolean;
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

  /** Whether everything is up to date and the auto-advance to the next step has been scheduled. */
  get autoAdvancing(): boolean {
    return this.autoAdvanceTimeout != null;
  }

  constructor(
    private readonly projectService: SFProjectService,
    private readonly permissionsService: PermissionsService,
    private readonly errorReportingService: ErrorReportingService,
    private readonly destroyRef: DestroyRef
  ) {
    this.destroyRef.onDestroy(() => {
      if (this.autoAdvanceTimeout != null) clearTimeout(this.autoAdvanceTimeout);
    });
  }

  async ngOnInit(): Promise<void> {
    // Load all the project docs concurrently, then build rows in the original order. Loading is best-effort,
    // matching the advisory nature of pending-update detection: a project whose doc fails to load still gets a row
    // (we know from the Paratext project list that it has updates), just one we can't sync or observe.
    const projectDocs = await Promise.all(
      this.pendingProjects.map(p =>
        this.projectService.get(p.projectId).catch(error => {
          this.errorReportingService.silentError(
            'Failed to load a project doc for the pending-updates pre-step',
            ErrorReportingService.normalizeError(error)
          );
          return undefined;
        })
      )
    );
    for (const [i, { projectId, name }] of this.pendingProjects.entries()) {
      const projectDoc = projectDocs[i];
      const canSync = projectDoc != null && this.permissionsService.canSync(projectDoc);
      const syncing = projectDoc?.data != null && isSFProjectSyncing(projectDoc.data);
      const row: PendingProjectRow = {
        projectId,
        name,
        canSync,
        projectDoc,
        syncState: syncing ? 'syncing' : 'pending',
        wasSyncing: syncing,
        userInitiated: false
      };
      this.rows.push(row);
      // Watch every row, not just ones the user syncs: a sync someone else starts (e.g. a project admin, possibly
      // at the user's request) must still update the row and unblock auto-advance when it brings the project up
      // to date.
      this.monitorSync(row);
    }
    this.loading = false;
  }

  get syncableRows(): PendingProjectRow[] {
    return this.rows.filter(r => r.canSync);
  }

  get syncedSyncableCount(): number {
    return this.syncableRows.filter(r => r.syncState === 'synced').length;
  }

  /** "Sync all" only makes sense with more than one syncable project, and only while any of them still needs it. */
  get showSyncAll(): boolean {
    return this.syncableRows.length > 1 && this.syncableRows.some(r => r.syncState === 'pending');
  }

  /** Whether to show the "n of m projects synced" summary. With a single project its own row says enough. */
  get showSyncCountMessage(): boolean {
    return this.syncableRows.length > 1 && this.syncableRows.some(r => r.syncState === 'syncing');
  }

  /**
   * Whether "Continue anyway" is the expected next action and should be the primary button: the user has done all
   * they can (no project left to sync or still syncing) but something still blocks an all-synced auto-advance
   * (a failed sync or a project they lack permission to sync).
   */
  get continueIsPrimary(): boolean {
    const hasBlockedRow = this.rows.some(r => !r.canSync && r.syncState !== 'synced');
    const hasFailedRow = this.rows.some(r => r.syncState === 'failed');
    // A running sync counts as actionable even on a row the user can't sync: waiting for it may unblock the
    // all-synced auto-advance, so don't steer the user toward continuing with incomplete data. A *pending*
    // cant-sync row does not count — the user can take no action on it.
    const hasActionableRow =
      this.syncableRows.some(r => r.syncState === 'pending') || this.rows.some(r => r.syncState === 'syncing');
    return (hasBlockedRow || hasFailedRow) && !hasActionableRow;
  }

  /**
   * Whether a sync the user started from this pre-step is still running. While true, "Continue anyway" is suppressed
   * so the user can't bail out of a sync they chose to start. It clears automatically once that sync reaches a
   * terminal state. A project that was already syncing on entry does not count, so a stuck project can't trap the user.
   */
  get userSyncInProgress(): boolean {
    return this.rows.some(r => r.userInitiated && r.syncState === 'syncing');
  }

  syncProject(row: PendingProjectRow): void {
    if (!row.canSync || row.syncState === 'syncing') return;
    row.userInitiated = true;
    row.syncState = 'syncing';
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
    if (row.projectDoc == null) return;
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
    if (this.autoAdvanceTimeout != null || this.rows.length === 0) return;
    // Every row must be synced, including ones the user cannot sync themselves: those only block while they remain
    // out of date, so someone else's sync bringing one up to date during this pre-step can complete the set.
    if (this.rows.every(r => r.syncState === 'synced')) {
      this.autoAdvanceTimeout = setTimeout(() => this.continue.emit(this.syncedProjectIds()), AUTO_ADVANCE_DELAY_MS);
    }
  }
}
