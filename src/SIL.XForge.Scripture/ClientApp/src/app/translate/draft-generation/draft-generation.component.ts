import { Component, Inject, OnInit } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { BuildDto } from 'src/app/machine-api/build-dto';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
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

  isTargetLanguageNllb = false;
  isBackTranslation = false;

  constructor(
    private readonly matDialog: MatDialog,
    private readonly dialogService: DialogService,
    public readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly nllbService: NllbLanguageService,
    @Inject(ACTIVE_BUILD_STATES) private readonly activeBuildStates: BuildStates[]
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(this.activatedProject.projectDoc$, projectDoc => {
      if (projectDoc) {
        // TODO - this.isBackTranslation = projectDoc.data?.translateConfig.projectType === ProjectType.BackTranslation;
        this.isBackTranslation = true;
        this.isTargetLanguageNllb = this.nllbService.isNllbLanguage(projectDoc.data?.writingSystem.tag);
      }
    });

    if (this.activatedProject.projectId) {
      this.subscribe(
        this.draftGenerationService.getBuildProgress(this.activatedProject.projectId),
        (draftJob?: BuildDto) => {
          this.draftJob = draftJob;

          // Handle automatic closing of dialog if job finishes while cancel dialog is open
          if (!this.canCancel()) {
            this.matDialog.closeAll();
          }
        }
      );

      this.draftViewerUrl = `/projects/${this.activatedProject.projectId}/draft-preview`;
    }
  }

  generateDraft(): void {
    this.draftGenerationService.startBuild(this.activatedProject.projectId!);
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

  isDraftInProgress(): boolean {
    return this.activeBuildStates.includes(this.draftJob?.state as BuildStates);
  }

  isDraftQueued(): boolean {
    return [BuildStates.Queued, BuildStates.Pending].includes(this.draftJob?.state as BuildStates);
  }

  isDraftActive(): boolean {
    return (this.draftJob?.state as BuildStates) === BuildStates.Active;
  }

  isDraftComplete(): boolean {
    return (this.draftJob?.state as BuildStates) === BuildStates.Completed;
  }

  canGenerate(): boolean {
    return this.isBackTranslation && this.isTargetLanguageNllb;
  }

  canCancel(): boolean {
    return this.isDraftInProgress();
  }
}
