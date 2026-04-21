import { AsyncPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { map, Observable, tap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { BuildDto } from '../../../machine-api/build-dto';
import { booksFromScriptureRange } from '../../../shared/utils';

export interface BookWithDraft {
  bookNumber: number;
  bookId: string;
  chaptersInBook: number[];
}

@Component({
  selector: 'app-draft-preview-books',
  templateUrl: './draft-preview-books.component.html',
  styleUrls: ['./draft-preview-books.component.scss'],
  imports: [AsyncPipe, MatButton, TranslocoModule]
})
export class DraftPreviewBooksComponent {
  @Input() build: BuildDto | undefined;

  booksWithDrafts$: Observable<BookWithDraft[]> = this.activatedProjectService.changes$.pipe(
    filterNullish(),
    tap(p => (this.projectParatextId = p.data?.paratextId)),
    map(projectDoc => {
      if (projectDoc?.data == null) {
        return [];
      }
      let draftBooks: BookWithDraft[];
      if (this.build == null) {
        // show every book with generated drafts
        draftBooks = booksFromScriptureRange(projectDoc.data.translateConfig.draftConfig.draftedScriptureRange)
          .map(bookNum => ({
            bookNumber: bookNum,
            bookId: Canon.bookNumberToId(bookNum),
            chaptersInBook: projectDoc.data?.texts.find(t => t.bookNum === bookNum)?.chapters.map(ch => ch.number) ?? []
          }))
          .sort((a, b) => a.bookNumber - b.bookNumber);
      } else {
        // TODO: Support books from multiple translation projects
        draftBooks = this.build.additionalInfo?.translationScriptureRanges
          .flatMap(range => booksFromScriptureRange(range.scriptureRange))
          .map(bookNum => {
            const text: TextInfo | undefined = projectDoc.data?.texts.find(t => t.bookNum === bookNum);
            return {
              bookNumber: bookNum,
              bookId: Canon.bookNumberToId(bookNum),
              chaptersInBook: text?.chapters?.map(ch => ch.number) ?? []
            };
          })
          .sort((a, b) => a.bookNumber - b.bookNumber) as BookWithDraft[];
      }
      return draftBooks;
    })
  );

  protected projectParatextId?: string;

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly router: Router
  ) {}

  linkForBookAndChapter(bookId: string, chapterNumber: number): string[] {
    return ['/projects', this.activatedProjectService.projectId!, 'translate', bookId, chapterNumber.toString()];
  }

  navigate(book: BookWithDraft): void {
    void this.router.navigate(this.linkForBookAndChapter(book.bookId, book.chaptersInBook[0] ?? 1), {
      queryParams: { 'draft-active': true, 'draft-timestamp': this.build?.additionalInfo?.dateGenerated }
    });
  }
}
