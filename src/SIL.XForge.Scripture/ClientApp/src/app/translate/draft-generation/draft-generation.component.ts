import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialogRef, MatDialogState } from '@angular/material/dialog';
import { MatTabGroup } from '@angular/material/tabs';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { RouterLink } from 'ngx-transloco-markup-router-link';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, of, Subscription } from 'rxjs';
import { catchError, filter, switchMap, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { ExternalUrlService } from 'xforge-common/external-url.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { issuesEmailTemplate, QuietDestroyRef } from 'xforge-common/utils';
import { environment } from '../../../environments/environment';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { ServalProjectComponent } from '../../serval-administration/serval-project.component';
import { SharedModule } from '../../shared/shared.module';
import { WorkingAnimatedIndicatorComponent } from '../../shared/working-animated-indicator/working-animated-indicator.component';
import { NllbLanguageService } from '../nllb-language.service';
import { activeBuildStates, BuildConfig, DraftZipProgress } from './draft-generation';
import {
  DraftGenerationStepsComponent,
  DraftGenerationStepsResult
} from './draft-generation-steps/draft-generation-steps.component';
import { DraftGenerationService } from './draft-generation.service';
import { DraftInformationComponent } from './draft-information/draft-information.component';
import { DraftPreviewBooksComponent } from './draft-preview-books/draft-preview-books.component';
import { DraftSource, DraftSourcesService } from './draft-sources.service';
import { PreTranslationSignupUrlService } from './pretranslation-signup-url.service';
import { SupportedBackTranslationLanguagesDialogComponent } from './supported-back-translation-languages-dialog/supported-back-translation-languages-dialog.component';

@Component({
  selector: 'app-draft-generation',
  templateUrl: './draft-generation.component.html',
  styleUrls: ['./draft-generation.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    UICommonModule,
    RouterModule,
    TranslocoModule,
    TranslocoMarkupModule,
    SharedModule,
    WorkingAnimatedIndicatorComponent,
    DraftGenerationStepsComponent,
    DraftInformationComponent,
    ServalProjectComponent,
    DraftPreviewBooksComponent
  ]
})
export class DraftGenerationComponent extends DataLoadingComponent implements OnInit {
  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  draftJob?: BuildDto;

  projectSettingsUrl?: string;
  // This component url, but with a hash for opening a dialog
  supportedLanguagesUrl: RouterLink = { route: [], fragment: 'supported-languages' };
  draftHelp = this.i18n.interpolate('draft_generation.instructions_help');

  additionalTrainingSourceLanguage?: string;
  additionalTrainingSourceLanguageDisplayName?: string;

  alternateTrainingSourceLanguage?: string;
  alternateTrainingSourceLanguageDisplayName?: string;

  sourceLanguage?: string;
  sourceLanguageDisplayName?: string;

  targetLanguage?: string;
  targetLanguageDisplayName?: string;

  isTargetLanguageSupported = true;
  isBackTranslation = true;
  isSourceProjectSet = true;

  source?: DraftSource;
  trainingSource?: DraftSource;
  additionalTrainingSource?: DraftSource;

  jobSubscription?: Subscription;
  zipSubscription?: Subscription;
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

  /**
   * Tracks how many books have been downloaded for the zip file.
   */
  downloadBooksProgress: number = 0;
  downloadBooksTotal: number = 0;

  isPreTranslationApproved = false;
  signupFormUrl?: string;

  cancelDialogRef?: MatDialogRef<any>;

  readonly draftDurationHours = 2.5;

  get draftEnabled(): boolean {
    return this.isBackTranslationMode || this.isPreTranslationApproved;
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
    private readonly featureFlags: FeatureFlagService,
    private readonly nllbService: NllbLanguageService,
    protected readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly preTranslationSignupUrlService: PreTranslationSignupUrlService,
    protected readonly noticeService: NoticeService,
    protected readonly urlService: ExternalUrlService,
    private destroyRef: QuietDestroyRef
  ) {
    super(noticeService);
  }

  get downloadProgress(): number {
    if (this.downloadBooksTotal === 0) return 0;
    return (this.downloadBooksProgress / this.downloadBooksTotal) * 100;
  }

  get hasAnyCompletedBuild(): boolean {
    return this.lastCompletedBuild != null;
  }

  get isGenerationSupported(): boolean {
    return this.isPreviewSupported && this.canAccessDraftSourceIfAvailable(this.trainingSource);
  }

  get isPreviewSupported(): boolean {
    return (
      (!this.isBackTranslationMode || this.isBackTranslation) &&
      this.isTargetLanguageSupported &&
      this.isSourceProjectSet &&
      this.canAccessDraftSourceIfAvailable(this.source) &&
      (this.isBackTranslationMode || this.isPreTranslationApproved)
    );
  }

  /**
   * True if project is a back translation OR if forward translation drafting feature flag is not set.
   * If the forward translation feature flag is not set, forward translation projects are treated as invalid
   * due to failing the back translation project requirement.
   */
  get isBackTranslationMode(): boolean {
    return this.isBackTranslation || !this.isForwardTranslationEnabled;
  }

  get isForwardTranslationEnabled(): boolean {
    return this.featureFlags.allowForwardTranslationNmtDrafting.enabled;
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

  get isProjectAdmin(): boolean {
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
      .pipe(filter(fragment => fragment === this.supportedLanguagesUrl.fragment))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const dialogRef = this.dialogService.openMatDialog(SupportedBackTranslationLanguagesDialogComponent);

        dialogRef.afterClosed().subscribe(() => {
          this.router.navigate([], { fragment: undefined });
        });
      });

    combineLatest([
      this.activatedProject.changes$.pipe(
        filterNullish(),
        tap(projectDoc => {
          const translateConfig = projectDoc.data?.translateConfig;

          this.isBackTranslation = translateConfig?.projectType === ProjectType.BackTranslation;
          this.isSourceProjectSet = translateConfig?.source?.projectRef !== undefined;
          this.targetLanguage = projectDoc.data?.writingSystem.tag;

          // If an alternate source is specified, that will be used for drafting (not training)
          if (
            (translateConfig?.draftConfig.alternateSourceEnabled ?? false) &&
            translateConfig?.draftConfig.alternateSource != null
          ) {
            this.sourceLanguage = translateConfig?.draftConfig.alternateSource?.writingSystem.tag;
          } else {
            this.sourceLanguage = translateConfig?.source?.writingSystem.tag;
          }

          this.alternateTrainingSourceLanguage =
            translateConfig?.draftConfig.alternateTrainingSource?.writingSystem.tag;
          this.additionalTrainingSourceLanguage =
            translateConfig?.draftConfig.additionalTrainingSource?.writingSystem.tag;

          this.isPreTranslationApproved = translateConfig?.preTranslate ?? false;

          this.projectSettingsUrl = `/projects/${projectDoc.id}/settings`;

          this.hasDraftBooksAvailable = projectDoc.data != null && SFProjectService.hasDraft(projectDoc.data);
        })
      ),
      this.featureFlags.allowForwardTranslationNmtDrafting.enabled$,
      this.draftSourcesService.getDraftProjectSources().pipe(
        tap(({ trainingSources, draftingSources }) => {
          this.source = draftingSources[0];
          this.trainingSource = trainingSources[0];
          this.additionalTrainingSource = trainingSources[1];
        })
      )
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(async () => {
        this.isTargetLanguageSupported =
          !this.isBackTranslationMode || (await this.nllbService.isNllbLanguageAsync(this.targetLanguage));

        if (!this.isBackTranslationMode && !this.isPreTranslationApproved) {
          this.signupFormUrl = await this.preTranslationSignupUrlService.generateSignupUrl();
        }
      });

    this.activatedProject.projectDoc$
      .pipe(
        filterNullish(),
        switchMap(projectDoc => {
          // Pre-translation must be enabled for the project
          if (!this.hasStartedBuild(projectDoc)) {
            return of(undefined);
          }
          return this.draftGenerationService.getLastCompletedBuild(projectDoc.id);
        })
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((build: BuildDto | undefined) => {
        this.lastCompletedBuild = build;
      });

    this.onlineStatusService.onlineStatus$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((isOnline: boolean) => {
      this.isOnline = isOnline;

      // Start polling when app goes online
      if (isOnline) {
        this.pollBuild();
      } else {
        this.loadingFinished();
      }
    });

    this.i18n.locale$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.targetLanguageDisplayName = this.i18n.getLanguageDisplayName(this.targetLanguage);
      this.sourceLanguageDisplayName = this.i18n.getLanguageDisplayName(this.sourceLanguage);
      this.alternateTrainingSourceLanguageDisplayName = this.i18n.getLanguageDisplayName(
        this.alternateTrainingSourceLanguage
      );
      this.additionalTrainingSourceLanguageDisplayName = this.i18n.getLanguageDisplayName(
        this.additionalTrainingSourceLanguage
      );
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

  downloadDraft(): void {
    this.zipSubscription?.unsubscribe();
    this.zipSubscription = this.draftGenerationService
      .downloadGeneratedDraftZip(this.activatedProject.projectDoc, this.lastCompletedBuild)
      .subscribe({
        next: (draftZipProgress: DraftZipProgress) => {
          this.downloadBooksProgress = draftZipProgress.current;
          this.downloadBooksTotal = draftZipProgress.total;
        },
        error: (error: Error) => this.noticeService.showError(error.message)
      });
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
    this.startBuild({
      projectId: this.activatedProject.projectId!,
      trainingDataFiles: result.trainingDataFiles,
      trainingScriptureRange: result.trainingScriptureRange,
      trainingScriptureRanges: result.trainingScriptureRanges,
      translationScriptureRange: result.translationScriptureRange,
      translationScriptureRanges: result.translationScriptureRanges || [],
      fastTraining: result.fastTraining
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

  hasDraftQueueDepth(job?: BuildDto): boolean {
    return (job?.queueDepth ?? 0) > 0;
  }

  isDraftInProgress(job?: BuildDto): boolean {
    return activeBuildStates.includes(job?.state as BuildStates);
  }

  isSyncing(): boolean {
    return this.activatedProject.projectDoc?.data != null && this.activatedProject.projectDoc.data.sync.queuedCount > 0;
  }

  isDraftQueued(job?: BuildDto): boolean {
    return [BuildStates.Queued, BuildStates.Pending].includes(job?.state as BuildStates);
  }

  isDraftActive(job?: BuildDto): boolean {
    return (job?.state as BuildStates) === BuildStates.Active;
  }

  isDraftFinishing(job?: BuildDto): boolean {
    return (job?.state as BuildStates) === BuildStates.Finishing;
  }

  isDraftComplete(job?: BuildDto): boolean {
    return (job?.state as BuildStates) === BuildStates.Completed;
  }

  isDraftFaulted(job?: BuildDto): boolean {
    return (job?.state as BuildStates) === BuildStates.Faulted;
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
        })
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((job?: BuildDto) => (this.draftJob = job));
  }

  private pollBuild(): void {
    this.jobSubscription?.unsubscribe();
    this.jobSubscription = this.activatedProject.projectDoc$
      .pipe(
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
        })
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
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
    this.draftGenerationService.cancelBuild(this.activatedProject.projectId!).subscribe(() => {
      // If build is canceled, update job immediately instead of waiting for next poll cycle
      this.pollBuild();
    });
  }

  private hasStartedBuild(projectDoc: SFProjectProfileDoc): boolean {
    return (
      projectDoc.data?.translateConfig.preTranslate === true &&
      projectDoc.data?.translateConfig.draftConfig.lastSelectedTranslationScriptureRange != null
    );
  }
}
