import { Component, DestroyRef, OnInit } from '@angular/core';
import { MatDialogConfig } from '@angular/material/dialog';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { BehaviorSubject, combineLatest, map, Observable, switchMap } from 'rxjs';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { SFProjectService } from '../core/sf-project.service';
import { EventMetric } from '../event-metrics/event-metric';
import { NoticeComponent } from '../shared/notice/notice.component';
import { projectLabel } from '../shared/utils';
import { JobEventsDialogComponent } from './job-events-dialog.component';
import { ServalAdministrationService } from './serval-administration.service';

/**
 * Draft jobs component for the serval administration page.
 * Shows draft jobs derived from event metrics across all projects for system administrators.
 */
interface DraftJob {
  projectId: string;
  startTime: Date;
  finishTime?: Date;
  duration?: number; // in milliseconds
  status: 'running' | 'success' | 'failed' | 'cancelled' | 'broken';
  userId?: string;
  startEvent: EventMetric;
  buildEvent?: EventMetric;
  finishEvent?: EventMetric;
  cancelEvent?: EventMetric;
  errorMessage?: string;
  trainingBooks: string[];
  translationBooks: string[];
  buildId?: string;
}

interface Row {
  job: DraftJob;
  projectId: string;
  projectName: string;
  projectDeleted: boolean;
  startTimeStamp: string;
  duration?: string;
  durationTooltip?: string;
  status: string;
  userId?: string;
  trainingBooks: string;
  translationBooks: string;
  trainingBooksTooltip?: string;
  translationBooksTooltip?: string;
  clearmlUrl?: string;
}

@Component({
  selector: 'app-draft-jobs',
  templateUrl: './draft-jobs.component.html',
  styleUrls: ['./draft-jobs.component.scss'],
  standalone: true,
  imports: [OwnerComponent, UICommonModule, RouterLink, NoticeComponent]
})
export class DraftJobsComponent extends DataLoadingComponent implements OnInit {
  columnsToDisplay: string[] = [
    'status',
    'projectId',
    'trainingBooks',
    'translationBooks',
    'startTime',
    'duration',
    'author',
    'buildId'
  ];
  rows: Row[] = [];

  private daysBack$ = new BehaviorSubject<number | 'all_time'>(7);
  currentProjectFilter: string | null = null;

  // Available day options for the dropdown
  dayOptions = [
    { value: 7, label: '7 days' },
    { value: 14, label: '14 days' },
    { value: 30, label: '30 days' }
  ];

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  get daysBack(): number | 'all_time' {
    return this.daysBack$.value;
  }

  set daysBack(value: number | 'all_time') {
    this.daysBack$.next(value);
  }

  private eventMetrics?: EventMetric[];
  private draftJobs: DraftJob[] = [];
  private projectNames = new Map<string, string | null>(); // Cache for project names
  filteredProjectName = '';

  constructor(
    noticeService: NoticeService,
    private readonly authService: AuthService,
    private readonly dialogService: DialogService,
    private readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    private readonly servalAdministrationService: ServalAdministrationService,
    private destroyRef: DestroyRef,
    private readonly route: ActivatedRoute
  ) {
    super(noticeService);
  }

  get isLoading(): boolean {
    return this.eventMetrics == null;
  }

