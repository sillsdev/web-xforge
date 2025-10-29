import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDialogConfig } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatRow,
  MatRowDef,
  MatTable
} from '@angular/material/table';
import { MatTooltip } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { BehaviorSubject, combineLatest, filter, map } from 'rxjs';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { notNull } from '../../type-utils';
import { SFProjectService } from '../core/sf-project.service';
import { EventMetric } from '../event-metrics/event-metric';
import { NoticeComponent } from '../shared/notice/notice.component';
import { projectLabel } from '../shared/utils';
import { DateRangePickerComponent, NormalizedDateRange } from './date-range-picker.component';
import { DraftJobsExportService } from './draft-jobs-export.service';
import { JobDetailsDialogComponent } from './job-details-dialog.component';
import { ServalAdministrationService } from './serval-administration.service';
interface ProjectBooks {
  projectId: string;
  books: string[];
}

/** Defines information about a Serval draft generation request. This is exported so it can be used in tests. */
export interface DraftJob {
  /** Serval build ID */
  buildId: string | undefined;
  projectId: string;
  /** This is optional since incomplete jobs might not have a start event */
  startEvent?: EventMetric;
  buildEvent?: EventMetric;
  finishEvent?: EventMetric;
  cancelEvent?: EventMetric;
  events: EventMetric[];
  /** Events with the same build ID that weren't included in the main job tracking */
  additionalEvents: EventMetric[];
  status: 'running' | 'success' | 'failed' | 'cancelled' | 'incomplete';
  startTime: Date | undefined;
  finishTime: Date | undefined;
  duration: number | undefined;
  errorMessage?: string;
  userId?: string;
  trainingBooks?: ProjectBooks[];
  translationBooks?: ProjectBooks[];
}

export interface DraftJobsTableRow {
  job: DraftJob;
  projectId: string;
  projectName: string;
  projectDeleted: boolean;
  startTimeStamp: string;
  duration?: string;
  durationTooltip?: string;
  status: string;
  userId?: string;
  trainingBooks: ProjectBooks[];
  translationBooks: ProjectBooks[];
  clearmlUrl?: string;
}

const DRAFTING_EVENTS = [
  'StartPreTranslationBuildAsync',
  'BuildProjectAsync',
  'RetrievePreTranslationStatusAsync',
  'ExecuteWebhookAsync',
  'BuildCompletedAsync',
  'CancelPreTranslationBuildAsync'
];

/**
 * Draft jobs component for the serval administration page.
 * Shows draft jobs derived from event metrics across all projects for Serval administrators.
 */
@Component({
  selector: 'app-draft-jobs',
  templateUrl: './draft-jobs.component.html',
  styleUrls: ['./draft-jobs.component.scss'],
  providers: [provideNativeDateAdapter()],
  imports: [
    MatButton,
    MatCell,
    MatCellDef,
    MatColumnDef,
    MatHeaderCell,
    MatHeaderCellDef,
    MatHeaderRow,
    MatHeaderRowDef,
    MatIcon,
    MatIconButton,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatRow,
    MatRowDef,
    MatTable,
    MatTooltip,
    NoticeComponent,
    OwnerComponent,
    RouterLink,
    DateRangePickerComponent
  ]
})
export class DraftJobsComponent extends DataLoadingComponent implements OnInit {
  columnsToDisplay: string[] = [
    'status',
    'projectId',
    'trainingBooks',
    'translationBooks',
    'startTime',
    'duration',
    'author'
  ];
  rows: DraftJobsTableRow[] = [];

  currentProjectFilter: string | null = null;

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  private draftEvents?: EventMetric[];
  private draftJobs: DraftJob[] = [];
  private projectNames = new Map<string, string | undefined>(); // Cache for project names
  private projectShortNames = new Map<string, string | undefined>(); // Cache for project short names
  filteredProjectName = '';
  private currentDateRange: NormalizedDateRange | undefined;
  private readonly dateRange$ = new BehaviorSubject<NormalizedDateRange | undefined>(undefined);

  constructor(
    noticeService: NoticeService,
    private readonly authService: AuthService,
    private readonly dialogService: DialogService,
    private readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    private readonly servalAdministrationService: ServalAdministrationService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly destroyRef: DestroyRef,
    private readonly exportService: DraftJobsExportService
  ) {
    super(noticeService);
  }

