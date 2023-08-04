import { Component, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { isEmpty } from 'lodash-es';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, Observable, of, Subscription } from 'rxjs';
import { map, switchMap, tap } from 'rxjs/operators';
import { BuildDto } from 'src/app/machine-api/build-dto';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
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
  targetLanguageDisplayName?: string;

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

  get isGenerationSupported(): boolean {
    return (
      this.isBackTranslation &&
      this.isTargetLanguageSupported &&
      this.isSourceProjectSet &&
      this.isSourceAndTargetDifferent
    );
  }

  constructor(
    private readonly matDialog: MatDialog,
    private readonly dialogService: DialogService,
    public readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly nllbService: NllbLanguageService,
    private readonly i18n: I18nService
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(
      combineLatest([this.activatedProject.projectId$, this.activatedProject.projectDoc$, this.i18n.locale$]),
      ([projectId, projectDoc, locale]) => {
        const translateConfig = projectDoc?.data?.translateConfig;

        this.isBackTranslation = translateConfig?.projectType === ProjectType.BackTranslation;
        this.isSourceProjectSet = translateConfig?.source?.projectRef !== undefined;
        this.targetLanguage = projectDoc?.data?.writingSystem.tag;
        this.targetLanguageDisplayName = this.getLanguageDisplayName(this.targetLanguage, locale);
        this.isTargetLanguageSupported = this.nllbService.isNllbLanguage(this.targetLanguage);
        this.isSourceAndTargetDifferent = translateConfig?.source?.writingSystem.tag !== this.targetLanguage;

        this.draftViewerUrl = `/projects/${projectId}/draft-preview`;
        this.projectSettingsUrl = `/projects/${projectId}/settings`;

        this.infoAlert = this.getInfoAlert();
      }
    );

    this.hasAnyCompletedBuild$ = this.draftGenerationService
      .getLastCompletedBuild(this.activatedProject.projectId!)
      .pipe(map(build => !isEmpty(build)));

    this.jobSubscription = this.subscribe(
      this.draftGenerationService
        .getBuildProgress(this.activatedProject.projectId!)
        .pipe(
          switchMap((job?: BuildDto) =>
            this.isDraftInProgress(job)
              ? this.draftGenerationService.pollBuildProgress(this.activatedProject.projectId!)
              : of(job)
          )
        ),
      (job?: BuildDto) => {
        this.draftJob = job;
        this.isDraftJobFetched = true;
      }
    );
  }

  /**
   * Gets the language name for the specified code rendered in the specified locale.
   * TODO: This seems like it could be factored out as a utility function
   * @param languageCode The language code for the language name to be displayed.
   * @param currentLocale The language to display the name in.
   * @returns The display name or undefined if language code is not set.
   */
  getLanguageDisplayName(languageCode: string | undefined, currentLocale: Locale): string | undefined {
    if (!languageCode) {
      return undefined;
    }

    const languageNames: Intl.DisplayNames = new Intl.DisplayNames([currentLocale.canonicalTag], { type: 'language' });
    return languageNames.of(languageCode);
  }

  async generateDraft(shouldConfirm = false): Promise<void> {
    if (shouldConfirm) {
      const isConfirmed: boolean | undefined = await this.dialogService.openGenericDialog({
        title: of('Confirm draft regeneration'),
        message: of('This will re-create any unapplied draft text! Are you sure you want to generate a new draft?'),
        options: [
          { value: false, label: of('No') },
          { value: true, label: of('Yes, start generation'), highlight: true }
        ]
      });

      if (!isConfirmed) {
        return;
      }
    }

    this.jobSubscription?.unsubscribe();
    this.jobSubscription = this.subscribe(
      this.draftGenerationService.startBuild(this.activatedProject.projectId!).pipe(
        tap((job?: BuildDto) => {
          // Handle automatic closing of dialog if job finishes while cancel dialog is open
          if (!this.canCancel(job)) {
            this.matDialog.closeAll();
          }
        })
      ),
      (job?: BuildDto) => (this.draftJob = job)
    );
  }

  async cancel(): Promise<void> {
    if (this.draftJob?.state === BuildStates.Active) {
      const isConfirmed: boolean | undefined = await this.dialogService.openGenericDialog({
        title: of('Confirm draft cancellation'),
        message: of('Are you sure you want to cancel generating the draft?'),
        options: [
          { value: false, label: of('No') },
          { value: true, label: of('Yes, cancel draft generation'), highlight: true }
        ]
      });

      if (!isConfirmed) {
        return;
      }
    }

    this.draftGenerationService.cancelBuild(this.activatedProject.projectId!).subscribe();
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

  canCancel(job?: BuildDto): boolean {
    return !job || this.isDraftInProgress(job);
  }
}
