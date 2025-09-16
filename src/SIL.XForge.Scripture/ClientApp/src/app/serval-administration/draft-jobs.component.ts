import { Component, DestroyRef, OnInit } from '@angular/core';
import { MatDialogConfig } from '@angular/material/dialog';
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
    this.router.navigate([], {
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
        event.eventType === 'CancelPreTranslationBuildAsync'
    );

    // Step 1: Group events by build ID where available
    const jobsByBuildId = new Map<string, EventMetric[]>();
    const eventsWithoutBuildId: EventMetric[] = [];

    for (const event of draftEvents) {
      const buildId = this.extractBuildIdFromEvent(event);
      if (buildId != null) {
        if (!jobsByBuildId.has(buildId)) {
          jobsByBuildId.set(buildId, []);
        }
        jobsByBuildId.get(buildId)!.push(event);
      } else {
        eventsWithoutBuildId.push(event);
      }
    }

    // Step 2: Create jobs from events grouped by build ID
    const jobs: DraftJob[] = [];
    for (const [buildId, events] of jobsByBuildId) {
      const job = this.createJobFromEvents(events, buildId);
      if (job != null) {
        jobs.push(job);
      }
    }

    // Step 3: Match remaining events to existing jobs or create new jobs
    const remainingEvents = [...eventsWithoutBuildId];

    // Sort remaining events by timestamp for temporal matching
    remainingEvents.sort((a, b) => new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime());

    // Process StartPreTranslationBuildAsync events that don't have build IDs
    const unmatchedStartEvents = remainingEvents.filter(e => e.eventType === 'StartPreTranslationBuildAsync');

    for (const startEvent of unmatchedStartEvents) {
      if (startEvent.projectId == null) continue;

      // Try to find a matching job for this start event
      const matchingJob = this.findMatchingJobForStartEvent(startEvent, jobs);

      if (matchingJob != null) {
        // Update the matching job with this start event
        matchingJob.startEvent = startEvent;
        matchingJob.startTime = new Date(startEvent.timeStamp);
        matchingJob.userId = startEvent.userId;

        // Update books information from start event
        const { trainingBooks, translationBooks } = this.extractBooksFromEvent(startEvent);
        matchingJob.trainingBooks = trainingBooks;
        matchingJob.translationBooks = translationBooks;

        // Remove this event from remaining events
        const index = remainingEvents.indexOf(startEvent);
        if (index > -1) {
          remainingEvents.splice(index, 1);
        }
      } else {
        // Create a new job for this start event
        const newJob = this.createJobFromStartEvent(startEvent);
        if (newJob != null) {
          jobs.push(newJob);
          // Remove this event from remaining events
          const index = remainingEvents.indexOf(startEvent);
          if (index > -1) {
            remainingEvents.splice(index, 1);
          }
        }
      }
    }

    // Step 4: Try to match remaining events to existing jobs
    const unprocessedEvents: EventMetric[] = [];

    for (const event of remainingEvents) {
      const eventBuildId = this.extractBuildIdFromEvent(event);
      let eventWasProcessed = false;

      // If this event has a build ID but wasn't grouped earlier, it might be from a different job
      if (eventBuildId != null) {
        // Check if we already have a job with this build ID
        const existingJobWithBuildId = jobs.find(job => job.buildId === eventBuildId);
        if (existingJobWithBuildId != null) {
          this.addEventToJob(existingJobWithBuildId, event);
          eventWasProcessed = true;
        } else {
          // Create a new job for this orphaned event with build ID
          const newJob = this.createJobFromOrphanedEvent(event, eventBuildId);
          if (newJob != null) {
            jobs.push(newJob);
            eventWasProcessed = true;
          }
        }
      } else {
        // Event has no build ID, try temporal matching
        const matchingJob = this.findMatchingJobForEvent(event, jobs);
        if (matchingJob != null) {
          this.addEventToJob(matchingJob, event);
          eventWasProcessed = true;
        }
      }

      if (!eventWasProcessed) {
        unprocessedEvents.push(event);
      }
    }

    // Log any events that couldn't be processed
    if (unprocessedEvents.length > 0) {
      console.warn(`${unprocessedEvents.length} events could not be processed:`);
      for (const event of unprocessedEvents) {
        console.warn(
          `- ${event.eventType} (project: ${event.projectId}, time: ${event.timeStamp}, buildId: ${this.extractBuildIdFromEvent(event) || 'none'})`
        );
      }
    }

    // Step 5: Finalize job statuses and mark incomplete jobs as broken
    for (const job of jobs) {
      this.finalizeJobStatus(job);
    }

    // Sort by start time (most recent first)
    this.draftJobs = jobs.sort((a, b) => {
      const aTime = a.startTime?.getTime() ?? 0;
      const bTime = b.startTime?.getTime() ?? 0;
      return bTime - aTime;
    });

    // Generate rows with fallback project names (just IDs for now)
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

  private createJobFromEvents(events: EventMetric[], buildId: string): DraftJob | null {
    if (events.length === 0) return null;

    // Sort events by timestamp
    events.sort((a, b) => new Date(a.timeStamp).getTime() - new Date(b.timeStamp).getTime());

    const startEvent = events.find(e => e.eventType === 'StartPreTranslationBuildAsync');
    const buildEvent = events.find(e => e.eventType === 'BuildProjectAsync');
    const cancelEvent = events.find(e => e.eventType === 'CancelPreTranslationBuildAsync');

    // For finish events, take the latest one (they can occur multiple times)
    const finishEvents = events.filter(e => e.eventType === 'RetrievePreTranslationStatusAsync');
    const finishEvent = finishEvents.length > 0 ? finishEvents[finishEvents.length - 1] : undefined;

    // Determine project ID (prefer from start event, fallback to any event)
    const projectId = startEvent?.projectId ?? events.find(e => e.projectId != null)?.projectId;
    if (projectId == null) return null;

    // Determine start time and user
    const startTime = startEvent ? new Date(startEvent.timeStamp) : new Date(events[0].timeStamp);
    const userId = startEvent?.userId;

    // Extract books from start event if available
    const booksInfo = startEvent ? this.extractBooksFromEvent(startEvent) : { trainingBooks: [], translationBooks: [] };
    const { trainingBooks, translationBooks } = booksInfo;

    return {
      projectId,
      startTime,
      events: [],
      userId,
      startEvent: startEvent,
      buildEvent,
      finishEvent,
      cancelEvent,
      trainingBooks,
      translationBooks,
      buildId,
      status: 'running', // Will be finalized later
      errorMessage: undefined,
      finishTime: null,
      duration: null
    };
  }

  private findMatchingJobForStartEvent(startEvent: EventMetric, jobs: DraftJob[]): DraftJob | null {
    if (startEvent.projectId == null) return null;

    const startTime = new Date(startEvent.timeStamp);

    // Look for jobs in the same project that don't have a start event yet
    const candidateJobs = jobs.filter(job => job.projectId === startEvent.projectId && job.startEvent == null);

    if (candidateJobs.length === 0) return null;

    // Find the job with build event closest after this start event
    let bestMatch: DraftJob | null = null;
    let bestTimeDiff = Infinity;

    for (const job of candidateJobs) {
      if (job.buildEvent != null) {
        const buildTime = new Date(job.buildEvent.timeStamp);
        const timeDiff = buildTime.getTime() - startTime.getTime();

        // Build event should be after start event
        if (timeDiff > 0 && timeDiff < bestTimeDiff) {
          bestMatch = job;
          bestTimeDiff = timeDiff;
        }
      }
    }

    return bestMatch;
  }

  private createJobFromStartEvent(startEvent: EventMetric): DraftJob | null {
    if (startEvent.projectId == null) return null;

    const { trainingBooks, translationBooks } = this.extractBooksFromEvent(startEvent);

    return {
      projectId: startEvent.projectId,
      startTime: new Date(startEvent.timeStamp),
      events: [],
      userId: startEvent.userId,
      startEvent,
      buildEvent: undefined,
      finishEvent: undefined,
      cancelEvent: undefined,
      trainingBooks,
      translationBooks,
      buildId: null,
      status: 'running', // Will be finalized later
      errorMessage: undefined,
      finishTime: null,
      duration: null
    };
  }

  private createJobFromOrphanedEvent(event: EventMetric, buildId: string | null): DraftJob | null {
    if (event.projectId == null) return null;

    // Create a minimal job from this orphaned event
    const job: DraftJob = {
      projectId: event.projectId,
      startTime: new Date(event.timeStamp), // Use event time as fallback start time
      events: [],
      userId: event.userId,
      startEvent: undefined,
      buildEvent: undefined,
      finishEvent: undefined,
      cancelEvent: undefined,
      trainingBooks: [],
      translationBooks: [],
      buildId: buildId ?? null,
      status: 'running', // Will be finalized later
      errorMessage: undefined,
      finishTime: null,
      duration: null
    };

    // Add the event to the appropriate slot
    this.addEventToJob(job, event);

    return job;
  }

  private findMatchingJobForEvent(event: EventMetric, jobs: DraftJob[]): DraftJob | null {
    if (event.projectId == null) return null;

    const eventTime = new Date(event.timeStamp);
    const eventBuildId = this.extractBuildIdFromEvent(event);

    // Find jobs in the same project
    const projectJobs = jobs.filter(job => job.projectId === event.projectId);

    if (event.eventType === 'BuildProjectAsync') {
      // Find job with start event that most closely precedes this build event
      const candidateJobs = projectJobs.filter(
        job =>
          job.buildEvent == null &&
          job.startEvent != null &&
          new Date(job.startEvent.timeStamp) <= eventTime &&
          // Only match if build IDs are compatible (job has no build ID or they match)
          (job.buildId == null || eventBuildId == null || job.buildId === eventBuildId)
      );

      if (candidateJobs.length === 0) return null;

      return candidateJobs.reduce((closest, job) => {
        const currentDiff = eventTime.getTime() - new Date(job.startEvent!.timeStamp).getTime();
        const closestDiff = eventTime.getTime() - new Date(closest.startEvent!.timeStamp).getTime();
        return currentDiff < closestDiff ? job : closest;
      });
    }

    if (
      event.eventType === 'RetrievePreTranslationStatusAsync' ||
      event.eventType === 'CancelPreTranslationBuildAsync'
    ) {
      // Find job with build event that precedes this event
      const candidateJobs = projectJobs.filter(
        job =>
          job.buildEvent != null &&
          new Date(job.buildEvent.timeStamp) <= eventTime &&
          // Only match if build IDs are compatible
          (job.buildId == null || eventBuildId == null || job.buildId === eventBuildId)
      );

      if (candidateJobs.length === 0) return null;

      return candidateJobs.reduce((closest, job) => {
        const currentDiff = eventTime.getTime() - new Date(job.buildEvent!.timeStamp).getTime();
        const closestDiff = eventTime.getTime() - new Date(closest.buildEvent!.timeStamp).getTime();
        return currentDiff < closestDiff ? job : closest;
      });
    }

    return null;
  }

  private addEventToJob(job: DraftJob, event: EventMetric): void {
    // Check for build ID conflicts
    const eventBuildId = this.extractBuildIdFromEvent(event);
    if (eventBuildId != null && job.buildId != null && eventBuildId !== job.buildId) {
      // This event has a different build ID than the job - don't add it
      console.warn(
        `BUILD ID CONFLICT: Event ${event.eventType} with build ID ${eventBuildId} cannot be added to job with build ID ${job.buildId}. Project: ${event.projectId}, Event time: ${event.timeStamp}`
      );
      return;
    }

    if (event.eventType === 'BuildProjectAsync' && job.buildEvent == null) {
      job.buildEvent = event;
      // Update build ID if we get it from the build event
      if (event.result != null) {
        job.buildId = String(event.result);
      }
    } else if (event.eventType === 'RetrievePreTranslationStatusAsync') {
      // For finish events, take the latest one (but only if build ID matches or is null)
      if (job.finishEvent == null || new Date(event.timeStamp) > new Date(job.finishEvent.timeStamp)) {
        job.finishEvent = event;
      }
    } else if (event.eventType === 'CancelPreTranslationBuildAsync' && job.cancelEvent == null) {
      job.cancelEvent = event;
    }
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
