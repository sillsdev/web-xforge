import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { DecimalPipe, PercentPipe } from '@angular/common';
import { Component, DestroyRef, OnInit } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatAnchor, MatButton } from '@angular/material/button';
import { MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';
import { MatExpansionPanel, MatExpansionPanelHeader } from '@angular/material/expansion';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatSlideToggle, MatSlideToggleChange } from '@angular/material/slide-toggle';
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
import { Router } from '@angular/router';
import { saveAs } from 'file-saver';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TrainingData } from 'realtime-server/lib/esm/scriptureforge/models/training-data';
import { DraftConfig, TranslateSource } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import {
  catchError,
  combineLatest,
  firstValueFrom,
  lastValueFrom,
  Observable,
  of,
  Subscription,
  switchMap,
  throwError
} from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { FileService } from 'xforge-common/file.service';
import { I18nService } from 'xforge-common/i18n.service';
import { ElementState } from 'xforge-common/models/element-state';
import { FileType } from 'xforge-common/models/file-offline-data';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { OwnerComponent } from 'xforge-common/owner/owner.component';
import { RouterLinkDirective } from 'xforge-common/router-link.directive';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { WriteStatusComponent } from 'xforge-common/write-status/write-status.component';
import { SFProjectProfileDoc } from '../core/models/sf-project-profile-doc';
import { ParatextService } from '../core/paratext.service';
import { SFProjectService } from '../core/sf-project.service';
import { BuildDto, ServalBuildDiagnostic, ServalDiagnosticSeverity } from '../machine-api/build-dto';
import { BuildStates } from '../machine-api/build-states';
import { JsonViewerComponent } from '../shared/json-viewer/json-viewer.component';
import { MobileNotSupportedComponent } from '../shared/mobile-not-supported/mobile-not-supported.component';
import { NoticeComponent } from '../shared/notice/notice.component';
import { trainingSourceRangesWithTargetDetail, VerboseScriptureRange } from '../shared/scripture-range';
import { formatScriptureRangeCompact } from '../shared/scripture-range-display';
import { projectLabel } from '../shared/utils';
import { activeBuildStates } from '../translate/draft-generation/draft-generation';
import { DraftGenerationService } from '../translate/draft-generation/draft-generation.service';
import { DraftSourcesAsTranslateSourceArrays, projectToDraftSources } from '../translate/draft-generation/draft-utils';
import {
  OnboardingRequestService,
  OpenOnboardingRequest
} from '../translate/draft-generation/onboarding-request.service';
import { TrainingDataService } from '../translate/draft-generation/training-data/training-data.service';
import { buildStatusIcon } from './build-status-icon';
import { ServalAdministrationService } from './serval-administration.service';

/** How a project in the sources table relates to the target project. */
type SourceRole = 'Target' | 'Draft source' | 'Reference project' | 'Former draft source' | 'Former reference project';

/**
 * A row in the sources table. Either a project that is configured now as the target, a draft source or a reference
 * project, or a project the last draft used that has since been removed from the configuration. Keeping both in one
 * table lets the page show what the last draft actually used alongside what is configured now.
 */
interface SourceRow {
  projectId: string;
  role: SourceRole;
  /** The project label, or the project id when the project is no longer configured so its name is not known. */
  label: string;
  type: string | undefined;
  languageTag: string | undefined;
  /** The books the last draft was trained on from this project, formatted for display. Only reference projects train. */
  trainingBooks: string | undefined;
  /** The books the last draft translated from this project, formatted for display. Only draft sources are drafted from. */
  translationBooks: string | undefined;
  fileName: string;
  /** Whether the project is currently configured as a source. False only for rows kept because the last draft used the project. */
  isConfigured: boolean;
}

/**
 * A row in the training files table. Either a file currently uploaded to the project, or a file the last draft used
 * that has since been deleted, which is kept so that the last draft's inputs stay fully accounted for.
 */
interface TrainingFileRow {
  dataId: string;
  title: string;
  usedInLastDraft: boolean;
  isDeleted: boolean;
  /** True when the file was uploaded after the last draft, which therefore could not have used it. */
  isNewSinceLastDraft: boolean;
}

const BUILD_STATE_LABELS: Record<BuildStates, string> = {
  [BuildStates.Queued]: 'Queued',
  [BuildStates.Pending]: 'Pending',
  [BuildStates.Active]: 'Running',
  [BuildStates.Finishing]: 'Finishing',
  [BuildStates.Completed]: 'Completed',
  [BuildStates.Faulted]: 'Faulted',
  [BuildStates.Canceled]: 'Canceled'
};

