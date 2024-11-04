import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { TranslocoModule } from '@ngneat/transloco';
import { I18nService } from 'xforge-common/i18n.service';
import { UICommonModule } from 'xforge-common/ui-common.module';

export interface DraftApplyProgress {
  bookNum: number;
  chapters: number[];
  chaptersApplied: number[];
  completed: boolean;
}

@Component({
  selector: 'app-draft-apply-progress',
  standalone: true,
  imports: [CommonModule, UICommonModule, TranslocoModule],
  templateUrl: './draft-apply-progress.component.html',
  styleUrl: './draft-apply-progress.component.scss'
})
export class DraftApplyProgressComponent {
  @Input() draftApplyProgress?: DraftApplyProgress;

  constructor(private readonly i18n: I18nService) {}

  get progress(): number | undefined {
    if (this.draftApplyProgress == null) return undefined;
    return (this.draftApplyProgress.chaptersApplied.length / this.draftApplyProgress.chapters.length) * 100;
  }

  get bookName(): string {
    return this.i18n.localizeBook(this.draftApplyProgress?.bookNum);
  }

  get failedToApplyChapters(): string | undefined {
    if (this.draftApplyProgress == null || !this.draftApplyProgress.completed) return undefined;
    const chapters: number[] = this.draftApplyProgress.chapters.filter(
      c => !this.draftApplyProgress.chaptersApplied.includes(c)
    );
    return chapters.length > 0 ? chapters.join(', ') : undefined;
  }
}
