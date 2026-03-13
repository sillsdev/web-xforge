import { AsyncPipe } from '@angular/common';
import { Component, DestroyRef, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle, MatCardTitleGroup } from '@angular/material/card';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatSlideToggle } from '@angular/material/slide-toggle';
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
import { BehaviorSubject, catchError, combineLatest, filter, firstValueFrom, from, map, Observable, of } from 'rxjs';
import { CopyComponent } from 'xforge-common/copy/copy.component';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UserProfileDoc } from 'xforge-common/models/user-profile-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { UserService } from 'xforge-common/user.service';
import { notNull } from '../../type-utils';
import { InfoComponent } from '../shared/info/info.component';
import { DraftGenerationService } from '../translate/draft-generation/draft-generation.service';
import { DateRangePickerComponent, NormalizedDateRange } from './date-range-picker.component';
import { DraftJobsExportService, SpreadsheetRow } from './draft-jobs-export.service';
import { JobDetailsDialogComponent } from './job-details-dialog.component';
import {
  buildProjectDisplayName,
  DraftGenerationBuildStatus,
  Phase,
  ProjectBooks,
  ServalBuildReportDto,
  toProjectBooks
} from './serval-build-report';
import { buildSummary } from './serval-builds-statistics';

/** Represents a row of Serval build data in the builds table. */
export interface ServalBuildRow {
  report: ServalBuildReportDto;
  trainingBooks: ProjectBooks[];
  translationBooks: ProjectBooks[];
  projectNameDisplay?: string;
  durationMs?: number;
  projectServalAdminUrl?: string;
  /** True if the build is not associable with any SF project currently in the database. */
  projectDeleted: boolean;
}

/** Aggregated statistics for the currently visible Serval build rows. */
export interface ServalBuildSummary {
  totalBuilds: number;
  totalProjects: number;
  buildsPerProjectRatio?: number;
  averageInterBuildTimeMs?: number;
  totalRequesters: number;
  averageRequestersPerProject?: number;
  faultedBuilds: number;
  averageTrainingBooksPerBuild?: number;
  averageTranslationBooksPerBuild?: number;
  completedBuilds: number;
  inProgressBuilds: number;
  buildsWithProblems: number;
  /** Builds which were excluded from statistics because they were not associable with a project. */
  unconsideredBuilds: number;
  meanDurationMs?: number;
  maxDurationMs?: number;
  /** Percentage of time that successful builds spent in SF rather than in Serval. */
  percentTimeOnSF?: number;
  /**
   * Number of builds that we had SF event metrics for, but we did not have Serval information for.
   * This assumes that every build with events will have a StartPreTranslationBuildAsync event.
   */
  buildsServalDidNotKnowAbout: number;
  /** Number of builds that we had Serval information for, but we did not have any SF event metrics for. */
  buildsSfDidNotKnowAbout: number;
}

/** Presentation details for a summary item displayed above the builds table. */
interface SummaryDisplayItem {
  label: string;
  explanation?: string;
  value: string;
  /** Preference to show this item without clicking to expand the view. */
  prominence: 'top' | 'hidden';
}

/**
 * Displays Serval builds in the Serval Administration area.
 */
