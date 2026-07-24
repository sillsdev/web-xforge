import { AsyncPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { map, Observable, tap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { BuildDto } from '../../../machine-api/build-dto';
import { expectedBookChapters } from '../../../shared/progress-service/progress.service';
import { ChapterSet, VerboseScriptureRange } from '../../../shared/scripture-range';

export interface BookWithDraft {
  bookNumber: number;
  bookId: string;
  chaptersInBook: number[];
  /** Chapters drafted for this book, sorted. Empty for a whole-book draft or when the draft has no chapter detail. */
  draftedChapters: number[];
  /** Compact range of drafted chapters (e.g. "30-32"), set only when part of the book was drafted. */
  draftedChapterRange?: string;
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
      const texts = projectDoc.data.texts;
      let rangeStrings: string[];
      if (this.build == null) {
        // Every book with generated drafts, combined across previous drafts.
        rangeStrings = [projectDoc.data.translateConfig.draftConfig.draftedScriptureRange ?? ''];
      } else {
        // TODO: Support books from multiple translation projects
        rangeStrings = (this.build.additionalInfo?.translationScriptureRanges ?? []).map(range => range.scriptureRange);
      }
      return this.booksWithDraft(VerboseScriptureRange.fromCombinedRanges(rangeStrings), texts);
    })
  );

  protected projectParatextId?: string;

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly router: Router,
    readonly i18n: I18nService
  ) {}

  linkForBookAndChapter(bookId: string, chapterNumber: number): string[] {
    return ['/projects', this.activatedProjectService.projectId!, 'translate', bookId, chapterNumber.toString()];
  }

  navigate(book: BookWithDraft): void {
    // Go to the first drafted chapter (for a partial draft this is not chapter 1); fall back to the book's first
    // chapter, then to chapter 1.
    const firstChapter = book.draftedChapters[0] ?? book.chaptersInBook[0] ?? 1;
    void this.router.navigate(this.linkForBookAndChapter(book.bookId, firstChapter), {
      queryParams: { 'draft-active': true, 'draft-timestamp': this.build?.additionalInfo?.dateGenerated }
    });
  }

  /** Builds the per-book draft info, skipping non-canonical/unknown books, sorted in canonical order. */
  private booksWithDraft(draftedRange: VerboseScriptureRange, texts: TextInfo[]): BookWithDraft[] {
    const books: BookWithDraft[] = [];
    for (const [bookId, draftedChapterSet] of draftedRange.books) {
      const bookNumber = Canon.bookIdToNumber(bookId);
      if (bookNumber <= 0) {
        continue;
      }
      const chaptersInBook = texts.find(t => t.bookNum === bookNumber)?.chapters.map(ch => ch.number) ?? [];
      const draftedChapters = [...draftedChapterSet.chapters].sort((a, b) => a - b);
      // Show a range only when part of the book was drafted. "Whole book" is the canonical chapter count
      // (expectedBookChapters), not the target's current chapters, which may only contain what has been drafted so
      // far. A chapter-less range (a legacy or whole-book draft) has no drafted chapters and shows no range.
      // Assumption: the canonical count comes from eng.vrs, so for a project using a different versification this can
      // be off by a chapter at the end of a book. The exact reference would be the drafting source's chapter count,
      // which is not available in this component.
      const onlyPartDrafted = draftedChapters.length > 0 && draftedChapters.length < expectedBookChapters(bookId);
      books.push({
        bookNumber: bookNumber,
        bookId: bookId,
        chaptersInBook: chaptersInBook,
        draftedChapters: draftedChapters,
        draftedChapterRange: onlyPartDrafted ? new ChapterSet(draftedChapters).toStringForDisplay() : undefined
      });
    }
    return books.sort((a, b) => a.bookNumber - b.bookNumber);
  }
}
