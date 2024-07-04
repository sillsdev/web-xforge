import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { map, Observable } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { TextDocId } from '../../../core/models/text-doc';
import { DraftViewerService } from '../draft-viewer/draft-viewer.service';

export interface BookWithDraft {
  bookNumber: number;
  chaptersWithDrafts: number[];
}

@Component({
  selector: 'app-draft-preview-books',
  templateUrl: './draft-preview-books.component.html',
  styleUrls: ['./draft-preview-books.component.scss'],
  standalone: true,
  imports: [CommonModule, UICommonModule, RouterModule, TranslocoModule]
})
export class DraftPreviewBooksComponent {
  booksWithDrafts$: Observable<BookWithDraft[]> = this.activatedProjectService.changes$.pipe(
    map(projectDoc => {
      if (projectDoc?.data == null) {
        return [];
      }
      const draftBooks = projectDoc.data.texts
        .map(text => ({
          bookNumber: text.bookNum,
          chaptersWithDrafts: text.chapters.filter(chapter => chapter.hasDraft).map(chapter => chapter.number)
        }))
        .sort((a, b) => a.bookNumber - b.bookNumber)
        .filter(book => book.chaptersWithDrafts.length > 0) as BookWithDraft[];
      return draftBooks;
    })
  );

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly i18nService: I18nService,
    private readonly draftViewerService: DraftViewerService,
    private readonly noticeService: NoticeService
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

  async applyBookDraft(bookWithDraft: BookWithDraft): Promise<void> {
    // TODO: What happpens if we have an error?
    const promises: Promise<void>[] = [];
    for (const chapter of bookWithDraft.chaptersWithDrafts) {
      promises.push(
        this.draftViewerService.getAndApplyDraftAsync(
          new TextDocId(this.activatedProjectService.projectId!, bookWithDraft.bookNumber, chapter)
        )
      );
    }
    await Promise.all(promises);
    this.noticeService.show('drafts successfully applied');
  }
}
