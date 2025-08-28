import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnInit, ViewChild } from '@angular/core';
import { MatDialogRef, MatDialogState } from '@angular/material/dialog';
import { MatTabGroup } from '@angular/material/tabs';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { RouterLink } from 'ngx-transloco-markup-router-link';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { asyncScheduler, combineLatest, of, Subscription } from 'rxjs';
import { catchError, filter, switchMap, tap, throttleTime } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { L10nPercentPipe } from 'xforge-common/l10n-percent.pipe';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish, quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { issuesEmailTemplate } from 'xforge-common/utils';
import { environment } from '../../../environments/environment';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SelectableProject } from '../../core/paratext.service';
import { SFProjectService } from '../../core/sf-project.service';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { ServalProjectComponent } from '../../serval-administration/serval-project.component';
import { SharedModule } from '../../shared/shared.module';
import { projectLabel } from '../../shared/utils';
import { WorkingAnimatedIndicatorComponent } from '../../shared/working-animated-indicator/working-animated-indicator.component';
import { NllbLanguageService } from '../nllb-language.service';
import { DraftDownloadButtonComponent } from './draft-download-button/draft-download-button.component';
import { activeBuildStates, BuildConfig } from './draft-generation';
import {
  DraftGenerationStepsComponent,
  DraftGenerationStepsResult
} from './draft-generation-steps/draft-generation-steps.component';
import { DraftGenerationService } from './draft-generation.service';
import { DraftHistoryListComponent } from './draft-history-list/draft-history-list.component';
import { DraftInformationComponent } from './draft-information/draft-information.component';
import { DraftPreviewBooksComponent } from './draft-preview-books/draft-preview-books.component';
import { DraftSource, DraftSourcesService } from './draft-sources.service';
import { PreTranslationSignupUrlService } from './pretranslation-signup-url.service';
import { SupportedBackTranslationLanguagesDialogComponent } from './supported-back-translation-languages-dialog/supported-back-translation-languages-dialog.component';

@Component({
    selector: 'app-draft-generation',
    templateUrl: './draft-generation.component.html',
    styleUrls: ['./draft-generation.component.scss'],
    imports: [
        CommonModule,
        UICommonModule,
        RouterModule,
        TranslocoModule,
        TranslocoMarkupModule,
        SharedModule,
        L10nPercentPipe,
        WorkingAnimatedIndicatorComponent,
        DraftGenerationStepsComponent,
        DraftInformationComponent,
        ServalProjectComponent,
        DraftDownloadButtonComponent,
        DraftPreviewBooksComponent,
        DraftHistoryListComponent
    ]
})
export class DraftGenerationComponent extends DataLoadingComponent implements OnInit {
  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  draftJob?: BuildDto;

  // This component url, but with a hash for opening a dialog
  supportedLanguagesUrl: RouterLink = { route: [], fragment: 'supported-languages' };
  draftHelp = this.i18n.interpolate('draft_generation.instructions_help');

  additionalTrainingSourceLanguage?: string;
  alternateTrainingSourceLanguage?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  targetLanguageDisplayName?: string;
  isTargetLanguageSupported = true;
  isBackTranslation = true;

  source?: DraftSource;
  trainingSource?: DraftSource;
  additionalTrainingSource?: DraftSource;

  jobSubscription?: Subscription;
  isOnline = true;

  currentPage: 'initial' | 'steps' = 'initial';

  /**
   * Once true, UI can proceed with display according to status of fetched job.
   * This is needed as an undefined `draftJob` could mean that no job has ever been started.
   */
  isDraftJobFetched = false;

  /**
   * The completed draft build, if it exists for this project.
   * This is useful for when the last build did not complete successfully or was canceled,
   * in which case a 'Preview draft' button can still be shown, as the pre-translations
   * from that build can still be retrieved.
   */
  lastCompletedBuild: BuildDto | undefined;

  /**
   * Determines if there are draft books available for download.
   */
  hasDraftBooksAvailable = false;

  isPreTranslationApproved = false;
  signupFormUrl?: string;

  cancelDialogRef?: MatDialogRef<any>;

