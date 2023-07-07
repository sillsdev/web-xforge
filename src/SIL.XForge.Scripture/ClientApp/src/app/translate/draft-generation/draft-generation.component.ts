import { Component, Inject, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { BuildDto } from 'src/app/machine-api/build-dto';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from '../../../xforge-common/subscription-disposable';
import { BuildStates } from '../../machine-api/build-states';
import { NllbLanguageService } from '../nllb-language.service';
import { ACTIVE_BUILD_STATES } from './draft-generation';
import { DraftGenerationService } from './draft-generation.service';

@Component({
  selector: 'app-draft-generation',
  templateUrl: './draft-generation.component.html',
  styleUrls: ['./draft-generation.component.scss']
})
export class DraftGenerationComponent extends SubscriptionDisposable implements OnInit {
  draftJob?: BuildDto;
  draftViewerUrl?: string;

  targetLanguage?: string;
  targetLanguageDisplayName?: string;

  isTargetLanguageNllb = false;
  isBackTranslation = false;

  constructor(
    private readonly matDialog: MatDialog,
    private readonly dialogService: DialogService,
    public readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly nllbService: NllbLanguageService,
    private readonly i18n: I18nService,
    @Inject(ACTIVE_BUILD_STATES) private readonly activeBuildStates: BuildStates[]
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(this.activatedProject.projectDoc$, projectDoc => {
      if (projectDoc) {
        // TODO - this.isBackTranslation = projectDoc.data?.translateConfig.projectType === ProjectType.BackTranslation;
        this.isBackTranslation = true;
        this.targetLanguage = projectDoc.data?.writingSystem.tag;
        this.targetLanguageDisplayName = this.getLanguageDisplayName(this.targetLanguage);
        this.isTargetLanguageNllb = this.nllbService.isNllbLanguage(this.targetLanguage);
      }
    });

    if (this.activatedProject.projectId) {
      this.subscribe(
        this.draftGenerationService.pollBuildProgress(this.activatedProject.projectId!).pipe(
          tap((job?: BuildDto) => {
            // Handle automatic closing of dialog if job finishes while cancel dialog is open
            if (!this.canCancel(job)) {
              this.matDialog.closeAll();
            }
          })
        ),
        (job?: BuildDto) => {
          this.draftJob = job;
        }
      );

      this.draftViewerUrl = `/projects/${this.activatedProject.projectId}/draft-preview`;
    }
  }

  getLanguageDisplayName(languageCode?: string): string | undefined {
    if (!languageCode) {
      return undefined;
    }

    const languageNames = new Intl.DisplayNames([this.i18n.localeCode], { type: 'language' });
    return languageNames.of(languageCode);
  }

  generateDraft(): void {
    this.subscribe(this.draftGenerationService.startBuild(this.activatedProject.projectId!), (job: BuildDto) => {
      this.draftJob = job;
    });
  }

  async cancel(): Promise<void> {
    if (this.canCancel()) {
      if (this.draftJob?.state === BuildStates.Active) {
        const result = await this.dialogService.confirm(
          of('Are you sure you want to cancel generating the draft?'),
          of('Yes, cancel draft generation'),
          of('No')
        );

        if (!result) {
          return;
        }
      }

      this.draftGenerationService.cancelBuild(this.activatedProject.projectId!);
    }
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

  canGenerate(): boolean {
    return this.isBackTranslation && this.isTargetLanguageNllb;
  }

  canCancel(job?: BuildDto): boolean {
    return !job || this.isDraftInProgress(job);
  }
}