/** Builds can produce very long diagnostic lists, so only this many are shown until the user asks for the rest. */
const DIAGNOSTICS_SHOWN_BY_DEFAULT = 3;

function projectType(project: TranslateSource | SFProjectProfile): string {
  return ParatextService.isResource(project.paratextId) ? 'DBL resource' : 'Paratext project';
}

/**
 * The Serval administration page for a single project. Shows the latest build, the drafting sources and what the last
 * draft used from them, and the Serval-specific settings a Serval administrator can change.
 */
@Component({
  selector: 'app-serval-project',
  templateUrl: './serval-project.component.html',
  styleUrls: ['./serval-project.component.scss'],
  imports: [
    CdkTextareaAutosize,
    DecimalPipe,
    PercentPipe,
    NoticeComponent,
    MatAnchor,
    MatButton,
    MatFormField,
    MatLabel,
    MatInput,
    MatSlideToggle,
    MatIcon,
    MatCard,
    MatCardHeader,
    MatCardContent,
    MatCardTitle,
    MatCardActions,
    MatTable,
    MatColumnDef,
    MatHeaderCell,
    MatHeaderCellDef,
    MatCell,
    MatCellDef,
    MatHeaderRow,
    MatHeaderRowDef,
    MatRow,
    MatRowDef,
    MatExpansionPanel,
    MatExpansionPanelHeader,
    ReactiveFormsModule,
    RouterLinkDirective,
    MobileNotSupportedComponent,
    OwnerComponent,
    WriteStatusComponent,
    JsonViewerComponent
  ]
})
export class ServalProjectComponent extends DataLoadingComponent implements OnInit {
  preTranslate = false;
  projectName = '';
  languageTag = '';
  onboardingRequest: OpenOnboardingRequest | undefined;
  onboardingRequestLink: string[] | undefined;
  onboardingRequestStatusLabel = '';

  /** The most recent build, whether it is still running or has finished. */
  latestBuild: BuildDto | undefined;
  /** The build whose draft the download button returns. Differs from the latest build while a newer build runs. */
  lastCompletedBuild: BuildDto | undefined;
  rawLatestBuild: Object | undefined;
  showAllDiagnostics = false;

  sourceColumns = ['role', 'label', 'languageTag', 'trainingBooks', 'translationBooks', 'download'];
  sourceRows: SourceRow[] = [];
  trainingFileColumns = ['title', 'usedInLastDraft', 'download'];
  trainingFileRows: TrainingFileRow[] = [];
  lastDraftExists = false;

  servalConfig = new FormControl<string | undefined>(undefined);
  form = new FormGroup({
    servalConfig: this.servalConfig
  });
  servalConfigUpdateState = ElementState.InSync;

  downloadingDraft: boolean = false;