@Component({
  selector: 'app-serval-builds',
  templateUrl: './serval-builds.component.html',
  styleUrls: ['./serval-builds.component.scss'],
  providers: [provideNativeDateAdapter()],
  imports: [
    AsyncPipe,
    MatButton,
    MatIconButton,
    MatIcon,
    MatMenu,
    MatMenuItem,
    MatMenuTrigger,
    MatTable,
    MatHeaderRow,
    MatHeaderRowDef,
    MatRow,
    MatRowDef,
    MatColumnDef,
    MatHeaderCell,
    MatHeaderCellDef,
    MatCell,
    MatCellDef,
    MatTooltip,
    DateRangePickerComponent,
    OwnerComponent,
    InfoComponent,
    MatCard,
    MatCardTitle,
    MatCardHeader,
    MatCardContent,
    MatCardTitleGroup,
    CopyComponent,
    MatSlideToggle
  ]
})
export class ServalBuildsComponent extends DataLoadingComponent implements OnInit {
  /** Help template access static methods. */
  protected ServalBuildsComponent = ServalBuildsComponent;
  protected columnsToDisplay: string[] = ['status', 'project', 'source', 'language', 'requested', 'expand'];
  /** Tracks which rows are currently expanded (by Serval build ID). */
  private expandedRows: Set<string> = new Set();
  /** Data rows, excluding those that might be filtered out by the includeDeleted toggle. */
  protected rows: ServalBuildRow[] = [];
  /** Summary statistics for the currently displayed Serval builds. */
  private summaryStats: ServalBuildSummary | undefined;
  /** Display-ready summary values shown above the table. */
  protected summaryDisplayItems: SummaryDisplayItem[] = [];
  /** Include Serval builds that we are not able to associate with any project in the SF DB. Maybe the project existed
   * and was deleted. Maybe another SF installation has that project and requested a Serval build. */
  protected includeDeleted: boolean = false;
  protected summaryIsExpanded: boolean = false;
  /** Data rows, including those that are filtered out by the includeDeleted toggle. */
  private allRows: ServalBuildRow[] = [];
  private readonly dateRange$ = new BehaviorSubject<NormalizedDateRange | undefined>(undefined);
  private readonly requesterDisplayNameCache: Map<string, Observable<string>> = new Map();

  constructor(
    noticeService: NoticeService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly dialogService: DialogService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly i18n: I18nService,
    private readonly exportService: DraftJobsExportService,
    private readonly userService: UserService,
    private readonly destroyRef: DestroyRef
  ) {
    super(noticeService);
  }