  get isLoading(): boolean {
    return this.draftEvents == null;
  }

  get meanDuration(): number | undefined {
    const durations = this.rows.map(r => r.job.duration).filter((d): d is number => d != null);
    if (durations.length === 0) {
      return undefined;
    }
    return durations.reduce((sum, d) => sum + d, 0) / durations.length;
  }

  get maxDuration(): number | undefined {
    const durations = this.rows.map(r => r.job.duration).filter((d): d is number => d != null);
    if (durations.length === 0) {
      return undefined;
    }
    return Math.max(...durations);
  }

  get meanDurationFormatted(): string | undefined {
    if (this.meanDuration == null) {
      return undefined;
    }
    return this.formatDurationInHours(this.meanDuration);
  }

  get maxDurationFormatted(): string | undefined {
    if (this.maxDuration == null) {
      return undefined;
    }
    return this.formatDurationInHours(this.maxDuration);
  }

  ngOnInit(): void {
    if (
      !this.columnsToDisplay.includes('buildDetails') &&
      (this.authService.currentUserRoles.includes(SystemRole.ServalAdmin) ||
        this.authService.currentUserRoles.includes(SystemRole.SystemAdmin))
    ) {
      this.columnsToDisplay.push('buildDetails');
    }
    combineLatest([
      this.route.queryParams.pipe(map(params => params['projectId'] || null)),
      this.onlineStatusService.onlineStatus$,
      this.dateRange$.pipe(filter(notNull))
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([projectFilterId, isOnline, range]) => {
        this.loadingStarted();
        void this.loadDraftJobs(range, isOnline, projectFilterId);
      });
  }

  /** Handle date range changes from the date range picker component */
  onDateRangeChange(range: NormalizedDateRange): void {
    this.currentDateRange = range;
    this.dateRange$.next(range);
  }

  openJobDetailsDialog(job: DraftJob): void {
    if (job.buildId == null) {
      void this.noticeService.show('No build ID available for this job');
      return;
    }

    // Format event-based duration if available
    const eventBasedDuration = job.duration != null ? this.formatDurationInHours(job.duration) : undefined;

    // Format start time if available
    const startTime = job.startTime != null ? this.i18n.formatDate(job.startTime, { showTimeZone: true }) : undefined;

    // Collect all events that were used to create this job
    const events = [job.startEvent, job.buildEvent, job.finishEvent, job.cancelEvent]
      .filter((event): event is EventMetric => event != null)
      .sort((a, b) => new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime());

    // Get ClearML URL
    const clearmlUrl = job.buildId
      ? `https://app.sil.hosted.allegro.ai/projects?gq=${job.buildId}&tab=tasks`
      : undefined;

    // Count how many builds have started on this project since this build started
    let buildsStartedSince = 0;
    if (job.startTime != null) {
      const jobStartTime = job.startTime;
      buildsStartedSince = this.draftJobs.filter(
        otherJob =>
          otherJob.projectId === job.projectId && otherJob.startTime != null && otherJob.startTime > jobStartTime
      ).length;
    }

    const dialogData = {
      buildId: job.buildId,
      projectId: job.projectId,
      jobStatus: this.getStatusDisplay(job.status),
      events,
      additionalEvents: job.additionalEvents,
      eventBasedDuration,
      startTime,
      clearmlUrl,
      buildsStartedSince
    };

    const dialogConfig: MatDialogConfig<any> = { data: dialogData, width: '1000px', maxHeight: '80vh' };
    this.dialogService.openMatDialog(JobDetailsDialogComponent, dialogConfig);
  }

  clearProjectFilter(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { projectId: null },
      queryParamsHandling: 'merge'
    });
  }

  private async loadDraftJobs(
    range: NormalizedDateRange,
    isOnline: boolean,
    projectFilterId: string | null
  ): Promise<void> {
    try {
      // Fetch project name if filtering by project
      let displayName = projectFilterId ?? '';
      if (projectFilterId != null) {
        try {
          const projectDoc = await this.servalAdministrationService.get(projectFilterId);
          displayName = projectDoc?.data != null ? projectLabel(projectDoc.data) : projectFilterId;
        } catch (error) {
          // We can filter for a now-deleted project, so an error here is not unexpected and fully supported
          console.error('Error fetching project name:', error);
        }
      }

      this.currentProjectFilter = projectFilterId;
      this.filteredProjectName = displayName;

      if (!isOnline) {
        return;
      }

      const queryResults = await this.projectService.onlineAllEventMetricsForConstructingDraftJobs(
        DRAFTING_EVENTS,
        projectFilterId ?? undefined,
        range.start,
        range.end
      );

      if (Array.isArray(queryResults?.results)) {
        this.draftEvents = queryResults.results as EventMetric[];
      } else {
        this.draftEvents = [];
      }

      this.processDraftJobs();
      await this.loadProjectNames();
    } finally {
      this.loadingFinished();
    }
  }

  private processDraftJobs(): void {
    if (this.draftEvents == null) {
      this.draftJobs = [];
      this.generateRows();
      return;
    }

    const jobs: DraftJob[] = [];

    // Step 1: Find all build events (BuildProjectAsync) - these are our anchors
    const buildEvents = this.draftEvents.filter(event => event.eventType === 'BuildProjectAsync');

    // Step 2: For each build event, find the nearest preceding start event
    for (const buildEvent of buildEvents) {
      if (buildEvent.projectId == null) continue;

      const buildId = this.extractBuildIdFromEvent(buildEvent);
      if (buildId == null) continue;

      const buildTime = new Date(buildEvent.timeStamp);

      // Find all StartPreTranslationBuildAsync events for this project that precede the build
      const candidateStartEvents = this.draftEvents.filter(
        event =>
          event.eventType === 'StartPreTranslationBuildAsync' &&
          event.projectId === buildEvent.projectId &&
          new Date(event.timeStamp) < buildTime
      );

      // If no start event found, skip this build (not started in our time window)
      if (candidateStartEvents.length === 0) continue;

      // Find the chronologically nearest start event (the one closest before the build)
      const startEvent = candidateStartEvents.reduce((nearest, current) => {
        const currentTime = new Date(current.timeStamp);
        const nearestTime = new Date(nearest.timeStamp);
        return currentTime > nearestTime ? current : nearest;
      });

      // Step 3: Find the first completion event after the build
      const candidateCompletionEvents = this.draftEvents.filter(event => {
        if (event.projectId !== buildEvent.projectId && event.payload.sfProjectId !== buildEvent.projectId)
          return false;
        if (new Date(event.timeStamp) <= buildTime) return false;

        // Check if it's a completion event type
        if (
          event.eventType === 'BuildCompletedAsync' ||
          event.eventType === 'RetrievePreTranslationStatusAsync' ||
          event.eventType === 'ExecuteWebhookAsync' ||
          event.eventType === 'CancelPreTranslationBuildAsync'
        ) {
          // For cancel events, we don't check build ID (they don't have one)
          if (event.eventType === 'CancelPreTranslationBuildAsync') {
            return true;
          }
          // For other completion events, verify build ID matches
          const completionBuildId = this.extractBuildIdFromEvent(event);
          return completionBuildId === buildId;
        }

        return false;
      });

      // Find the chronologically first completion event (nearest after the build)
      let completionEvent: EventMetric | undefined;
      if (candidateCompletionEvents.length > 0) {
        completionEvent = candidateCompletionEvents.reduce((earliest, current) => {
          const currentTime = new Date(current.timeStamp);
          const earliestTime = new Date(earliest.timeStamp);
          return currentTime < earliestTime ? current : earliest;
        });
      }

      // Create the job from these events
      const { trainingBooks, translationBooks } = this.extractBooksFromEvent(startEvent);

      const job: DraftJob = {
        projectId: buildEvent.projectId,
        buildId,
        startEvent,
        buildEvent,
        finishEvent: undefined,
        cancelEvent: undefined,
        events: [],
        additionalEvents: [],
        startTime: new Date(startEvent.timeStamp),
        userId: startEvent.userId,
        trainingBooks,
        translationBooks,
        status: 'running', // Will be finalized later
        errorMessage: undefined,
        finishTime: undefined,
        duration: undefined
      };

      // Assign the completion event to the appropriate field
      if (completionEvent != null) {
        if (completionEvent.eventType === 'CancelPreTranslationBuildAsync') {
          job.cancelEvent = completionEvent;
        } else {
          job.finishEvent = completionEvent;
        }
      }

      // Step 4: Collect additional events (any events with same build ID that weren't already included)
      const additionalEvents = this.draftEvents.filter(event => {
        // Don't include events we've already tracked
        if (event === startEvent || event === buildEvent || event === completionEvent) {
          return false;
        }

        // Check if this event has the same build ID
        const eventBuildId = this.extractBuildIdFromEvent(event);
        return eventBuildId === buildId;
      });

      job.additionalEvents = additionalEvents.sort(
        (a, b) => new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime()
      );

      jobs.push(job);
    }

    // Finalize job statuses
    for (const job of jobs) {
      this.finalizeJobStatus(job);
    }

    // Sort by start time (most recent first)
    this.draftJobs = jobs.sort((a, b) => {
      const aTime = a.startTime?.getTime() ?? 0;
      const bTime = b.startTime?.getTime() ?? 0;
      return bTime - aTime;
    });

    // Generate rows
    this.generateRows();
  }

  private extractBuildIdFromEvent(event: EventMetric): string | null {
    // First try the result field (common for many event types)
    if (event.result != null) {
      return String(event.result);
    }

    // Then try the payload buildId field (alternative location)
    if (event.payload?.buildId != null) {
      return String(event.payload.buildId);
    }

    return null;
  }

  private finalizeJobStatus(job: DraftJob): void {
    let status: 'running' | 'success' | 'failed' | 'cancelled' | 'incomplete';
    let finishTime: Date | undefined = undefined;
    let duration: number | undefined = undefined;
    let errorMessage: string | undefined;

    // Check for early failures or cancellations
    if (job.startEvent?.exception != null) {
      status = 'failed';
      errorMessage = job.startEvent.exception;
      finishTime = job.startTime;
      duration = 0;
    } else if (job.cancelEvent != null) {
      status = 'cancelled';
      finishTime = new Date(job.cancelEvent.timeStamp);
      duration = job.startTime ? finishTime.getTime() - job.startTime.getTime() : undefined;
    } else if (job.buildEvent?.exception != null) {
      status = 'failed';
      errorMessage = job.buildEvent.exception;
      finishTime = new Date(job.buildEvent.timeStamp);
      duration = job.startTime ? finishTime.getTime() - job.startTime.getTime() : undefined;
    } else if (job.finishEvent != null) {
      finishTime = new Date(job.finishEvent.timeStamp);
      duration = job.startTime ? finishTime.getTime() - job.startTime.getTime() : undefined;

      if (job.finishEvent.exception != null) {
        status = 'failed';
        errorMessage = job.finishEvent.exception;
      } else if (job.finishEvent.payload?.buildState === 'Faulted') {
        // We might expect the buildState to match BuildStates.Faulted, but the EventMetric object uses TitleCase rather
        // than the all caps of BuildStates.
        status = 'failed';
      } else {
        status = 'success';
      }
    } else {
      // Job doesn't have a clear completion - check if it's incomplete or still running
      if (job.startEvent == null || job.buildEvent == null) {
        status = 'incomplete';
        errorMessage = 'Job has incomplete event correlation';
      } else {
        status = 'running';
      }
    }

    job.status = status;
    job.finishTime = finishTime;
    job.duration = duration;
    job.errorMessage = errorMessage;
  }

  private generateRows(): void {
    const rows: DraftJobsTableRow[] = [];

    for (const job of this.draftJobs) {
      const projectName = this.projectNames.get(job.projectId);
      const projectDeleted = this.projectNames.get(job.projectId) === null;

      const clearmlUrl = job.buildId
        ? `https://app.sil.hosted.allegro.ai/projects?gq=${job.buildId}&tab=tasks`
        : undefined;

      const duration = job.duration ? this.formatDurationInHours(job.duration) : undefined;
      const durationTooltip = job.finishTime
        ? `Finished: ${this.i18n.formatDate(job.finishTime, { showTimeZone: true })}`
        : undefined;

      rows.push({
        job,
        projectId: job.projectId,
        projectName: projectDeleted ? `${job.projectId} [deleted]` : (projectName ?? job.projectId),
        projectDeleted,
        startTimeStamp: job.startTime ? this.i18n.formatDate(job.startTime, { showTimeZone: true }) : 'N/A',
        duration,
        durationTooltip,
        status: this.getStatusDisplay(job.status),
        userId: job.userId,
        trainingBooks: job.trainingBooks || [],
        translationBooks: job.translationBooks || [],
        clearmlUrl
      });
    }

    this.rows = rows;
  }

  private formatDurationInHours(milliseconds: number): string {
    return `${(milliseconds / 3600000).toFixed(1)} h`;
  }

  private getStatusDisplay(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }

  private async loadProjectNames(): Promise<void> {
    // Get unique project IDs from draft jobs
    const projectIds = new Set(this.draftJobs.map(job => job.projectId));
    // Also collect project IDs from training and translation book ranges
    for (const job of this.draftJobs) {
      if (job.trainingBooks) {
        for (const projectBook of job.trainingBooks) {
          projectIds.add(projectBook.projectId);
        }
      }
      if (job.translationBooks) {
        for (const projectBook of job.translationBooks) {
          projectIds.add(projectBook.projectId);
        }
      }
    }
    // Clear existing caches
    this.projectNames.clear();
    this.projectShortNames.clear();
    // Fetch project data for each unique project ID
    for (const projectId of projectIds) {
      const projectDoc = await this.servalAdministrationService.get(projectId);
      if (projectDoc?.data != null) {
        this.projectNames.set(projectId, projectLabel(projectDoc.data));
        this.projectShortNames.set(projectId, projectDoc.data.shortName || undefined);
      } else {
        this.projectNames.set(projectId, undefined);
        this.projectShortNames.set(projectId, undefined);
      }
    }
    // Regenerate rows with project names
    this.generateRows();
  }

  private extractBooksFromEvent(event: EventMetric): {
    trainingBooks: ProjectBooks[];
    translationBooks: ProjectBooks[];
  } {
    const trainingProjects = new Map<string, string[]>();
    const translationProjects = new Map<string, string[]>();

    try {
      if (event.payload != null) {
        const buildConfig = event.payload.buildConfig;
        if (buildConfig != null) {
          // Extract training books
          if (Array.isArray(buildConfig.TrainingScriptureRanges)) {
            for (const range of buildConfig.TrainingScriptureRanges) {
              if (range.ScriptureRange != null) {
                // Use the project ID from the range if available, otherwise use the event's project ID
                const projectId = range.ProjectId || event.projectId;
                if (projectId) {
                  // Split semicolon-separated books and add them to the project's books
                  const books = range.ScriptureRange.split(';').filter((book: string) => book.trim().length > 0);
                  if (!trainingProjects.has(projectId)) {
                    trainingProjects.set(projectId, []);
                  }
                  trainingProjects.get(projectId)!.push(...books);
                }
              }
            }
          }

          // Extract translation books
          if (Array.isArray(buildConfig.TranslationScriptureRanges)) {
            for (const range of buildConfig.TranslationScriptureRanges) {
              if (range.ScriptureRange != null) {
                // Use the project ID from the range if available, otherwise use the event's project ID
                const projectId = range.ProjectId || event.projectId;
                if (projectId) {
                  // Split semicolon-separated books and add them to the project's books
                  const books = range.ScriptureRange.split(';').filter((book: string) => book.trim().length > 0);
                  if (!translationProjects.has(projectId)) {
                    translationProjects.set(projectId, []);
                  }
                  translationProjects.get(projectId)!.push(...books);
                }
              }
            }
          }
        }
      }
    } catch {
      // If there's an error parsing the data, return empty arrays
    }

    // Convert maps to ProjectBooks arrays
    const trainingBooks: ProjectBooks[] = Array.from(trainingProjects.entries()).map(([projectId, books]) => ({
      projectId,
      books
    }));

    const translationBooks: ProjectBooks[] = Array.from(translationProjects.entries()).map(([projectId, books]) => ({
      projectId,
      books
    }));

    return { trainingBooks, translationBooks };
  }

  getProjectShortName(projectId: string): string {
    return this.projectShortNames.get(projectId) || this.projectNames.get(projectId) || projectId;
  }

  /**
   * Export the current draft jobs data to a CSV file.
   */
  exportCsv(): void {
    if (this.currentDateRange == null) throw new Error('Date range is not set');
    this.exportService.exportCsv(this.rows, this.currentDateRange, this.meanDuration ?? 0, this.maxDuration ?? 0);
  }

  /**
   * Export the current draft jobs data to an RSV (Rows of String Values) file.
   */
  exportRsv(): void {
    if (this.currentDateRange == null) throw new Error('Date range is not set');
    this.exportService.exportRsv(this.rows, this.currentDateRange, this.meanDuration ?? 0, this.maxDuration ?? 0);
  }
}