  readonly draftDurationHours = 2.5;
  /** Duration to throttle large amounts of incoming project changes. 500 is a guess for what may be useful. */
  private readonly projectChangeThrottlingMs = 500;

  get draftEnabled(): boolean {
    return this.isBackTranslation || this.isPreTranslationApproved;
  }

  get issueEmail(): string {
    return environment.issueEmail;
  }

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly dialogService: DialogService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly authService: AuthService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly draftSourcesService: DraftSourcesService,
    private readonly nllbService: NllbLanguageService,
    protected readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly preTranslationSignupUrlService: PreTranslationSignupUrlService,
    protected readonly noticeService: NoticeService,
    protected readonly urlService: ExternalUrlService,
    protected readonly featureFlags: FeatureFlagService,
    private destroyRef: DestroyRef
  ) {
    super(noticeService);
  }

  get hasAnyCompletedBuild(): boolean {
    return this.lastCompletedBuild != null;
  }

  get isGenerationSupported(): boolean {
    return (
      this.isPreviewSupported &&
      this.canAccessDraftSourceIfAvailable(this.trainingSource) &&
      this.canAccessDraftSourceIfAvailable(this.source) &&
      this.canAccessDraftSourceIfAvailable(this.additionalTrainingSource)
    );
  }

  get isPreviewSupported(): boolean {
    return this.isTargetLanguageSupported && this.draftEnabled;
  }

  get issueMailTo(): string {
    return issuesEmailTemplate();
  }

  /**
   * Whether the last sync with Paratext was successful.
   */
  get lastSyncSuccessful(): boolean {
    return this.activatedProject.projectDoc?.data?.sync.lastSyncSuccessful ?? false;
  }

  /** Have drafting sources been adequately configured that a draft can be generated? */
  get isSourcesConfigurationComplete(): boolean {
    return this.source != null && (this.trainingSource != null || this.additionalTrainingSource != null);
  }

  get hasConfigureSourcePermission(): boolean {
    return this.isProjectAdmin;
  }

  private get isProjectAdmin(): boolean {
    const userId = this.authService.currentUserId;
    if (userId != null) {
      return this.activatedProject.projectDoc?.data?.userRoles[userId] === SFProjectRole.ParatextAdministrator;
    }
    return false;
  }

  ngOnInit(): void {
    this.loadingStarted();

    // Display dialog for supported languages when route fragment is 'supported-languages'
    this.route.fragment
      .pipe(
        filter(fragment => fragment === this.supportedLanguagesUrl.fragment),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => {
        const dialogRef = this.dialogService.openMatDialog(SupportedBackTranslationLanguagesDialogComponent);

        dialogRef.afterClosed().subscribe(() => {
          this.router.navigate([], { fragment: undefined });
        });
      });

    combineLatest([
      this.activatedProject.changes$.pipe(
        throttleTime(this.projectChangeThrottlingMs, asyncScheduler, { leading: true, trailing: true }),
        filterNullish(),
        tap(projectDoc => {
          const translateConfig = projectDoc.data?.translateConfig;

          this.isBackTranslation = translateConfig?.projectType === ProjectType.BackTranslation;
          this.targetLanguage = projectDoc.data?.writingSystem.tag;
          this.isPreTranslationApproved = translateConfig?.preTranslate ?? false;
          this.hasDraftBooksAvailable = projectDoc.data != null && SFProjectService.hasDraft(projectDoc.data);
        })
      ),
      this.draftSourcesService.getDraftProjectSources().pipe(
        tap(({ trainingSources, draftingSources }) => {
          this.source = draftingSources[0];
          this.trainingSource = trainingSources[0];
          this.additionalTrainingSource = trainingSources[1];
        })
      )
    ])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(async () => {
        this.isTargetLanguageSupported =
          !this.isBackTranslation || (await this.nllbService.isNllbLanguageAsync(this.targetLanguage));

        if (!this.draftEnabled) {
          this.signupFormUrl = await this.preTranslationSignupUrlService.generateSignupUrl();
        }
      });

    this.activatedProject.changes$
      .pipe(
        throttleTime(this.projectChangeThrottlingMs, asyncScheduler, { leading: true, trailing: true }),
        filterNullish(),
        switchMap(projectDoc => {
          // Pre-translation must be enabled for the project
          if (!this.hasStartedBuild(projectDoc)) {
            return of(undefined);
          }
          return this.draftGenerationService.getLastCompletedBuild(projectDoc.id);
        }),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe((build: BuildDto | undefined) => {
        this.lastCompletedBuild = build;
      });

    this.onlineStatusService.onlineStatus$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe((isOnline: boolean) => {
        this.isOnline = isOnline;

        // Start polling when app goes online
        if (isOnline) {
          this.pollBuild();
        } else {
          this.loadingFinished();
        }
      });

    this.i18n.locale$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.targetLanguageDisplayName = this.i18n.getLanguageDisplayName(this.targetLanguage);
    });
  }

  async generateDraft({ withConfirm = false } = {}): Promise<void> {
    if (withConfirm) {
      const isConfirmed: boolean | undefined = await this.dialogService.openGenericDialog({
        title: this.i18n.translate('draft_generation.dialog_confirm_draft_regeneration_title'),
        message: this.i18n.translate('draft_generation.dialog_confirm_draft_regeneration_message'),
        options: [
          { value: false, label: this.i18n.translate('draft_generation.dialog_confirm_draft_regeneration_no') },
          {
            value: true,
            label: this.i18n.translate('draft_generation.dialog_confirm_draft_regeneration_yes'),
            highlight: true
          }
        ]
      }).result;

      if (!isConfirmed) {
        return;
      }
    }

    // Display pre-generation steps
    this.currentPage = 'steps';
  }

  async cancel(): Promise<void> {
    const { dialogRef, result } = this.dialogService.openGenericDialog({
      title: this.i18n.translate('draft_generation.dialog_confirm_draft_cancellation_title'),
      message: this.i18n.translate('draft_generation.dialog_confirm_draft_cancellation_message'),
      options: [
        { value: false, label: this.i18n.translate('draft_generation.dialog_confirm_draft_cancellation_no') },
        {
          value: true,
          label: this.i18n.translate('draft_generation.dialog_confirm_draft_cancellation_yes'),
          highlight: true
        }
      ]
    });

    this.cancelDialogRef = dialogRef;
    const isConfirmed: boolean | undefined = await result;

    if (!isConfirmed) {
      return;
    }

    this.cancelBuild();
  }

  onPreGenerationStepsComplete(result: DraftGenerationStepsResult): void {
    const sfProjectId: string | undefined = this.activatedProject.projectId;
    if (sfProjectId == null) {
      throw new Error('SF Project ID is not set');
    }
    this.startBuild({
      projectId: sfProjectId,
      trainingDataFiles: result.trainingDataFiles,
      trainingScriptureRanges: result.trainingScriptureRanges,
      translationScriptureRanges: result.translationScriptureRanges || [],
      fastTraining: result.fastTraining,
      useEcho: result.useEcho,
      sendEmailOnBuildFinished: result.sendEmailOnBuildFinished
    });
  }

  /**
   * Determines if a user has access to a draft source.
   * @param source The draft source from the draft generation service.
   * @returns true if the user has access to the source, or if there is no source.
   */
  canAccessDraftSourceIfAvailable(source: DraftSource | undefined): boolean {
    return !(source?.noAccess ?? false);
  }

  getTranslationScriptureRange(job?: BuildDto): string {
    if (job?.additionalInfo?.translationScriptureRanges == null) return '';
    return this.i18n.formatAndLocalizeScriptureRange(
      job.additionalInfo.translationScriptureRanges.map(item => item.scriptureRange).join(';')
    );
  }

  hasDraftQueueDepth(job?: BuildDto): boolean {
    return (job?.queueDepth ?? 0) > 0;
  }

  isDraftInProgress(job?: BuildDto): boolean {
    return job != null && activeBuildStates.includes(job.state);
  }

  isSyncing(): boolean {
    return this.activatedProject.projectDoc?.data != null && this.activatedProject.projectDoc.data.sync.queuedCount > 0;
  }

  isDraftQueued(job?: BuildDto): boolean {
    return job != null && [BuildStates.Queued, BuildStates.Pending].includes(job.state);
  }

  isDraftActive(job?: BuildDto): boolean {
    return job?.state === BuildStates.Active;
  }

  isDraftFinishing(job?: BuildDto): boolean {
    return job?.state === BuildStates.Finishing;
  }

  isDraftComplete(job?: BuildDto): boolean {
    return job?.state === BuildStates.Completed;
  }

  isDraftFaulted(job?: BuildDto): boolean {
    return job?.state === BuildStates.Faulted;
  }

  isServalAdmin(): boolean {
    return this.authService.currentUserRoles.includes(SystemRole.ServalAdmin);
  }

  canShowAdditionalInfo(job?: BuildDto): boolean {
    return job?.additionalInfo != null && this.authService.currentUserRoles.includes(SystemRole.ServalAdmin);
  }

  canCancel(job?: BuildDto): boolean {
    return job == null || this.isDraftInProgress(job);
  }

  startBuild(buildConfig: BuildConfig): void {
    this.draftGenerationService
      .getBuildProgress(buildConfig.projectId)
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(job => {
        if (this.isDraftInProgress(job)) {
          this.draftJob = job;
          this.currentPage = 'initial';
          this.dialogService.message('draft_generation.draft_already_running');
          return;
        }
      });

    this.jobSubscription?.unsubscribe();
    this.jobSubscription = this.draftGenerationService
      .startBuildOrGetActiveBuild(buildConfig)
      .pipe(
        tap((job?: BuildDto) => {
          this.currentPage = 'initial';
          // Handle automatic closing of dialog if job finishes while cancel dialog is open
          if (!this.canCancel(job)) {
            if (this.cancelDialogRef?.getState() === MatDialogState.OPEN) {
              this.cancelDialogRef.close();
            }
          }

          // Ensure flag is set for case where first completed build happens while component is loaded
          if (this.isDraftComplete(job)) {
            this.lastCompletedBuild = job;
          }
        }),
        catchError(error => {
          if (error instanceof HttpErrorResponse && error.status === 401) {
            this.authService.requestParatextCredentialUpdate();
          }

          return of(undefined);
        }),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe((job?: BuildDto) => (this.draftJob = job));
  }

  projectLabel(project?: SelectableProject): string {
    return project == null ? '' : projectLabel(project);
  }

  private pollBuild(): void {
    this.jobSubscription?.unsubscribe();
    this.jobSubscription = this.activatedProject.changes$
      .pipe(
        throttleTime(this.projectChangeThrottlingMs, asyncScheduler, { leading: true, trailing: true }),
        filterNullish(),
        switchMap(projectDoc => {
          // Pre-translation must be enabled for the project
          if (!this.hasStartedBuild(projectDoc)) {
            return of(undefined);
          }
          return this.draftGenerationService
            .getBuildProgress(projectDoc.id)
            .pipe(
              switchMap((job: BuildDto | undefined) =>
                this.isDraftInProgress(job) ? this.draftGenerationService.pollBuildProgress(projectDoc.id) : of(job)
              )
            );
        }),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe((job?: BuildDto) => {
        this.draftJob = job;
        this.isDraftJobFetched = true;
        this.loadingFinished();

        // Ensure flag is set for case where first completed build happens while component is loaded
        if (this.isDraftComplete(job)) {
          this.lastCompletedBuild = job;
        }
      });
  }

  private cancelBuild(): void {
    const sfProjectId: string | undefined = this.activatedProject.projectId;
    if (sfProjectId == null) {
      throw new Error('SF Project ID is not set');
    }
    this.draftGenerationService.cancelBuild(sfProjectId).subscribe(() => {
      // If build is canceled, update job immediately instead of waiting for next poll cycle
      this.pollBuild();
    });
  }

  private hasStartedBuild(projectDoc: SFProjectProfileDoc): boolean {
    return (
      projectDoc.data?.translateConfig.preTranslate === true &&
      (projectDoc.data?.translateConfig.draftConfig.lastSelectedTranslationScriptureRange != null ||
        projectDoc.data?.translateConfig.draftConfig.lastSelectedTranslationScriptureRanges != null)
    );
  }
}