  draftConfig: DraftConfig | undefined;
  downloadSubscription: Subscription | undefined;
  trainingDataFiles: TrainingData[] = [];

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly i18n: I18nService,
    noticeService: NoticeService,
    private readonly onboardingRequestService: OnboardingRequestService,
    private readonly trainingDataService: TrainingDataService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly projectService: SFProjectService,
    private readonly fileService: FileService,
    private readonly router: Router,
    private readonly servalAdministrationService: ServalAdministrationService,
    private destroyRef: DestroyRef
  ) {
    super(noticeService, 'ServalProjectComponent');
  }

  get eventLogLink(): string[] {
    return ['/projects', this.activatedProjectService.projectId!, 'event-log'];
  }

  get isOnline(): boolean {
    return this.onlineStatusService.isOnline;
  }

  get buildStateLabel(): string {
    if (this.latestBuild == null) return '';
    return BUILD_STATE_LABELS[this.latestBuild.state] ?? this.latestBuild.state;
  }

  get isBuildActive(): boolean {
    return this.latestBuild != null && activeBuildStates.includes(this.latestBuild.state);
  }

  /** Lower-cased state name, matching the status color variables shared with the Serval Builds tab. */
  get buildStateClass(): string {
    return this.latestBuild?.state.toLowerCase() ?? '';
  }

  get buildStateIcon(): string {
    if (this.latestBuild == null) return '';
    return buildStatusIcon(this.latestBuild.state);
  }

  /** A running build has not finished, so its request date is the meaningful one to show. */
  get buildDateLabel(): string {
    return this.isBuildActive ? 'Requested' : 'Finished';
  }

  get buildDate(): string | undefined {
    const date: string | undefined = this.isBuildActive
      ? this.latestBuild?.additionalInfo?.dateRequested
      : this.latestBuild?.additionalInfo?.dateFinished;
    if (date == null) return undefined;
    return this.i18n.formatDate(new Date(date), { showTime: true, showTimeZone: false });
  }

  get requestedByUserId(): string | undefined {
    return this.latestBuild?.additionalInfo?.requestedByUserId;
  }

  get formerSourceCount(): number {
    return this.sourceRows.filter(row => !row.isConfigured).length;
  }

  get deletedTrainingFileCount(): number {
    return this.trainingFileRows.filter(file => file.isDeleted).length;
  }

  get newTrainingFileCount(): number {
    return this.trainingFileRows.filter(file => file.isNewSinceLastDraft).length;
  }

  /**
   * True when the inputs available to a new draft differ from what the last draft used: a project it used is no longer
   * configured, a file it used was deleted, or a file was uploaded after it. A configured source the last draft simply
   * did not take books from is not a change.
   */
  get sourcesChangedSinceLastDraft(): boolean {
    return (
      this.lastDraftExists &&
      (this.formerSourceCount > 0 || this.deletedTrainingFileCount > 0 || this.newTrainingFileCount > 0)
    );
  }

  get trainCount(): number | undefined {
    return this.latestBuild?.executionData?.trainCount;
  }

  get pretranslateCount(): number | undefined {
    return this.latestBuild?.executionData?.pretranslateCount;
  }

  /** Serval's diagnostics for the latest build. Builds from before Serval 1.20 report their warnings here too. */
  get buildDiagnostics(): ServalBuildDiagnostic[] {
    return this.latestBuild?.executionData?.diagnostics ?? [];
  }

  /** Whether Serval dropped some diagnostics from the build, so the count shown is a lower bound. */
  get diagnosticsTruncated(): boolean {
    return this.latestBuild?.executionData?.diagnosticsTruncated === true;
  }

  get visibleDiagnostics(): ServalBuildDiagnostic[] {
    return this.showAllDiagnostics
      ? this.buildDiagnostics
      : this.buildDiagnostics.slice(0, DIAGNOSTICS_SHOWN_BY_DEFAULT);
  }

  get hiddenDiagnosticCount(): number {
    return this.buildDiagnostics.length - this.visibleDiagnostics.length;
  }

  diagnosticNoticeType(diagnostic: ServalBuildDiagnostic): 'error' | 'warning' | 'info' {
    switch (diagnostic.severity) {
      case ServalDiagnosticSeverity.Error:
        return 'error';
      case ServalDiagnosticSeverity.Warn:
        return 'warning';
      default:
        return 'info';
    }
  }

  /** The download always returns the last completed build's draft. The label says so when a newer build is running. */
  get downloadDraftLabel(): string {
    if (
      this.lastCompletedBuild != null &&
      this.latestBuild != null &&
      this.lastCompletedBuild.id !== this.latestBuild.id
    ) {
      return 'Download draft from previous build';
    }
    return 'Download draft';
  }

  ngOnInit(): void {
    this.activatedProjectService.projectDoc$
      .pipe(
        filterNullish(),
        switchMap(projectDoc => {
          const noBuilds: Observable<[BuildDto | undefined, BuildDto | undefined]> = of([undefined, undefined]);
          if (projectDoc.data == null) return noBuilds;
          const project: SFProjectProfile = projectDoc.data;
          this.preTranslate = project.translateConfig.preTranslate;
          this.projectName = projectLabel(project);
          this.languageTag = project.writingSystem.tag;
          const draftConfig: DraftConfig = project.translateConfig.draftConfig;

          this.draftConfig = draftConfig;
          this.updateSourceRows(projectDoc.id, project, draftConfig);
          this.updateTrainingFileRows();

          this.servalConfig.setValue(draftConfig.servalConfig);

          if (this.isOnline && this.projectService.hasDraft(project)) {
            return combineLatest([
              this.draftGenerationService.getLastCompletedBuild(projectDoc.id),
              this.draftGenerationService.getLastPreTranslationBuild(projectDoc.id)
            ]);
          }
          return noBuilds;
        }),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(async ([lastCompletedBuild, latestBuild]: [BuildDto | undefined, BuildDto | undefined]) => {
        this.lastCompletedBuild = lastCompletedBuild;
        this.latestBuild = latestBuild;
        this.showAllDiagnostics = false;
        this.rawLatestBuild =
          latestBuild?.id != null
            ? await firstValueFrom(this.draftGenerationService.getRawBuild(latestBuild.id))
            : undefined;
      });

    this.activatedProjectService.projectId$
      .pipe(
        quietTakeUntilDestroyed(this.destroyRef),
        filterNullish(),
        switchMap(projectId => {
          void this.loadOnboardingRequest(projectId);
          // Deleted files are included so that a file the last draft used can still be listed
          return this.trainingDataService.getTrainingData(projectId, this.destroyRef, { includeDeleted: true });
        })
      )
      .subscribe(activeFiles => {
        this.trainingDataFiles = activeFiles;
        this.updateTrainingFileRows();
      });
  }

  async downloadDraft(): Promise<void> {
    this.downloadSubscription?.unsubscribe();
    this.downloadingDraft = true;
    this.downloadSubscription = this.draftGenerationService
      .downloadDraft(this.activatedProjectService.projectDoc, this.lastCompletedBuild)
      .subscribe({
        error: (error: Error) => {
          this.downloadingDraft = false;
          this.noticeService.showError(error.message);
        },
        complete: () => (this.downloadingDraft = false)
      });
  }

  async downloadProject(id: string, fileName: string): Promise<void> {
    this.loadingStarted();

    // Fetch through HttpClient rather than a plain download link so the request carries the authorization header
    const blob: Blob | undefined = await lastValueFrom(
      this.servalAdministrationService.downloadProject(id).pipe(
        catchError(err => {
          this.loadingFinished();
          if (err.status === 404) {
            return of(undefined);
          } else {
            return throwError(() => err);
          }
        })
      )
    );

    if (blob == null) {
      this.noticeService.showError('The project was never synced successfully and does not exist on disk.');
      return;
    }

    saveAs(blob, fileName);

    this.loadingFinished();
  }

  downloadTrainingData(dataId: string): void {
    const trainingData: TrainingData | undefined = this.trainingDataFiles.find(t => t.dataId === dataId);
    if (trainingData == null) return this.noticeService.show('File not found');

    this.fileService.onlineDownloadFile(FileType.TrainingData, trainingData.fileUrl, trainingData.title);
  }

  onUpdatePreTranslate(change: MatSlideToggleChange): Promise<void> {
    return this.projectService.onlineSetPreTranslate(this.activatedProjectService.projectId!, change.checked);
  }

  async retrievePreTranslationStatus(): Promise<void> {
    await this.servalAdministrationService.onlineRetrievePreTranslationStatus(this.activatedProjectService.projectId!);
    this.noticeService.show('Pretranslation retrieval started.');
  }

  navigateToDraftJobs(): void {
    void this.router.navigate(['/serval-administration'], {
      queryParams: {
        tab: 'serval-builds',
        q: this.activatedProjectService.projectId!
      }
    });
  }

  updateServalConfig(): void {
    const projectDoc: SFProjectProfileDoc | undefined = this.activatedProjectService.projectDoc;
    if (projectDoc?.data == null) return;
    const unchanged: boolean =
      (this.form.value.servalConfig ?? '') === (projectDoc.data.translateConfig.draftConfig.servalConfig ?? '');
    if (unchanged) return;

    this.servalConfigUpdateState = ElementState.Submitting;
    void this.projectService
      .onlineSetServalConfig(projectDoc.id, this.form.value.servalConfig)
      .then(() => (this.servalConfigUpdateState = ElementState.Submitted))
      .catch(() => (this.servalConfigUpdateState = ElementState.Error));
  }

  private async loadOnboardingRequest(projectId: string): Promise<void> {
    this.onboardingRequest = undefined;
    if (this.isOnline) {
      try {
        this.onboardingRequest = (await this.onboardingRequestService.getOpenOnboardingRequest(projectId)) ?? undefined;
      } catch {
        // The link is a convenience, so a failed lookup just leaves it out rather than blocking the page
      }
    }
    this.onboardingRequestLink =
      this.onboardingRequest == null
        ? undefined
        : ['/serval-administration', 'onboarding-requests', this.onboardingRequest.id];
    this.onboardingRequestStatusLabel =
      this.onboardingRequest == null
        ? ''
        : this.onboardingRequestService.getStatus(this.onboardingRequest.status).label;
  }

  /**
   * Builds the sources table from the projects configured now, then appends rows for any project the last draft used
   * that is no longer configured, so that the last draft's inputs are always fully accounted for.
   */
  private updateSourceRows(targetProjectId: string, project: SFProjectProfile, draftConfig: DraftConfig): void {
    const draftSources: DraftSourcesAsTranslateSourceArrays = projectToDraftSources(project);

    // The last draft's training ranges include an entry for the target project itself, holding only the chapter
    // selection. trainingSourceRangesWithTargetDetail folds that into each source's range instead of listing the
    // target as a source.
    const trainingBooksByProjectId = new Map<string, string>();
    for (const range of trainingSourceRangesWithTargetDetail(
      draftConfig.lastSelectedTrainingScriptureRanges ?? [],
      r => r.projectId,
      targetProjectId
    )) {
      trainingBooksByProjectId.set(range.projectId, this.formatBooks(range.scriptureRange));
    }
    const translationBooksByProjectId = new Map<string, string>();
    for (const range of draftConfig.lastSelectedTranslationScriptureRanges ?? []) {
      translationBooksByProjectId.set(range.projectId, this.formatBooks(range.scriptureRange));
    }
    this.lastDraftExists = trainingBooksByProjectId.size > 0 || translationBooksByProjectId.size > 0;

    // Ranges are attributed by role, not just by project id: a project that is both the draft source and a reference
    // project is drafted from in its draft source role and trained on in its reference project role.
    const rows: SourceRow[] = [];
    rows.push(this.configuredSourceRow(targetProjectId, project, 'Target', undefined, undefined));
    for (const draftingSource of draftSources.draftingSources) {
      rows.push(
        this.configuredSourceRow(
          draftingSource.projectRef,
          draftingSource,
          'Draft source',
          undefined,
          translationBooksByProjectId.get(draftingSource.projectRef)
        )
      );
    }
    for (const trainingSource of draftSources.trainingSources) {
      rows.push(
        this.configuredSourceRow(
          trainingSource.projectRef,
          trainingSource,
          'Reference project',
          trainingBooksByProjectId.get(trainingSource.projectRef),
          undefined
        )
      );
    }

    const draftingSourceIds = new Set<string>(draftSources.draftingSources.map(source => source.projectRef));
    for (const [projectId, translationBooks] of translationBooksByProjectId) {
      if (draftingSourceIds.has(projectId)) continue;
      rows.push(this.formerSourceRow(projectId, 'Former draft source', undefined, translationBooks));
    }
    const trainingSourceIds = new Set<string>(draftSources.trainingSources.map(source => source.projectRef));
    for (const [projectId, trainingBooks] of trainingBooksByProjectId) {
      if (trainingSourceIds.has(projectId)) continue;
      rows.push(this.formerSourceRow(projectId, 'Former reference project', trainingBooks, undefined));
    }

    this.sourceRows = rows;
  }

  private configuredSourceRow(
    projectId: string,
    source: TranslateSource | SFProjectProfile,
    role: SourceRole,
    trainingBooks: string | undefined,
    translationBooks: string | undefined
  ): SourceRow {
    return {
      projectId: projectId,
      role: role,
      label: projectLabel(source),
      type: projectType(source),
      languageTag: source.writingSystem.tag,
      trainingBooks: trainingBooks,
      translationBooks: translationBooks,
      fileName: source.shortName + '.zip',
      isConfigured: true
    };
  }

  private formerSourceRow(
    projectId: string,
    role: SourceRole,
    trainingBooks: string | undefined,
    translationBooks: string | undefined
  ): SourceRow {
    return {
      projectId: projectId,
      role: role,
      label: projectId,
      type: undefined,
      languageTag: undefined,
      trainingBooks: trainingBooks,
      translationBooks: translationBooks,
      fileName: projectId + '.zip',
      isConfigured: false
    };
  }

  private updateTrainingFileRows(): void {
    const lastDraftFileIds: string[] = this.draftConfig?.lastSelectedTrainingDataFiles ?? [];
    // The files that existed when the last draft was started, or undefined for drafts made before this was recorded
    const lastAvailableFileIds: string[] | undefined = this.draftConfig?.lastAvailableTrainingDataFiles;
    const rows: TrainingFileRow[] = [];
    for (const file of this.trainingDataFiles) {
      const isDeleted: boolean = file.deleted === true;
      const usedInLastDraft: boolean = lastDraftFileIds.includes(file.dataId);
      // A deleted file only matters if the last draft used it
      if (isDeleted && !usedInLastDraft) continue;
      rows.push({
        dataId: file.dataId,
        title: file.title,
        usedInLastDraft: usedInLastDraft,
        isDeleted: isDeleted,
        isNewSinceLastDraft: !isDeleted && lastAvailableFileIds != null && !lastAvailableFileIds.includes(file.dataId)
      });
    }
    // A file the last draft used that has no record at all any more is known only by its id
    for (const dataId of lastDraftFileIds) {
      if (this.trainingDataFiles.some(file => file.dataId === dataId)) continue;
      rows.push({ dataId: dataId, title: dataId, usedInLastDraft: true, isDeleted: true, isNewSinceLastDraft: false });
    }
    this.trainingFileRows = rows;
  }

  private formatBooks(scriptureRange: string): string {
    return formatScriptureRangeCompact(new VerboseScriptureRange(scriptureRange));
  }
}
