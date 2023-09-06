import { Component, OnInit } from '@angular/core';
import { MatDialogRef, MatDialogState } from '@angular/material/dialog';
import { isEmpty } from 'lodash-es';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { Observable, of, Subscription } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { BuildDto } from '../../machine-api/build-dto';
import { BuildStates } from '../../machine-api/build-states';
import { NllbLanguageService } from '../nllb-language.service';
import { activeBuildStates } from './draft-generation';
import { DraftGenerationService } from './draft-generation.service';

export enum InfoAlert {
  None,
  NotBackTranslation,
  NotSupportedLanguage,
  NoSourceProjectSet,
  SourceAndTargetLanguageIdentical
}

@Component({
  selector: 'app-draft-generation',
  templateUrl: './draft-generation.component.html',
  styleUrls: ['./draft-generation.component.scss']
})
export class DraftGenerationComponent extends SubscriptionDisposable implements OnInit {
  draftJob?: BuildDto;

  draftViewerUrl?: string;
  projectSettingsUrl?: string;

  targetLanguage?: string;

  isTargetLanguageSupported = true;
  isBackTranslation = true;
  isSourceProjectSet = true;
  isSourceAndTargetDifferent = true;

  InfoAlert = InfoAlert;
  infoAlert?: InfoAlert;

  jobSubscription?: Subscription;

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
  hasAnyCompletedBuild$!: Observable<boolean>;

  cancelDialogRef?: MatDialogRef<any>;

  get isGenerationSupported(): boolean {
    return (
      this.isBackTranslation &&
      this.isTargetLanguageSupported &&
      this.isSourceProjectSet &&
      this.isSourceAndTargetDifferent
    );
  }

  constructor(
    private readonly dialogService: DialogService,
    public readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly nllbService: NllbLanguageService,
    private readonly i18n: I18nService
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(this.activatedProject.projectDoc$.pipe(filterNullish()), projectDoc => {
      const translateConfig = projectDoc.data?.translateConfig;

      this.isBackTranslation = translateConfig?.projectType === ProjectType.BackTranslation;
      this.isSourceProjectSet = translateConfig?.source?.projectRef !== undefined;
      this.targetLanguage = projectDoc.data?.writingSystem.tag;
      this.isTargetLanguageSupported = this.nllbService.isNllbLanguage(this.targetLanguage);
      this.isSourceAndTargetDifferent = translateConfig?.source?.writingSystem.tag !== this.targetLanguage;

      this.draftViewerUrl = `/projects/${projectDoc.id}/draft-preview`;
      this.projectSettingsUrl = `/projects/${projectDoc.id}/settings`;

      this.infoAlert = this.getInfoAlert();
    });

    this.hasAnyCompletedBuild$ = this.activatedProject.projectId$.pipe(
      filterNullish(),
      switchMap(projectId =>
        this.draftGenerationService.getLastCompletedBuild(projectId).pipe(map(build => !isEmpty(build)))
      )
    );

    this.pollBuild();
  }

  // TODO: update i18n
  async generateDraft({ withConfirm = false } = {}): Promise<void> {
    if (withConfirm) {
      const isConfirmed: boolean | undefined = await this.dialogService.openGenericDialog({
        title: of('Regenerate draft?'),
        message: of('This will re-create any unapplied draft text.'),
        options: [
          { value: false, label: of('No') },
          { value: true, label: of('Yes, start generation'), highlight: true }
        ]
      }).result;

      if (!isConfirmed) {
        return;
      }
    }

    this.startBuild();
  }

  // TODO: update i18n
  async cancel(): Promise<void> {
    if (this.draftJob?.state === BuildStates.Active) {
      const { dialogRef, result } = this.dialogService.openGenericDialog({
        title: of('Cancel draft generation?'),
        message: of(
          'Canceling will reset progress for this draft request. You will still be able to use the last completed draft.'
        ),
        options: [
          { value: false, label: of('No') },
          { value: true, label: of('Yes, cancel draft generation'), highlight: true }
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

  private startBuild(): void {
    this.jobSubscription?.unsubscribe();
    this.jobSubscription = this.subscribe(
      this.draftGenerationService.startBuildOrGetActiveBuild(this.activatedProject.projectId!).pipe(
        tap((job?: BuildDto) => {
          // Handle automatic closing of dialog if job finishes while cancel dialog is open
          if (!this.canCancel(job)) {
            if (this.cancelDialogRef?.getState() === MatDialogState.OPEN) {
              this.cancelDialogRef.close();
            }
          }
        })
      ),
      (job?: BuildDto) => (this.draftJob = job)
    );
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
      }
    );
  }

  private cancelBuild(): void {
    this.draftGenerationService.cancelBuild(this.activatedProject.projectId!).subscribe(() => {
      // If build is canceled, update job immediately instead of waiting for next poll cycle
      this.pollBuild();
    });
  }

  getTargetLanguageDisplayName(): string | undefined {
    return this.i18n.getLanguageDisplayName(this.targetLanguage);
  }

  /**
   * Gets the highest priority info alert to be displayed.
   */
  getInfoAlert(): InfoAlert {
    // In order of priority...

    if (!this.isBackTranslation) {
      return InfoAlert.NotBackTranslation;
    }

    if (!this.isTargetLanguageSupported) {
      return InfoAlert.NotSupportedLanguage;
    }

    if (!this.isSourceProjectSet) {
      return InfoAlert.NoSourceProjectSet;
    }

    if (!this.isSourceAndTargetDifferent) {
      return InfoAlert.SourceAndTargetLanguageIdentical;
    }

    return InfoAlert.None;
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
    return !job || this.isDraftInProgress(job);
  }
}
