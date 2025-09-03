import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslocoModule } from '@ngneat/transloco';
import { Subscription } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { NoticeService } from 'xforge-common/notice.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { DraftZipProgress } from '../draft-generation';
import { DraftGenerationService } from '../draft-generation.service';

@Component({
  selector: 'app-draft-download-button',
  templateUrl: './draft-download-button.component.html',
  styleUrls: ['./draft-download-button.component.scss'],
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule, TranslocoModule]
})
export class DraftDownloadButtonComponent {
  /**
   * Tracks how many books have been downloaded for the zip file.
   */
  downloadBooksProgress: number = 0;
  downloadBooksTotal: number = 0;

  zipSubscription?: Subscription;

  @Input() build: BuildDto | undefined;
  @Input() flat: boolean = false;

  constructor(
    private readonly activatedProject: ActivatedProjectService,
    private readonly draftGenerationService: DraftGenerationService,
    private readonly noticeService: NoticeService
  ) {}

  get downloadProgress(): number {
    if (this.downloadBooksTotal === 0) return 0;
    return (this.downloadBooksProgress / this.downloadBooksTotal) * 100;
  }

  downloadDraft(): void {
    this.zipSubscription?.unsubscribe();
    this.zipSubscription = this.draftGenerationService
      .downloadGeneratedDraftZip(this.activatedProject.projectDoc, this.build)
      .subscribe({
        next: (draftZipProgress: DraftZipProgress) => {
          this.downloadBooksProgress = draftZipProgress.current;
          this.downloadBooksTotal = draftZipProgress.total;
        },
        error: (error: Error) => void this.noticeService.showError(error.message)
      });
  }
}
