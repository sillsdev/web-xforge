import { CommonModule } from '@angular/common';
import { Component, OnInit, ViewChild } from '@angular/core';
import {
  MatLegacyDialogRef as MatDialogRef,
  MatLegacyDialogState as MatDialogState
} from '@angular/material/legacy-dialog';
import { MatTabGroup } from '@angular/material/tabs';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { isEmpty } from 'lodash-es';
import { TranslocoMarkupModule } from 'ngx-transloco-markup';
import { RouterLink } from 'ngx-transloco-markup-router-link';
import { SystemRole } from 'realtime-server/lib/esm/common/models/system-role';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, of, Subscription } from 'rxjs';
import { filter, map, switchMap, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { AuthService } from 'xforge-common/auth.service';
import { DialogService } from 'xforge-common/dialog.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { issuesEmailTemplate } from 'xforge-common/utils';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { SharedModule } from '../../shared/shared.module';
import { WorkingAnimatedIndicatorComponent } from '../../shared/working-animated-indicator/working-animated-indicator.component';
import { NllbLanguageService } from '../nllb-language.service';
import { activeBuildStates, BuildConfig } from './draft-generation';
import {
  DraftGenerationStepsComponent,
  DraftGenerationStepsResult
} from './draft-generation-steps/draft-generation-steps.component';
import { DraftGenerationService } from './draft-generation.service';
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
    SupportedBackTranslationLanguagesDialogComponent
  ]
})
export class DraftGenerationComponent extends SubscriptionDisposable implements OnInit {
  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  draftJob?: BuildDto;

  draftViewerUrl?: string;
  projectSettingsUrl?: string;
  // This component url, but with a hash for opening a dialog
  supportedLanguagesUrl: RouterLink = { route: [], fragment: 'supported-languages' };

  targetLanguage?: string;
  targetLanguageDisplayName?: string;

  isTargetLanguageSupported = true;
  isBackTranslation = true;
  isSourceProjectSet = true;
  isSourceAndTargetDifferent = true;
  isSourceAndTrainingSourceLanguageIdentical = true;

  source?: DraftSource;
  alternateSource?: DraftSource;
  alternateTrainingSource?: DraftSource;

  jobSubscription?: Subscription;
  isOnline = true;

  /**
   * Once true, UI can proceed with display according to status of fetched job.
   * This is needed as an undefined `draftJob` could mean that no job has ever been started.
   */
  isDraftJobFetched = false;

  /**
   * Whether any completed draft build exists for this project.
   * This is useful for when the last build did not complete successfully or was canceled,
   * in which case a 'Preview draft' button can still be shown, as the pre-translations
   * from that build can still be retrieved.
   */
  hasAnyCompletedBuild = false;

  isPreTranslationApproved = false;
  signupFormUrl?: string;

