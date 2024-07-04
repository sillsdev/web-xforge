import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { translate, TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { map, Observable } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { TextDocId } from '../../../core/models/text-doc';
import { DraftHandlingService } from '../draft-handling/draft-handling.service';

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
    private readonly i18n: I18nService,
    private readonly draftHandlingService: DraftHandlingService,
    private readonly noticeService: NoticeService,
    private readonly dialogService: DialogService
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
    return this.i18n.localizeBook(bookNumber);
  }

  async applyBookDraftAsync(bookWithDraft: BookWithDraft): Promise<void> {
    const bookName: string = this.bookNumberToName(bookWithDraft.bookNumber);
    if (
      !(await this.dialogService.confirm(
        this.i18n.translate('draft_preview_books.add_book_to_project', { bookName }),
        this.i18n.translate('draft_preview_books.book_contents_will_be_overwritten', { bookName })
      ))
    ) {
      return;
    }
    // TODO: What happpens if we have an error?
    const promises: Promise<void>[] = [];
    for (const chapter of bookWithDraft.chaptersWithDrafts) {
      promises.push(
        this.draftHandlingService.getAndApplyDraftAsync(
          new TextDocId(this.activatedProjectService.projectId!, bookWithDraft.bookNumber, chapter)
        )
      );
    }
    await Promise.all(promises);
    this.noticeService.show(translate('draft_preview_books.draft_successfully_applied', { bookName }));
  }
}
