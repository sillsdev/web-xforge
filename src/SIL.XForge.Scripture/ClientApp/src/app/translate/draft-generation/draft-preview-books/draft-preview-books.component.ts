import { AsyncPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { Router } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { map, Observable, tap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UserService } from 'xforge-common/user.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectService } from '../../../core/sf-project.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { booksFromScriptureRange } from '../../../shared/utils';

export interface BookWithDraft {
  bookNumber: number;
  bookId: string;
  canEdit: boolean;
  chaptersWithDrafts: number[];
  draftApplied: boolean;
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
        draftBooks = projectDoc.data.texts
          .map(text => ({
            bookNumber: text.bookNum,
            bookId: Canon.bookNumberToId(text.bookNum),
            canEdit: text.permissions[this.userService.currentUserId] === TextInfoPermission.Write,
            chaptersWithDrafts: this.projectService.hasDraft(projectDoc.data, text.bookNum)
              ? text.chapters.map(chapter => chapter.number)
              : [],
            draftApplied: text.chapters.every(chapter => chapter.draftApplied)
          }))
          .sort((a, b) => a.bookNumber - b.bookNumber)
          .filter(book => book.chaptersWithDrafts.length > 0) as BookWithDraft[];
      } else {
        // TODO: Support books from multiple translation projects
        draftBooks = this.build.additionalInfo?.translationScriptureRanges
          .flatMap(range => booksFromScriptureRange(range.scriptureRange))
          .map(bookNum => {
            const text: TextInfo | undefined = projectDoc.data?.texts.find(t => t.bookNum === bookNum);
            return {
              bookNumber: bookNum,
              bookId: Canon.bookNumberToId(bookNum),
              canEdit: text?.permissions?.[this.userService.currentUserId] === TextInfoPermission.Write,
              chaptersWithDrafts: text?.chapters?.map(ch => ch.number) ?? [],
              draftApplied: text?.chapters?.every(ch => ch.draftApplied) ?? false
            };
          })
          // Do not filter chapters with drafts, as the book or chapters may have been removed.
          // We still want to display these books to the user, but disabled so they cannot interact with them.
          .sort((a, b) => a.bookNumber - b.bookNumber) as BookWithDraft[];
      }
      return draftBooks;
    })
  );

  protected projectParatextId?: string;

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly userService: UserService,
    private readonly router: Router,
    private readonly projectService: SFProjectService
  ) {}

  linkForBookAndChapter(bookId: string, chapterNumber: number): string[] {
    return ['/projects', this.activatedProjectService.projectId!, 'translate', bookId, chapterNumber.toString()];
  }

  navigate(book: BookWithDraft): void {
    void this.router.navigate(this.linkForBookAndChapter(book.bookId, book.chaptersWithDrafts[0]), {
      queryParams: { 'draft-active': true, 'draft-timestamp': this.build?.additionalInfo?.dateGenerated }
    });
  }
}
