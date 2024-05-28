import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterModule } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { map, Observable } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';

interface BookWithDraft {
  bookNumber: number;
  firstChapterWithDraft: number;
}

@Component({
  selector: 'app-draft-preview-books',
  templateUrl: './draft-preview-books.component.html',
  styleUrls: ['./draft-preview-books.component.scss'],
  standalone: true,
  imports: [CommonModule, MatButtonModule, RouterModule, TranslocoModule]
})
export class DraftPreviewBooksComponent {
  booksWithDrafts$: Observable<BookWithDraft[]> = this.activatedProjectService.changes$.pipe(
    map(projectDoc => {
      if (projectDoc?.data == null) {
        return [];
      }
      return projectDoc.data.texts
        .map(text => ({
          bookNumber: text.bookNum,
          firstChapterWithDraft: text.chapters.find(chapter => chapter.hasDraft)?.number
        }))
        .sort((a, b) => a.bookNumber - b.bookNumber)
        .filter(book => book.firstChapterWithDraft != null) as BookWithDraft[];
    })
  );

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly i18nService: I18nService
  ) {}

  linkForBookAndChapter(bookNumber: number, chapterNumber: number): string[] {
    return [
      '/projects',
      this.activatedProjectService.projectId!,
      'translate',
      this.bookNumberToBookId(bookNumber),
      chapterNumber.toString()
    ];
  }

  bookNumberToBookId(bookNumber: number): string {
    return Canon.bookNumberToId(bookNumber);
  }

  bookNumberToName(bookNumber: number): string {
    return this.i18nService.localizeBook(bookNumber);
  }
}