  cancelDialogRef?: MatDialogRef<any>;

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
    private readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly preTranslationSignupUrlService: PreTranslationSignupUrlService
  ) {
    super();
  }

  get isGenerationSupported(): boolean {
    return (
      this.isPreviewSupported &&
      this.canAccessDraftSourceIfAvailable(this.alternateSource) &&
      this.canAccessDraftSourceIfAvailable(this.alternateTrainingSource)
    );
  }

  get isPreviewSupported(): boolean {
    return (
      (!this.isBackTranslationMode || this.isBackTranslation) &&
      this.isTargetLanguageSupported &&
      this.isSourceProjectSet &&
      this.isSourceAndTargetDifferent &&
      this.isSourceAndTrainingSourceLanguageIdentical &&
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

  ngOnInit(): void {
    // Display dialog for supported languages when route fragment is 'supported-languages'
    this.subscribe(
      this.route.fragment.pipe(filter(fragment => fragment === this.supportedLanguagesUrl.fragment)),
      () => {
        const dialogRef = this.dialogService.openMatDialog(SupportedBackTranslationLanguagesDialogComponent);

        dialogRef.afterClosed().subscribe(() => {
          this.router.navigate([], { fragment: undefined });
        });
      }
    );

    this.subscribe(
      combineLatest([
        this.activatedProject.projectDoc$.pipe(
          filterNullish(),
          tap(projectDoc => {
            const translateConfig = projectDoc.data?.translateConfig;

            this.isBackTranslation = translateConfig?.projectType === ProjectType.BackTranslation;
            this.isSourceProjectSet = translateConfig?.source?.projectRef !== undefined;
            this.targetLanguage = projectDoc.data?.writingSystem.tag;
            this.isSourceAndTargetDifferent = translateConfig?.source?.writingSystem.tag !== this.targetLanguage;

            // The alternate training source and source languages must match
            if (
              (translateConfig?.draftConfig.alternateTrainingSourceEnabled ?? false) &&
              translateConfig?.draftConfig.alternateTrainingSource != null
            ) {
              if (
                (translateConfig?.draftConfig.alternateSourceEnabled ?? false) &&
                translateConfig?.draftConfig.alternateSource != null
              ) {
                // Compare the alternate training source with the alternate source
                this.isSourceAndTrainingSourceLanguageIdentical =
                  translateConfig?.draftConfig.alternateTrainingSource?.writingSystem.tag ===
                  translateConfig?.draftConfig.alternateSource?.writingSystem.tag;
              } else {
                // Compare the alternate training source with the source
                this.isSourceAndTrainingSourceLanguageIdentical =
                  translateConfig?.draftConfig.alternateTrainingSource?.writingSystem.tag ===
                  translateConfig?.source?.writingSystem.tag;
              }
            } else {
              // There is no alternate training source specified
              this.isSourceAndTrainingSourceLanguageIdentical = true;
            }

            this.isPreTranslationApproved = translateConfig?.preTranslate ?? false;

            this.draftViewerUrl = `/projects/${projectDoc.id}/draft-preview`;
            this.projectSettingsUrl = `/projects/${projectDoc.id}/settings`;
          })
        ),
        this.featureFlags.allowForwardTranslationNmtDrafting.enabled$,
        this.draftSourcesService.getDraftProjectSources().pipe(
          tap(({ source, alternateSource, alternateTrainingSource }) => {
            this.source = source;
            this.alternateSource = alternateSource;
            this.alternateTrainingSource = alternateTrainingSource;
          })
        )
      ]),
      async () => {
        this.isTargetLanguageSupported =
          !this.isBackTranslationMode || (await this.nllbService.isNllbLanguageAsync(this.targetLanguage));

        if (!this.isBackTranslationMode && !this.isPreTranslationApproved) {
          this.signupFormUrl = await this.preTranslationSignupUrlService.generateSignupUrl();
        }
      }
    );

    this.subscribe(
      this.activatedProject.projectId$.pipe(
        filterNullish(),
        switchMap(projectId =>
          this.draftGenerationService.getLastCompletedBuild(projectId).pipe(map(build => !isEmpty(build)))
        )
      ),
      (hasAnyCompletedBuild: boolean) => {
        this.hasAnyCompletedBuild = hasAnyCompletedBuild;
      }
    );

    this.subscribe(this.onlineStatusService.onlineStatus$, (isOnline: boolean) => {
      this.isOnline = isOnline;

      // Start polling when app goes online
      if (isOnline) {
        this.pollBuild();
      }
    });

    this.subscribe(this.i18n.locale$, () => {
      this.targetLanguageDisplayName = this.getTargetLanguageDisplayName();
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
    this.navigateToTab('pre-generate-steps');
  }

  async cancel(): Promise<void> {
    if (this.draftJob?.state === BuildStates.Active) {
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
    }

    this.cancelBuild();
  }

  navigateToTab(tab: 'initial' | 'pre-generate-steps'): void {
    if (this.tabGroup == null) {
      return;
    }

    switch (tab) {
      case 'initial':
        this.tabGroup.selectedIndex = 0;
        break;
      case 'pre-generate-steps':
        this.tabGroup.selectedIndex = 1;
        break;
    }
  }

  onPreGenerationStepsComplete(result: DraftGenerationStepsResult): void {
    this.navigateToTab('initial');
    this.startBuild({
      projectId: this.activatedProject.projectId!,
      trainingBooks: result.trainingBooks,
      trainingDataFiles: result.trainingDataFiles,
      translationBooks: result.translationBooks,
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

  isDraftQueued(job?: BuildDto): boolean {
    return [BuildStates.Queued, BuildStates.Pending].includes(job?.state as BuildStates);
  }

  isDraftActive(job?: BuildDto): boolean {
    return (job?.state as BuildStates) === BuildStates.Active;
  }

  isDraftComplete(job?: BuildDto): boolean {
    return (job?.state as BuildStates) === BuildStates.Completed;
  }

  isDraftFaulted(job?: BuildDto): boolean {
    return (job?.state as BuildStates) === BuildStates.Faulted;
  }

  canShowAdditionalInfo(job?: BuildDto): boolean {
    return job?.additionalInfo != null && this.authService.currentUserRoles.includes(SystemRole.SystemAdmin);
  }

  canCancel(job?: BuildDto): boolean {
    return job == null || this.isDraftInProgress(job);
  }

  startBuild(buildConfig: BuildConfig): void {
    this.jobSubscription?.unsubscribe();
    this.jobSubscription = this.subscribe(
      this.draftGenerationService.startBuildOrGetActiveBuild(buildConfig).pipe(
        tap((job?: BuildDto) => {
          // Handle automatic closing of dialog if job finishes while cancel dialog is open
          if (!this.canCancel(job)) {
            if (this.cancelDialogRef?.getState() === MatDialogState.OPEN) {
              this.cancelDialogRef.close();
            }
          }

          // Ensure flag is set for case where first completed build happens while component is loaded
          if (this.isDraftComplete(job)) {
            this.hasAnyCompletedBuild = true;
          }
        })
      ),
      (job?: BuildDto) => (this.draftJob = job)
    );
  }

  private getTargetLanguageDisplayName(): string | undefined {
    return this.i18n.getLanguageDisplayName(this.targetLanguage);
  }

  private pollBuild(): void {
    this.jobSubscription?.unsubscribe();
    this.jobSubscription = this.subscribe(
      this.activatedProject.projectId$.pipe(
        filterNullish(),
        switchMap(projectId =>
          this.draftGenerationService
            .getBuildProgress(projectId)
            .pipe(
              switchMap((job?: BuildDto) =>
                this.isDraftInProgress(job) ? this.draftGenerationService.pollBuildProgress(projectId) : of(job)
              )
            )
        )
      ),
      (job?: BuildDto) => {
        this.draftJob = job;
        this.isDraftJobFetched = true;

        // Ensure flag is set for case where first completed build happens while component is loaded
        if (this.isDraftComplete(job)) {
          this.hasAnyCompletedBuild = true;
        }
      }
    );
  }

  private cancelBuild(): void {
    this.draftGenerationService.cancelBuild(this.activatedProject.projectId!).subscribe(() => {
      // If build is canceled, update job immediately instead of waiting for next poll cycle
      this.pollBuild();
    });
  }
}
