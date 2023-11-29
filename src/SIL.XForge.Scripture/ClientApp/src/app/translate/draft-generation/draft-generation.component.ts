import { Component, OnInit, ViewChild } from '@angular/core';
import {
  MatLegacyDialogRef as MatDialogRef,
  MatLegacyDialogState as MatDialogState
} from '@angular/material/legacy-dialog';
import { MatLegacyTabGroup as MatTabGroup } from '@angular/material/legacy-tabs';
import { isEmpty } from 'lodash-es';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, of, Subscription } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { NllbLanguageService } from '../nllb-language.service';
import { activeBuildStates } from './draft-generation';
import { DraftGenerationStepsResult } from './draft-generation-steps/draft-generation-steps.component';
import { DraftGenerationService } from './draft-generation.service';
import { PreTranslationSignupUrlService } from './pretranslation-signup-url.service';

export enum InfoAlert {
  None,
  NotBackTranslation,
  NotSupportedLanguage,
  NoSourceProjectSet,
  SourceAndTargetLanguageIdentical,
  SourceAndTrainingSourceLanguageDoesNotMatch,
  ApprovalNeeded
}

@Component({
  selector: 'app-draft-generation',
  templateUrl: './draft-generation.component.html',
  styleUrls: ['./draft-generation.component.scss']
})
export class DraftGenerationComponent extends SubscriptionDisposable implements OnInit {
  @ViewChild(MatTabGroup) tabGroup?: MatTabGroup;
  draftJob?: BuildDto;

  draftViewerUrl?: string;
  projectSettingsUrl?: string;

  targetLanguage?: string;
  targetLanguageDisplayName?: string;

  isTargetLanguageSupported = true;
  isBackTranslation = true;
  isSourceProjectSet = true;
  isSourceAndTargetDifferent = true;
  isSourceAndTrainingSourceLanguageIdentical = true;

  InfoAlert = InfoAlert;
  infoAlert?: InfoAlert;

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

  readonly nllbUrl: string = 'https://ai.facebook.com/research/no-language-left-behind/#200-languages-accordion';

  constructor(
    private readonly dialogService: DialogService,
    public readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
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
      (!this.isBackTranslationMode || this.isBackTranslation) &&
      (!this.isBackTranslationMode || this.isTargetLanguageSupported) &&
      this.isSourceProjectSet &&
      this.isSourceAndTargetDifferent &&
      this.isSourceAndTrainingSourceLanguageIdentical &&
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

  ngOnInit(): void {
    this.subscribe(
      combineLatest([
        this.activatedProject.projectDoc$.pipe(
          filterNullish(),
          tap(async projectDoc => {
            const translateConfig = projectDoc.data?.translateConfig;

            this.isBackTranslation = translateConfig?.projectType === ProjectType.BackTranslation;
            this.isSourceProjectSet = translateConfig?.source?.projectRef !== undefined;
            this.targetLanguage = projectDoc.data?.writingSystem.tag;
            this.isTargetLanguageSupported = this.nllbService.isNllbLanguage(this.targetLanguage);
            this.isSourceAndTargetDifferent = translateConfig?.source?.writingSystem.tag !== this.targetLanguage;

            // The alternate training source and source languages must match
            if (
              (translateConfig?.draftConfig.alternateTrainingSourceEnabled ?? false) &&
              translateConfig?.draftConfig.alternateTrainingSource != null
            ) {
              if (translateConfig?.draftConfig.alternateSource != null) {
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

            if (!this.isBackTranslationMode && !this.isPreTranslationApproved) {
              this.signupFormUrl = await this.preTranslationSignupUrlService.generateSignupUrl();
            }
          })
        ),
        this.featureFlags.allowForwardTranslationNmtDrafting.enabled$
      ]),
      () => {
        this.infoAlert = this.getInfoAlert();
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
    this.startBuild(result.books, result.books);
  }

  /**
   * Gets the highest priority info alert to be displayed.
   */
  getInfoAlert(): InfoAlert {
    // In order of priority...

    if (!this.isBackTranslation && !this.isForwardTranslationEnabled) {
      return InfoAlert.NotBackTranslation;
    }

    if (this.isBackTranslationMode && !this.isTargetLanguageSupported) {
      return InfoAlert.NotSupportedLanguage;
    }

    if (!this.isSourceProjectSet) {
      return InfoAlert.NoSourceProjectSet;
    }

    if (!this.isSourceAndTargetDifferent) {
      return InfoAlert.SourceAndTargetLanguageIdentical;
    }

    if (!this.isSourceAndTrainingSourceLanguageIdentical) {
      return InfoAlert.SourceAndTrainingSourceLanguageDoesNotMatch;
    }

    if (!this.isBackTranslationMode && !this.isPreTranslationApproved) {
      return InfoAlert.ApprovalNeeded;
    }

    return InfoAlert.None;
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

  canCancel(job?: BuildDto): boolean {
    return job == null || this.isDraftInProgress(job);
  }

  startBuild(trainingBooks: number[], translationBooks: number[]): void {
    this.jobSubscription?.unsubscribe();
    this.jobSubscription = this.subscribe(
      this.draftGenerationService
        .startBuildOrGetActiveBuild({
          projectId: this.activatedProject.projectId!,
          trainingBooks,
          translationBooks
        })
        .pipe(
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
