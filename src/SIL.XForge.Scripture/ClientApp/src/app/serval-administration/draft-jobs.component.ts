import { Component, DestroyRef, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatOptionModule } from '@angular/material/core';
import { MatDialogConfig } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { BehaviorSubject, combineLatest, map, Observable, switchMap } from 'rxjs';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
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
interface ProjectBooks {
  projectId: string;
  books: string[];
}

interface DraftJob {
  buildId: string | null;
  projectId: string;
  startEvent?: EventMetric; // Made optional since incomplete jobs might not have a start event
  buildEvent?: EventMetric;
  finishEvent?: EventMetric;
  cancelEvent?: EventMetric;
  events: EventMetric[];
  status: 'running' | 'success' | 'failed' | 'cancelled' | 'incomplete';
  startTime: Date | null;
  finishTime: Date | null;
  duration: number | null;
  errorMessage?: string;
  userId?: string;
  trainingBooks?: ProjectBooks[];
  translationBooks?: ProjectBooks[];
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
  trainingBooks: ProjectBooks[];
  translationBooks: ProjectBooks[];
  clearmlUrl?: string;
}

@Component({
  selector: 'app-draft-jobs',
  templateUrl: './draft-jobs.component.html',
  styleUrls: ['./draft-jobs.component.scss'],
  imports: [
    OwnerComponent,
    MatTooltipModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatOptionModule,
    MatIconModule,
    MatTableModule,
    RouterLink,
    NoticeComponent
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
  private projectShortNames = new Map<string, string | null>(); // Cache for project short names
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
    private readonly route: ActivatedRoute,
    private readonly router: Router
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
            const queryResults = await this.projectService.onlineAllEventMetricsForConstructionDraftJobs(
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
    const events = [job.startEvent, job.buildEvent, job.finishEvent, job.cancelEvent]
      .filter((event): event is EventMetric => event != null)
      .sort((a, b) => new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime());

    const dialogData = {
      projectId: job.projectId,
      jobStatus: this.getStatusDisplay(job.status),
      events
    };

    const dialogConfig: MatDialogConfig<any> = { data: dialogData, width: '800px', maxHeight: '80vh' };
    this.dialogService.openMatDialog(JobEventsDialogComponent, dialogConfig);
  }

  clearProjectFilter(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { projectId: null },
      queryParamsHandling: 'merge'
    });
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
        event.eventType === 'ExecuteWebhookAsync' ||
        event.eventType === 'CancelPreTranslationBuildAsync'
    );

    const jobs: DraftJob[] = [];

    // Step 1: Find all build events (BuildProjectAsync) - these are our anchors
    const buildEvents = draftEvents.filter(event => event.eventType === 'BuildProjectAsync');

    // Step 2: For each build event, find the nearest preceding start event
    for (const buildEvent of buildEvents) {
      if (buildEvent.projectId == null) continue;

      const buildId = this.extractBuildIdFromEvent(buildEvent);
      if (buildId == null) continue;

      const buildTime = new Date(buildEvent.timeStamp);

      // Find all StartPreTranslationBuildAsync events for this project that precede the build
      const candidateStartEvents = draftEvents.filter(
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
      const candidateCompletionEvents = draftEvents.filter(event => {
        if (event.projectId !== buildEvent.projectId) return false;
        if (new Date(event.timeStamp) <= buildTime) return false;

        // Check if it's a completion event type
        if (
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
        startTime: new Date(startEvent.timeStamp),
        userId: startEvent.userId,
        trainingBooks,
        translationBooks,
        status: 'running', // Will be finalized later
        errorMessage: undefined,
        finishTime: null,
        duration: null
      };

      // Assign the completion event to the appropriate field
      if (completionEvent != null) {
        if (completionEvent.eventType === 'CancelPreTranslationBuildAsync') {
          job.cancelEvent = completionEvent;
        } else {
          job.finishEvent = completionEvent;
        }
      }

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
    let finishTime: Date | null = null;
    let duration: number | null = null;
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
      duration = job.startTime ? finishTime.getTime() - job.startTime.getTime() : null;
    } else if (job.buildEvent?.exception != null) {
      status = 'failed';
      errorMessage = job.buildEvent.exception;
      finishTime = new Date(job.buildEvent.timeStamp);
      duration = job.startTime ? finishTime.getTime() - job.startTime.getTime() : null;
    } else if (job.finishEvent != null) {
      finishTime = new Date(job.finishEvent.timeStamp);
      duration = job.startTime ? finishTime.getTime() - job.startTime.getTime() : null;

      if (job.finishEvent.exception != null) {
        status = 'failed';
        errorMessage = job.finishEvent.exception;
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
    const rows: Row[] = [];

    for (const job of this.draftJobs) {
      const projectName = this.projectNames.get(job.projectId);
      const projectDeleted = this.projectNames.get(job.projectId) === null;

      const clearmlUrl = job.buildId
        ? `https://app.sil.hosted.allegro.ai/projects?gq=${job.buildId}&tab=tasks`
        : undefined;

      const duration = job.duration ? this.formatDuration(job.duration) : undefined;
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
        this.projectShortNames.set(projectId, projectDoc.data.shortName || null);
      } else {
        this.projectNames.set(projectId, null);
        this.projectShortNames.set(projectId, null);
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
}
