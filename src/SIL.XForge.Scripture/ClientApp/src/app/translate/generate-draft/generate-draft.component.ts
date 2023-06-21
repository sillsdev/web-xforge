import { Component, OnInit } from '@angular/core';
import { of } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { SubscriptionDisposable } from '../../../xforge-common/subscription-disposable';
import { DraftGenerationService, DraftJob } from './draft-generation.service';

@Component({
  selector: 'app-generate-draft',
  templateUrl: './generate-draft.component.html',
  styleUrls: ['./generate-draft.component.scss']
})
export class GenerateDraftComponent extends SubscriptionDisposable implements OnInit {
  constructor(
    private readonly dialog: DialogService,
    private readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService
  ) {
    super();
  }

  status: string = 'init';
  progress = 0;

  ngOnInit(): void {
    if (this.activatedProject.projectId) {
      this.subscribe(
        this.draftGenerationService.getBuildProgress(this.activatedProject.projectId),
        (draftRequest: DraftJob) => {
          this.status = draftRequest.state;
          this.progress = draftRequest.percentCompleted;
        }
      );
    }
  }

  generateDraft(): void {
    this.draftGenerationService.startBuild(this.activatedProject.projectId!);
  }

  async cancel(): Promise<void> {
    if (this.canCancel()) {
      if (this.status === 'generating') {
        const result = await this.dialog.confirm(
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
    return this.status === 'queued' || this.status === 'generating';
  }

  canCancel(): boolean {
    return this.isDraftInProgress();
  }
}
