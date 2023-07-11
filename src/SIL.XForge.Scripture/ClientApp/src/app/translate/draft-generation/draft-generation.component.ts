import { ChangeDetectionStrategy, Component, Inject, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ProjectType } from 'realtime-server/lib/esm/scriptureforge/models/translate-config';
import { combineLatest, Observable, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { BuildDto } from 'src/app/machine-api/build-dto';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { BuildStates } from '../../machine-api/build-states';
import { NllbLanguageService } from '../nllb-language.service';
import { ACTIVE_BUILD_STATES } from './draft-generation';
import { DraftGenerationService } from './draft-generation.service';

@Component({
  selector: 'app-draft-generation',
  templateUrl: './draft-generation.component.html',
  styleUrls: ['./draft-generation.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DraftGenerationComponent implements OnInit {
  private job?: BuildDto;
  draftJob$?: Observable<BuildDto | undefined>;
  draftViewerUrl?: string;

  projectSettings$?: Observable<any>; // Combined with async pipe, this allows OnPush change detection
  targetLanguage?: string;
  targetLanguageDisplayName?: string;

  isTargetLanguageNllb = false;
  isBackTranslation = true;

  constructor(
    private readonly matDialog: MatDialog,
    private readonly dialogService: DialogService,
    public readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly nllbService: NllbLanguageService,
    private readonly i18n: I18nService,
    @Inject(ACTIVE_BUILD_STATES) private readonly activeBuildStates: BuildStates[]
  ) {}

  ngOnInit(): void {
    this.projectSettings$ = combineLatest([
      this.activatedProject.projectId$,
      this.activatedProject.projectDoc$,
      this.i18n.locale$
    ]).pipe(
      tap(([projectId, projectDoc, locale]) => {
        // TODO: Uncomment to enforce back translation projects
        // this.isBackTranslation = projectDoc?.data?.translateConfig.projectType === ProjectType.BackTranslation;
        this.targetLanguage = projectDoc?.data?.writingSystem.tag;
        this.targetLanguageDisplayName = this.getLanguageDisplayName(this.targetLanguage, locale);
        this.isTargetLanguageNllb = this.nllbService.isNllbLanguage(this.targetLanguage);
        this.draftViewerUrl = `/projects/${projectId}/draft-preview`;
      })
    );

    this.draftJob$ = this.draftGenerationService.getBuildProgress(this.activatedProject.projectId!).pipe(
      switchMap((job?: BuildDto) =>
        this.isDraftInProgress(job)
          ? this.draftGenerationService.pollBuildProgress(this.activatedProject.projectId!)
          : of(job)
      ),
      tap(job => (this.job = job))
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

    const languageNames = new Intl.DisplayNames([currentLocale.canonicalTag], { type: 'language' });
    return languageNames.of(languageCode);
  }

  generateDraft(): void {
    this.draftJob$ = this.draftGenerationService.startBuild(this.activatedProject.projectId!).pipe(
      tap((job?: BuildDto) => {
        // Handle automatic closing of dialog if job finishes while cancel dialog is open
        if (!this.canCancel(job)) {
          this.matDialog.closeAll();
        }
      }),
      tap(job => (this.job = job))
    );
  }

  async cancel(): Promise<void> {
    if (this.job?.state === BuildStates.Active) {
      const isConfirmed = await this.dialogService.openGenericDialog({
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

  isDraftInProgress(job?: BuildDto): boolean {
    return this.activeBuildStates.includes(job?.state as BuildStates);
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

  isGenerationSupported(): boolean {
    return this.isBackTranslation && this.isTargetLanguageNllb;
  }

  canCancel(job?: BuildDto): boolean {
    return !job || this.isDraftInProgress(job);
  }
}
