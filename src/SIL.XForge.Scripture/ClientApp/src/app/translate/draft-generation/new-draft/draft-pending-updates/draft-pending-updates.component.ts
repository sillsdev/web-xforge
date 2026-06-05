import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { UserService } from 'xforge-common/user.service';
import { SFProjectDoc } from '../../../../core/models/sf-project-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { SyncProgressComponent } from '../../../../sync/sync-progress/sync-progress.component';

interface PendingProjectRow {
  projectId: string;
  name: string;
  canSync: boolean;
  projectDoc?: SFProjectDoc;
  syncState: 'pending' | 'syncing' | 'synced' | 'failed';
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
    private readonly userService: UserService
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
      const alreadySyncing = (projectDoc.data?.sync.queuedCount ?? 0) > 0;
      this.rows.push({
        projectId,
        name,
        canSync,
        projectDoc,
        syncState: alreadySyncing ? 'syncing' : 'pending'
      });
    }
    this.loading = false;
  }

  get syncableRows(): PendingProjectRow[] {
    return this.rows.filter(r => r.canSync);
  }

  syncProject(row: PendingProjectRow): void {
    if (!row.canSync || row.syncState === 'syncing') return;
    row.syncState = 'syncing';
    this.projectService.onlineSync(row.projectId).catch(() => {
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

  onSyncProgressChanged(row: PendingProjectRow, inProgress: boolean): void {
    if (inProgress) return;
    row.syncState = row.projectDoc?.data?.sync.lastSyncSuccessful === true ? 'synced' : 'failed';
    this.checkAutoAdvance();
  }

  continueAnyway(): void {
    this.continue.emit();
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
