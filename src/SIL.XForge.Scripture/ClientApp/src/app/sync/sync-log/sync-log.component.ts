import { Component, DestroyRef, OnInit } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { TranslocoModule } from '@ngneat/transloco';
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  distinctUntilChanged,
  EMPTY,
  finalize,
  from,
  map,
  Observable,
  of,
  switchMap
} from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { CopyComponent } from 'xforge-common/copy/copy.component';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { SyncMetricsDisplay, SyncMetricsStatus } from './sync-metrics-display';

const statusIcons: Record<SyncMetricsStatus, string> = {
  [SyncMetricsStatus.Queued]: 'schedule',
  [SyncMetricsStatus.Running]: 'sync',
  [SyncMetricsStatus.Successful]: 'check_circle',
  [SyncMetricsStatus.Cancelled]: 'cancel',
  [SyncMetricsStatus.Failed]: 'error'
};

/** A sync history entry prepared for display. */
interface Row {
  syncMetrics: SyncMetricsDisplay;
  statusIcon: string;
  statusKey: string;
  /** The raw ISO timestamp of the sync. OwnerComponent localizes it for display. */
  dateTime: string;
  userRef?: string;
}

/**
 * Shows the sync history of the project on the sync page. Serval and system administrators can additionally expand
 * the error details of failed syncs. For now the log is only shown to serval and system administrators, but it may
 * be opened up to project members in the future.
 */
@Component({
  selector: 'app-sync-log',
  templateUrl: './sync-log.component.html',
  styleUrls: ['./sync-log.component.scss'],
  imports: [TranslocoModule, MatButton, MatIcon, OwnerComponent, CopyComponent]
})
export class SyncLogComponent extends DataLoadingComponent implements OnInit {
  static readonly INITIAL_PAGE_SIZE = 5;
  static readonly PAGE_INCREMENT = 10;

  rows: Row[] = [];
  totalCount = 0;

  /** The ids of sync metrics whose error details are expanded. */
  private expandedErrorIds = new Set<string>();

  // The number of entries to show. Always fetching the first page with a growing page size (rather than appending
  // subsequent pages) keeps the log correct when new syncs are queued between fetches.
  private limit$ = new BehaviorSubject<number>(SyncLogComponent.INITIAL_PAGE_SIZE);
  private syncMetrics?: SyncMetricsDisplay[];

  constructor(
    noticeService: NoticeService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly permissionsService: PermissionsService,
    private readonly projectService: SFProjectService,
    private destroyRef: DestroyRef
  ) {
    super(noticeService, 'SyncLogComponent');
  }

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  get isLoading(): boolean {
    return this.syncMetrics == null;
  }

  /** Whether the user can see the error details of failed syncs. */
  get canSeeErrorDetails(): boolean {
    return this.permissionsService.isServalAdmin || this.permissionsService.isSystemAdmin;
  }

  get canShowMore(): boolean {
    return this.rows.length < this.totalCount;
  }

  ngOnInit(): void {
    // Refetch the log when the number of queued syncs changes, so that newly queued and newly finished syncs appear
    // without the user reloading the page
    const queuedCount$: Observable<number> = this.activatedProjectService.changes$.pipe(
      map(projectDoc => projectDoc?.data?.sync?.queuedCount ?? 0),
      distinctUntilChanged()
    );
    combineLatest([
      this.activatedProjectService.projectId$.pipe(filterNullish()),
      this.limit$,
      queuedCount$,
      this.onlineStatusService.onlineStatus$
    ])
      .pipe(
        switchMap(([projectId, limit, _queuedCount, isOnline]) => {
          if (!isOnline) return EMPTY;
          this.loadingStarted();
          // A failed fetch keeps the current rows; the next queued sync or show more click will retry. Responses
          // superseded by a newer fetch are discarded by switchMap before reaching subscribe.
          return from(this.projectService.onlineSyncMetrics(projectId, 0, limit)).pipe(
            catchError(() => of(undefined)),
            finalize(() => this.loadingFinished())
          );
        }),
        filterNullish(),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(queryResults => {
        this.totalCount = queryResults.unpagedCount ?? 0;
        this.syncMetrics = Array.isArray(queryResults.results) ? queryResults.results : [];
        this.generateRows();
      });
  }

  showMore(): void {
    this.limit$.next(this.limit$.value + SyncLogComponent.PAGE_INCREMENT);
  }

  isErrorExpanded(syncMetricsId: string): boolean {
    return this.expandedErrorIds.has(syncMetricsId);
  }

  toggleErrorDetails(syncMetricsId: string): void {
    if (!this.expandedErrorIds.delete(syncMetricsId)) {
      this.expandedErrorIds.add(syncMetricsId);
    }
  }

  private generateRows(): void {
    const rows: Row[] = [];
    for (const syncMetrics of this.syncMetrics ?? []) {
      rows.push({
        syncMetrics,
        statusIcon: statusIcons[syncMetrics.status] ?? 'help',
        statusKey: `status_${syncMetrics.status.toLowerCase()}`,
        dateTime: syncMetrics.dateStarted ?? syncMetrics.dateQueued,
        userRef: syncMetrics.userRef
      });
    }
    this.rows = rows;
  }
}