  protected get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  ngOnInit(): void {
    combineLatest([this.onlineStatusService.onlineStatus$, this.dateRange$.pipe(filter(notNull))])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([isOnline, range]) => {
        this.loadingStarted();
        void this.loadBuilds(range, isOnline);
      });
  }

  protected onDateRangeChange(range: NormalizedDateRange): void {
    this.dateRange$.next(range);
  }

  /** Toggle whether a row is expanded. */
  protected toggleRowExpansion(row: ServalBuildRow): void {
    const id: string | undefined = row.report.build?.additionalInfo?.buildId ?? row.report.draftGenerationRequestId;
    if (id == null) return;
    if (this.expandedRows.has(id)) {
      this.expandedRows.delete(id);
    } else {
      this.expandedRows.add(id);
    }
  }

  /** Check if a row is currently expanded. */
  protected isRowExpanded(row: ServalBuildRow): boolean {
    const id: string | undefined = row.report.build?.additionalInfo?.buildId ?? row.report.draftGenerationRequestId;
    if (id == null) return false;
    return this.expandedRows.has(id);
  }

  protected exportCsv(): void {
    const dateRange: NormalizedDateRange | undefined = this.dateRange$.value;
    if (dateRange == null) throw new Error('Date range is not set');
    const spreadsheetRows: SpreadsheetRow[] = ServalBuildsComponent.createSpreadsheetRows(this.rows);
    const meanDurationMs: number = this.summaryStats?.meanDurationMs ?? 0;
    const maxDurationMs: number = this.summaryStats?.maxDurationMs ?? 0;
    this.exportService.exportCsv(spreadsheetRows, dateRange, meanDurationMs, maxDurationMs, 'serval_builds');
  }

  protected exportRsv(): void {
    const dateRange: NormalizedDateRange | undefined = this.dateRange$.value;
    if (dateRange == null) throw new Error('Date range is not set');
    const spreadsheetRows: SpreadsheetRow[] = ServalBuildsComponent.createSpreadsheetRows(this.rows);
    const meanDurationMs: number = this.summaryStats?.meanDurationMs ?? 0;
    const maxDurationMs: number = this.summaryStats?.maxDurationMs ?? 0;
    this.exportService.exportRsv(spreadsheetRows, dateRange, meanDurationMs, maxDurationMs, 'serval_builds');
  }

  protected clearMLUrl(servalBuildId: string): string {
    return `https://app.sil.hosted.allegro.ai/projects?gq=${servalBuildId}&tab=tasks`;
  }

  protected openBuildDetails(row: ServalBuildRow): void {
    const buildId: string | undefined = row.report.build?.additionalInfo?.buildId;
    const sfProjectId: string | undefined = row.report.project?.sfProjectId;

    if (buildId == null || sfProjectId == null) {
      void this.noticeService.show(
        'Unable to show details. No Serval build ID or SF project ID was available for this Serval build'
      );
      return;
    }

    const durationText: string | undefined =
      row.durationMs != null ? this.formatDurationHours(row.durationMs) : undefined;
    const servalCreated: Date | undefined = row.report.timeline.servalCreated;
    const createdDisplay: string | undefined =
      servalCreated != null ? this.i18n.formatDate(servalCreated, { showTimeZone: true }) : undefined;

    const buildsCreatedSince: number = this.rows.filter(other => {
      if (other.report.project?.sfProjectId !== sfProjectId) return false;
      const otherCreated: Date | undefined = other.report.timeline.servalCreated;
      if (otherCreated == null || servalCreated == null) return false;
      return otherCreated > servalCreated;
    }).length;

    const dialogData = {
      buildId: buildId,
      projectId: sfProjectId,
      jobStatus: ServalBuildsComponent.formatStatusLabel(row.report.status),
      events: [],
      additionalEvents: [],
      eventBasedDuration: durationText,
      startTime: createdDisplay,
      clearmlUrl: this.clearMLUrl(buildId),
      buildsStartedSince: buildsCreatedSince,
      draftGenerationRequestId: row.report.draftGenerationRequestId
    };

    this.dialogService.openMatDialog(JobDetailsDialogComponent, {
      data: dialogData,
      width: '1000px',
      maxHeight: '80vh'
    });
  }

  protected statusIcon(status: DraftGenerationBuildStatus): string {
    switch (status) {
      case DraftGenerationBuildStatus.UserRequested:
      case DraftGenerationBuildStatus.SubmittedToServal:
      case DraftGenerationBuildStatus.Pending:
      case DraftGenerationBuildStatus.Active:
        return 'hourglass_top';
      case DraftGenerationBuildStatus.Completed:
        return 'done';
      case DraftGenerationBuildStatus.Faulted:
        return 'error';
      case DraftGenerationBuildStatus.Canceled:
        return 'cancel';
      default:
        return 'help';
    }
  }

  static formatStatusLabel(status: DraftGenerationBuildStatus): string {
    if (status === DraftGenerationBuildStatus.UserRequested) {
      return 'User requested';
    }
    if (status === DraftGenerationBuildStatus.SubmittedToServal) {
      return 'Submitted to Serval';
    }
    return status;
  }

  /** Returns the requested phase of the build.  */
  protected getPhase(report: ServalBuildReportDto, stage: 'Train' | 'Inference'): Phase | undefined {
    return report.timeline.phases?.find((phase: Phase) => phase.stage === stage);
  }

  protected durationServalCreatedToFinish(report: ServalBuildReportDto): string {
    if (report.build == null) return '-';
    const servalCreated: Date | undefined = report.timeline.servalCreated;
    const servalFinish: Date | undefined = report.timeline.servalFinished;
    const durationMinutes: string | undefined = ServalBuildsComponent.durationMinutes(
      servalCreated,
      servalFinish
    )?.toFixed(0);
    if (durationMinutes == null) return '-';
    return `${durationMinutes} m`;
  }

  protected durationUserRequestToCompletionAcknowledged(report: ServalBuildReportDto): string {
    const userRequestTime: Date | undefined = report.timeline.sfUserRequested;
    const acknowledgedTime: Date | undefined = report.timeline.sfAcknowledgedCompletion;
    const durationMinutes: number | undefined = ServalBuildsComponent.durationMinutes(
      userRequestTime,
      acknowledgedTime
    );
    if (durationMinutes == null) return '-';
    const durationDisplay: string = durationMinutes.toFixed(0);
    return `${durationDisplay} m`;
  }

  /** Returns the range of rows across which to show the visual duration bar, in the Timing card. */
  protected getTimingBarRowRange(row: ServalBuildRow, bar: 'serval' | 'user'): string {
    const hasUserCancel: boolean = row.report.timeline.sfUserCancelled != null;
    const userRequestRowIndex: number = 1;
    const servalCreatedRowIndex: number = 3;
    const servalFinishRowIndex: number = 6;
    const acknowledgedRowIndex: number = hasUserCancel ? 8 : 7;
    const startRowIndex: number = bar === 'serval' ? servalCreatedRowIndex : userRequestRowIndex;
    const endRowIndex: number = bar === 'serval' ? servalFinishRowIndex : acknowledgedRowIndex;
    const endRowExclusive: number = endRowIndex + 1;
    return `${startRowIndex} / ${endRowExclusive}`;
  }

  protected durationPhaseTrain(report: ServalBuildReportDto): string {
    if (report.build == null) return '-';
    const phaseTrain: Phase | undefined = this.getPhase(report, 'Train');
    const phaseInference: Phase | undefined = this.getPhase(report, 'Inference');
    const durationMinutes: string | undefined = ServalBuildsComponent.durationMinutes(
      phaseTrain?.started,
      phaseInference?.started
    )?.toFixed(0);
    if (durationMinutes == null) return '-';
    return `${durationMinutes} m`;
  }

  protected durationPhaseInference(report: ServalBuildReportDto): string {
    if (report.build == null) return '-';
    const phaseInference: Phase | undefined = this.getPhase(report, 'Inference');
    const servalFinish: Date | undefined = report.timeline.servalFinished;
    const durationMinutes: string | undefined = ServalBuildsComponent.durationMinutes(
      phaseInference?.started,
      servalFinish
    )?.toFixed(0);
    if (durationMinutes == null) return '-';
    return `${durationMinutes} m`;
  }

  protected requesterDisplayName(requesterSFUserId: string | undefined): Observable<string> {
    if (requesterSFUserId == null) return of('Unknown');

    const requesterKey: string = requesterSFUserId;
    const cached$: Observable<string> | undefined = this.requesterDisplayNameCache.get(requesterKey);
    if (cached$ != null) return cached$;

    // Cache the lookups so multiple rows don't need to request the same thing.
    const displayName$: Observable<string> = from(this.userService.getProfile(requesterSFUserId)).pipe(
      catchError(() => of(undefined)),
      map((userProfileDoc: UserProfileDoc | undefined) => {
        const displayName: string | undefined = userProfileDoc?.data?.displayName;
        if (displayName == null) return 'Unknown';
        if (displayName.trim().length === 0) return 'Unknown';
        return displayName;
      }),
      catchError(() => of('Unknown'))
    );
    this.requesterDisplayNameCache.set(requesterKey, displayName$);
    return displayName$;
  }

  private async loadBuilds(range: NormalizedDateRange, isOnline: boolean): Promise<void> {
    try {
      if (!isOnline) {
        this.allRows = [];
        this.rows = [];
        this.summaryStats = undefined;
        this.summaryDisplayItems = [];
        return;
      }

      const reports: ServalBuildReportDto[] | undefined = await firstValueFrom(
        this.draftGenerationService.getBuildsSince(range.start)
      );

      const reportsInRange: ServalBuildReportDto[] = (reports ?? []).filter(
        (report: ServalBuildReportDto) => !this.didReportBeginOutOfDateRange(report, range)
      );
      this.allRows = this.buildRows(reportsInRange);
      this.applyFiltersAndStats();
    } finally {
      this.loadingFinished();
    }
  }

  private buildRows(reports: ServalBuildReportDto[]): ServalBuildRow[] {
    const rows: ServalBuildRow[] = reports.map((report: ServalBuildReportDto) => {
      const sfProjectId: string | undefined = report.project?.sfProjectId;
      const servalCreationDate: Date | undefined = report.timeline.servalCreated;
      const servalFinishDate: Date | undefined = report.timeline.servalFinished;
      if (report.timeline.requestTime == null) {
        console.error(
          'Row has no user request time or serval creation date. This should be impossible because build records are based either on Serval build data or on SF user request events.'
        );
      }
      // Use SF timestamps if available, with fallback to Serval timestamps
      const effectiveStart: Date | undefined = report.timeline.sfUserRequested ?? servalCreationDate;
      const effectiveEnd: Date | undefined = report.timeline.sfAcknowledgedCompletion ?? servalFinishDate;
      const durationMs: number | undefined = ServalBuildsComponent.calculateDurationMs(effectiveStart, effectiveEnd);
      const projectNameDisplay: string = buildProjectDisplayName(
        report.project?.shortName,
        report.project?.name,
        sfProjectId
      );
      const projectLink: string | undefined = this.servalAdminProjectLinkFor(sfProjectId);
      const trainingBooks: ProjectBooks[] = toProjectBooks(report.config.trainingScriptureRanges);
      const translationBooks: ProjectBooks[] = toProjectBooks(report.config.translationScriptureRanges);

      return {
        report: report,
        trainingBooks: trainingBooks,
        translationBooks: translationBooks,
        projectNameDisplay: projectNameDisplay,
        durationMs: durationMs,
        projectServalAdminUrl: projectLink,
        projectDeleted: sfProjectId == null
      };
    });
    return rows.sort((left: ServalBuildRow, right: ServalBuildRow) => {
      const leftTime: number | undefined = left.report.timeline.requestTime?.getTime();
      const rightTime: number | undefined = right.report.timeline.requestTime?.getTime();
      if (leftTime == null && rightTime == null) return 0;
      if (leftTime == null) return 1;
      if (rightTime == null) return -1;
      return rightTime - leftTime;
    });
  }

  protected onIncludeDeletedChange(includeDeleted: boolean): void {
    this.includeDeleted = includeDeleted;
    this.applyFiltersAndStats();
  }

  private applyFiltersAndStats(): void {
    this.rows = this.filteredRows();
    this.updateSummaryStats();
  }

  private filteredRows(): ServalBuildRow[] {
    if (this.includeDeleted === true) {
      return [...this.allRows];
    }
    return this.allRows.filter((row: ServalBuildRow) => !row.projectDeleted);
  }

  private updateSummaryStats(): void {
    this.summaryStats = buildSummary(this.rows);
    this.summaryDisplayItems = this.buildSummaryDisplayItems(this.summaryStats);
  }

  private buildSummaryDisplayItems(summary: ServalBuildSummary | undefined): SummaryDisplayItem[] {
    if (summary == null) return [];

    const items: SummaryDisplayItem[] = [];

    const buildsItem: SummaryDisplayItem = {
      label: 'Builds',
      value: this.formatCount(summary.totalBuilds),
      prominence: 'top'
    };
    items.push(buildsItem);

    const projectsItem: SummaryDisplayItem = {
      label: 'Projects',
      value: this.formatCount(summary.totalProjects),
      prominence: 'top'
    };
    items.push(projectsItem);

    const buildsPerProjectItem: SummaryDisplayItem = {
      label: 'Builds per project',
      value: this.formatAverage(summary.buildsPerProjectRatio),
      prominence: 'top'
    };
    items.push(buildsPerProjectItem);

    const meanDurationItem: SummaryDisplayItem = {
      label: 'Mean successful duration',
      value: this.formatDurationHoursFromMs(summary.meanDurationMs),
      prominence: 'top'
    };
    items.push(meanDurationItem);

    const maxDurationItem: SummaryDisplayItem = {
      label: 'Max all durations',
      value: this.formatDurationHoursFromMs(summary.maxDurationMs),
      prominence: 'top'
    };
    items.push(maxDurationItem);

    const requestersItem: SummaryDisplayItem = {
      label: 'Requesting users',
      value: this.formatCount(summary.totalRequesters),
      prominence: 'hidden'
    };
    items.push(requestersItem);

    const averageRequestersItem: SummaryDisplayItem = {
      label: 'Average requesters per project',
      value: this.formatAverage(summary.averageRequestersPerProject),
      prominence: 'hidden'
    };
    items.push(averageRequestersItem);

    const percentTimeOnSFItem: SummaryDisplayItem = {
      label: '% time on SF',
      explanation:
        'Percentage of time that successful builds are being processed in SF before being sent to Serval, and in SF after hearing back from Serval. This is time that the build is waiting for SF rather than for Serval. It will also include network time in between, as well as any amount of time that it takes Serval to start timing, and after Serval stops timing until Serval sends the completion notice. Excludes builds known only from SF events.',
      value: this.formatPercentage(summary.percentTimeOnSF),
      prominence: 'hidden'
    };
    items.push(percentTimeOnSFItem);

    const averageGapItem: SummaryDisplayItem = {
      label: 'Average time between project builds',
      explanation:
        'For projects with more than one build, the average length of time after a build completion is acknowledged until the next build is requested for the same project.',
      value: this.formatDurationHoursFromMs(summary.averageInterBuildTimeMs),
      prominence: 'hidden'
    };
    items.push(averageGapItem);

    const completedItem: SummaryDisplayItem = {
      label: 'Completed (successful) builds',
      explanation: 'Excludes builds known only from SF events.',
      value: this.formatCount(summary.completedBuilds),
      prominence: 'hidden'
    };
    items.push(completedItem);

    const faultedItem: SummaryDisplayItem = {
      label: 'Faulted builds',
      explanation: 'Excludes builds known only from SF events.',
      value: this.formatCount(summary.faultedBuilds),
      prominence: 'hidden'
    };
    items.push(faultedItem);

    const inProgressItem: SummaryDisplayItem = {
      label: 'In-progress builds',
      explanation: 'Builds with status UserRequested, SubmittedToServal, Pending, or Active.',
      value: this.formatCount(summary.inProgressBuilds),
      prominence: 'hidden'
    };
    items.push(inProgressItem);

    const problemsItem: SummaryDisplayItem = {
      label: 'Builds with problems',
      explanation: 'Builds that SF flagged a problem for.',
      value: this.formatCount(summary.buildsWithProblems),
      prominence: 'hidden'
    };
    items.push(problemsItem);

    const averageTrainingBooksItem: SummaryDisplayItem = {
      label: 'Average training books per build',
      explanation: 'Excludes builds known only from SF events.',
      value: this.formatAverage(summary.averageTrainingBooksPerBuild),
      prominence: 'hidden'
    };
    items.push(averageTrainingBooksItem);

    const averageTranslationBooksItem: SummaryDisplayItem = {
      label: 'Average translation books per build',
      explanation: 'Excludes builds known only from SF events.',
      value: this.formatAverage(summary.averageTranslationBooksPerBuild),
      prominence: 'hidden'
    };
    items.push(averageTranslationBooksItem);

    const buildsServalDidNotKnowAboutItem: SummaryDisplayItem = {
      label: 'Builds Serval did not know about',
      explanation: 'Number of builds that we had SF event metrics for, but we did not have Serval information for.',
      value: this.formatCount(summary.buildsServalDidNotKnowAbout),
      prominence: 'hidden'
    };
    items.push(buildsServalDidNotKnowAboutItem);

    const buildsSfDidNotKnowAboutItem: SummaryDisplayItem = {
      label: 'Builds SF did not know about',
      explanation: 'Number of builds that we had Serval information for, but we did not have SF event metrics for.',
      value: this.formatCount(summary.buildsSfDidNotKnowAbout),
      prominence: 'hidden'
    };
    items.push(buildsSfDidNotKnowAboutItem);

    const unconsideredBuildsItem: SummaryDisplayItem = {
      label: 'Unconsidered builds',
      explanation: 'Builds not included in the above figures, that were not associated with a SF project.',
      value: this.formatCount(summary.unconsideredBuilds),
      prominence: 'hidden'
    };
    items.push(unconsideredBuildsItem);

    return items;
  }

  private formatCount(value: number | undefined): string {
    if (value == null) return 'n/a';
    return value.toLocaleString(this.i18n.localeCode);
  }

  private formatAverage(value: number | undefined): string {
    if (value == null) return 'n/a';
    return value.toLocaleString(this.i18n.localeCode, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  private formatDurationHoursFromMs(milliseconds: number | undefined): string {
    if (milliseconds == null) return 'n/a';
    return this.formatDurationHours(milliseconds);
  }

  private formatPercentage(value: number | undefined): string {
    if (value == null) return 'n/a';
    return `${Math.round(value)}%`;
  }

  /** If the Serval build request has a beginning date outside of the date range. */
  private didReportBeginOutOfDateRange(report: ServalBuildReportDto, range: NormalizedDateRange): boolean {
    const beginDate: Date | undefined = report.timeline.requestTime;
    if (beginDate == null) return false;
    if (Number.isNaN(beginDate.getTime())) return false;
    return beginDate < range.start || beginDate > range.end;
  }

  private static calculateDurationMs(startDate: Date | undefined, finishDate: Date | undefined): number | undefined {
    if (startDate == null || finishDate == null) return undefined;
    return finishDate.getTime() - startDate.getTime();
  }

  private static durationMinutes(startDate: Date | undefined, finishDate: Date | undefined): number | undefined {
    const durationMs: number | undefined = ServalBuildsComponent.calculateDurationMs(startDate, finishDate);
    if (durationMs == null) return undefined;
    return durationMs / 1000 / 60;
  }

  /** Formats a Date object into a string with the format "YYYY-MM-DD HH:mm:ss TZ", to be used for comparative vertical
   * display, and in the viewer's timezone. */
  protected formatDateTime(date: Date | undefined): string | undefined {
    if (date == null) return undefined;
    const year = date.getFullYear().toString();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    const second = date.getSeconds().toString().padStart(2, '0');

    const tzFormatter = new Intl.DateTimeFormat(this.i18n.localeCode, { timeZoneName: 'short' });
    const tzParts: Intl.DateTimeFormatPart | undefined = tzFormatter
      .formatToParts(date)
      .find(p => p.type === 'timeZoneName');
    const timeZoneName = tzParts?.value ?? 'UNK';
    return `${year}-${month}-${day} ${hour}:${minute}:${second} ${timeZoneName}`;
  }

  /** Formats a Date object into a localized string. Includes date part but not time part. This Serval Administration
   * method is not trying to be as broad in locale support as i18n.service.ts formatDate(). */
  protected localizedDate(date: Date | undefined): string | undefined {
    if (date == null) return undefined;
    return date.toLocaleString([this.i18n.localeCode, I18nService.defaultLocale.canonicalTag], {
      month: 'numeric',
      year: 'numeric',
      day: 'numeric'
    });
  }

  private formatDurationHours(milliseconds: number): string {
    const hours = milliseconds / 1000 / 60 / 60;
    return `${hours.toFixed(1)} h`;
  }

  private static createSpreadsheetRows(rows: ServalBuildRow[]): SpreadsheetRow[] {
    return rows.map((row: ServalBuildRow) => {
      const trainingBooksList = ServalBuildsComponent.formatProjectBooks(row.trainingBooks);
      const translationBooksList = ServalBuildsComponent.formatProjectBooks(row.translationBooks);
      const servalCreated: Date | undefined = row.report.timeline.servalCreated;
      const servalFinish: Date | undefined = row.report.timeline.servalFinished;
      // Use SF timestamps if available, with fallback to Serval timestamps
      const effectiveStart: Date | undefined = row.report.timeline.sfUserRequested ?? servalCreated;
      const effectiveEnd: Date | undefined = row.report.timeline.sfAcknowledgedCompletion ?? servalFinish;
      const durationMinutes: string =
        ServalBuildsComponent.durationMinutes(effectiveStart, effectiveEnd)?.toFixed(0) ?? '';

      return {
        servalBuildId: row.report.build?.additionalInfo?.buildId,
        draftGenerationRequestId: row.report.draftGenerationRequestId,
        startTime: effectiveStart?.toISOString(),
        endTime: effectiveEnd?.toISOString(),
        durationMinutes: durationMinutes,
        status: ServalBuildsComponent.formatStatusLabel(row.report.status),
        sfProjectId: row.report.project?.sfProjectId ?? '',
        projectName: row.projectNameDisplay,
        sfUserId: row.report.requesterSFUserId,
        trainingBooks: trainingBooksList,
        translationBooks: translationBooksList
      };
    });
  }

  static formatProjectBooks(projectBooks: ProjectBooks[]): string {
    return projectBooks.map(pb => `${pb.sfProjectId}: ${pb.books.join(', ')}`).join('; ');
  }

  protected servalAdminProjectLinkFor(sfProjectId: string | undefined): string | undefined {
    if (sfProjectId == null) return undefined;
    return `/serval-administration/${sfProjectId}`;
  }

  /** Formats a language code with its display name, e.g. "es (Spanish)". Falls back to just the code. */
  protected formatLanguageWithName(langCode: string | undefined): string {
    if (langCode == null) return 'Unknown';
    try {
      const displayNames: Intl.DisplayNames = new Intl.DisplayNames(['en'], { type: 'language' });
      const languageName: string | undefined = displayNames.of(langCode);
      if (languageName != null && languageName !== langCode) {
        return `${langCode} (${languageName})`;
      }
    } catch {
      // If Intl.DisplayNames fails or doesn't recognize the code, just return the code
    }
    return langCode;
  }
}