  ngOnInit(): void {
    if (
      !this.columnsToDisplay.includes('details') &&
      (this.authService.currentUserRoles.includes(SystemRole.ServalAdmin) ||
        this.authService.currentUserRoles.includes(SystemRole.SystemAdmin))
    ) {
      this.columnsToDisplay.push('details');
    }
    this.loadingStarted();

    const projectFilterId$: Observable<string | null> = this.route.queryParams.pipe(map(params => params['projectId']));

    // Combine days filter with project filter from the service
    combineLatest([this.daysBack$, this.onlineStatusService.onlineStatus$, projectFilterId$])
      .pipe(
        switchMap(async ([daysBack, isOnline, projectFilterId]) => {
          this.loadingStarted();
          this.currentProjectFilter = projectFilterId;

          // Fetch project name if filtering by project
          this.filteredProjectName = projectFilterId ?? '';
          if (projectFilterId) {
            try {
              const projectDoc = await this.servalAdministrationService.get(projectFilterId);
              this.filteredProjectName = projectDoc?.data != null ? projectLabel(projectDoc.data) : projectFilterId;
            } catch (error) {
              // We can filter for a now-deleted project, so an error here is not unexpected and fully supported
              console.error('Error fetching project name:', error);
            }
          }

          if (isOnline) {
            const queryResults = await this.projectService.onlineAllEventMetrics(
              projectFilterId ?? undefined,
              daysBack === 'all_time' ? undefined : daysBack
            );
            if (Array.isArray(queryResults?.results)) {
              this.eventMetrics = queryResults.results as EventMetric[];
            } else {
              this.eventMetrics = [];
            }
            this.processDraftJobs();
            await this.loadProjectNames();
          }
          this.loadingFinished();
        }),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }

  openDetailsDialog(job: DraftJob): void {
    // Collect all events that were used to create this job
    const events = [
      job.startEvent,
      ...(job.buildEvent ? [job.buildEvent] : []),
      ...(job.finishEvent ? [job.finishEvent] : []),
      ...(job.cancelEvent ? [job.cancelEvent] : [])
    ].sort((a, b) => new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime());

    const dialogData = {
      projectId: job.projectId,
      jobStatus: this.getStatusDisplay(job.status),
      events
    };

    const dialogConfig: MatDialogConfig<any> = { data: dialogData, width: '800px', maxHeight: '80vh' };
    this.dialogService.openMatDialog(JobEventsDialogComponent, dialogConfig);
  }

  private processDraftJobs(): void {
    if (this.eventMetrics == null) {
      this.draftJobs = [];
      this.generateRows();
      return;
    }

    // Filter draft-related events
    const draftEvents = this.eventMetrics.filter(
      event =>
        event.eventType === 'StartPreTranslationBuildAsync' ||
        event.eventType === 'BuildProjectAsync' ||
        event.eventType === 'RetrievePreTranslationStatusAsync' ||
        event.eventType === 'CancelPreTranslationBuildAsync'
    );

    // Group events by project ID and create jobs
    const jobs: DraftJob[] = [];
    const startEvents = draftEvents
      .filter(e => e.eventType === 'StartPreTranslationBuildAsync')
      .sort((a, b) => new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime());

    for (let i = 0; i < startEvents.length; i++) {
      const startEvent = startEvents[i];
      if (startEvent.projectId == null) continue;

      const startTime = new Date(startEvent.timeStamp);

      // Find the next start event for this project to determine the boundary
      const nextStartEvent = startEvents.slice(i + 1).find(e => e.projectId === startEvent.projectId);
      const nextStartTime = nextStartEvent ? new Date(nextStartEvent.timeStamp) : null;

      // Get all events for this project between this start and the next start (if any)
      const projectEvents = draftEvents
        .filter(
          e =>
            e.projectId === startEvent.projectId &&
            new Date(e.timeStamp) >= startTime &&
            (nextStartTime == null || new Date(e.timeStamp) < nextStartTime)
        )
        .sort((a, b) => new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime());

      // Find specific event types within this job's timeframe
      const buildEvent = projectEvents.find(e => e.eventType === 'BuildProjectAsync');
      const finishEvent = projectEvents.find(e => e.eventType === 'RetrievePreTranslationStatusAsync');
      const cancelEvent = projectEvents.find(e => e.eventType === 'CancelPreTranslationBuildAsync');

      // Determine job status and timing
      let status: 'running' | 'success' | 'failed' | 'cancelled' | 'broken';
      let finishTime: Date | undefined;
      let duration: number | undefined;
      let errorMessage: string | undefined;

      // Extract training and translation books from the start event
      const { trainingBooks, translationBooks } = this.extractBooksFromEvent(startEvent);

      // Extract build ID from the build event result (if build event exists)
      const buildId = buildEvent?.result != null ? String(buildEvent.result) : undefined;

      if (startEvent.exception != null) {
        // Job failed at start
        status = 'failed';
        errorMessage = startEvent.exception;
        finishTime = startTime;
        duration = 0;
      } else if (cancelEvent != null) {
        // Job was cancelled
        status = 'cancelled';
        finishTime = new Date(cancelEvent.timeStamp);
        duration = finishTime.getTime() - startTime.getTime();
      } else if (buildEvent != null && buildEvent.exception != null) {
        // Job failed during build
        status = 'failed';
        errorMessage = buildEvent.exception;
        finishTime = new Date(buildEvent.timeStamp);
        duration = finishTime.getTime() - startTime.getTime();
      } else if (finishEvent != null) {
        // Job completed (successfully or with error)
        finishTime = new Date(finishEvent.timeStamp);
        duration = finishTime.getTime() - startTime.getTime();

        if (finishEvent.exception != null) {
          status = 'failed';
          errorMessage = finishEvent.exception;
        } else {
          status = 'success';
        }
      } else if (nextStartEvent != null) {
        // Another job started before this one was marked as finished - mark as broken
        status = 'broken';
        finishTime = new Date(nextStartEvent.timeStamp);
        duration = finishTime.getTime() - startTime.getTime();
        errorMessage = 'Job was interrupted by another start event without proper completion';
      } else {
        // Job is still running
        status = 'running';
      }

      jobs.push({
        projectId: startEvent.projectId,
        startTime,
        finishTime,
        duration,
        status,
        userId: startEvent.userId,
        startEvent,
        buildEvent,
        finishEvent,
        cancelEvent,
        errorMessage,
        trainingBooks,
        translationBooks,
        buildId
      });
    }

    // Sort by start time (most recent first)
    this.draftJobs = jobs.sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

    // Generate rows with fallback project names (just IDs for now)
    this.generateRows();
  }

  private generateRows(): void {
    const rows: Row[] = [];

    for (const job of this.draftJobs) {
      const projectName = this.projectNames.get(job.projectId);
      const projectDeleted = this.projectNames.get(job.projectId) === null;

      const clearmlUrl = job.buildId
        ? `https://app.sil.hosted.allegro.ai/projects?gq=${job.buildId}&tab=tasks`
        : undefined;

      const { displayText: trainingBooksDisplay, tooltipText: trainingBooksTooltip } = this.formatBooksWithTooltip(
        job.trainingBooks
      );
      const { displayText: translationBooksDisplay, tooltipText: translationBooksTooltip } =
        this.formatBooksWithTooltip(job.translationBooks);

      const duration = job.duration ? this.formatDuration(job.duration) : undefined;
      const durationTooltip = job.finishTime
        ? `Finished: ${this.i18n.formatDate(job.finishTime, { showTimeZone: true })}`
        : undefined;

      rows.push({
        job,
        projectId: job.projectId,
        projectName: projectDeleted ? `${job.projectId} [deleted]` : (projectName ?? job.projectId),
        projectDeleted,
        startTimeStamp: this.i18n.formatDate(job.startTime, { showTimeZone: true }),
        duration,
        durationTooltip,
        status: this.getStatusDisplay(job.status),
        userId: job.userId,
        trainingBooks: trainingBooksDisplay,
        translationBooks: translationBooksDisplay,
        trainingBooksTooltip,
        translationBooksTooltip,
        clearmlUrl
      });
    }
    this.rows = rows;
  }

  private formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  private getStatusDisplay(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  private async loadProjectNames(): Promise<void> {
    // Get unique project IDs from draft jobs
    const projectIds = [...new Set(this.draftJobs.map(job => job.projectId))];

    // Clear existing cache
    this.projectNames.clear();

    // Fetch project data for each unique project ID
    for (const projectId of projectIds) {
      const projectDoc = await this.servalAdministrationService.get(projectId);
      if (projectDoc?.data != null) {
        this.projectNames.set(projectId, projectLabel(projectDoc.data));
      } else {
        this.projectNames.set(projectId, null);
      }
    }

    // Regenerate rows with project names
    this.generateRows();
  }

  private extractBooksFromEvent(event: EventMetric): { trainingBooks: string[]; translationBooks: string[] } {
    const trainingBooks: string[] = [];
    const translationBooks: string[] = [];

    try {
      if (event.payload != null) {
        const buildConfig = event.payload.buildConfig;
        if (buildConfig != null) {
          // Extract training books
          if (Array.isArray(buildConfig.TrainingScriptureRanges)) {
            for (const range of buildConfig.TrainingScriptureRanges) {
              if (range.ScriptureRange != null) {
                // Split semicolon-separated books and add them to the array
                const books = range.ScriptureRange.split(';').filter((book: string) => book.trim().length > 0);
                trainingBooks.push(...books);
              }
            }
          }

          // Extract translation books
          if (Array.isArray(buildConfig.TranslationScriptureRanges)) {
            for (const range of buildConfig.TranslationScriptureRanges) {
              if (range.ScriptureRange != null) {
                // Split semicolon-separated books and add them to the array
                const books = range.ScriptureRange.split(';').filter((book: string) => book.trim().length > 0);
                translationBooks.push(...books);
              }
            }
          }
        }
      }
    } catch {
      // If there's an error parsing the data, return empty arrays
    }

    return { trainingBooks, translationBooks };
  }

  private formatBooksWithTooltip(books: string[]): { displayText: string; tooltipText?: string } {
    if (books.length === 0) {
      return { displayText: 'None' };
    }

    if (books.length <= 3) {
      const displayText = books.join(', ');
      return { displayText };
    } else {
      const displayText = books.slice(0, 3).join(', ') + '...';
      const tooltipText = books.join(', ');
      return { displayText, tooltipText };
    }
  }
}
