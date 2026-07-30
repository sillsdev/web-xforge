import { Component, Input } from '@angular/core';
import { MatButton, MatButtonAppearance } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatProgressSpinner } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { NoticeService } from 'xforge-common/notice.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { DraftGenerationService } from '../draft-generation.service';

@Component({
  selector: 'app-draft-download-button',
  templateUrl: './draft-download-button.component.html',
  styleUrls: ['./draft-download-button.component.scss'],
  imports: [MatButton, MatIcon, MatProgressSpinner, TranslocoModule]
})
export class DraftDownloadButtonComponent {
  /**
   * Whether a draft download is in progress.
   */
  downloadingDraft: boolean = false;

  downloadSubscription?: Subscription;

  @Input() build: BuildDto | undefined;
  @Input() matButton: MatButtonAppearance = 'text';

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly noticeService: NoticeService
  ) {}

  downloadDraft(): void {
    this.downloadSubscription?.unsubscribe();
    this.downloadingDraft = true;
    this.downloadSubscription = this.draftGenerationService
      .downloadDraft(this.activatedProject.projectDoc, this.build)
      .subscribe({
        error: (error: Error) => {
          this.downloadingDraft = false;
          this.noticeService.showError(error.message);
        },
        complete: () => (this.downloadingDraft = false)
      });
  }
}
