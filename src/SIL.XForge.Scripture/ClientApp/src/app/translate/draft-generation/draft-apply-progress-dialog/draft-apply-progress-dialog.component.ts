import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslocoModule } from '@ngneat/transloco';
import { Observable } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
export interface DraftApplyProgress {
  bookNum: number;
  chapters: number[];
  chaptersApplied: number[];
  completed: boolean;
  errorMessages: string[];
}

@Component({
  selector: 'app-draft-apply-progress',
  standalone: true,
  imports: [CommonModule, UICommonModule, TranslocoModule],
  templateUrl: './draft-apply-progress-dialog.component.html',
  styleUrl: './draft-apply-progress-dialog.component.scss'
})
export class DraftApplyProgressDialogComponent {
  draftApplyProgress?: DraftApplyProgress;

  constructor(
    @Inject(MatDialogRef) private readonly dialogRef: MatDialogRef<DraftApplyProgressDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: { draftApplyProgress$: Observable<DraftApplyProgress | undefined> },
    private readonly i18n: I18nService,
    destroyRef: DestroyRef
  ) {
    data.draftApplyProgress$
      .pipe(quietTakeUntilDestroyed(destroyRef))
      .subscribe(progress => (this.draftApplyProgress = progress));
  }

  get progress(): number | undefined {
    if (this.draftApplyProgress == null) return undefined;
    return (this.draftApplyProgress.chaptersApplied.length / this.draftApplyProgress.chapters.length) * 100;
  }

  get bookName(): string {
    if (this.draftApplyProgress == null) return '';
    return this.i18n.localizeBook(this.draftApplyProgress.bookNum);
  }

  get failedToApplyChapters(): string | undefined {
    if (this.draftApplyProgress == null || !this.draftApplyProgress.completed) return undefined;
    const chapters: string[] = this.draftApplyProgress.chapters
      .filter(c => !this.draftApplyProgress?.chaptersApplied.includes(c))
      .map(c => c.toString());
    return chapters.length > 0 ? this.i18n.enumerateList(chapters) : undefined;
  }

  close(): void {
    this.dialogRef.close();
  }
}
