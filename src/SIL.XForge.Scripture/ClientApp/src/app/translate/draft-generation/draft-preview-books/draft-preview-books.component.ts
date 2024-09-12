import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Router, RouterModule } from '@angular/router';
import { TranslocoModule, translate } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { Observable, firstValueFrom, map } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoticeService } from 'xforge-common/notice.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { TextDocId } from '../../../core/models/text-doc';
import { DraftApplyDialogComponent, DraftApplyDialogResult } from '../draft-apply-dialog/draft-apply-dialog.component';
import { DraftHandlingService } from '../draft-handling.service';

export interface BookWithDraft {
  bookNumber: number;
  canEdit: boolean;
  chaptersWithDrafts: number[];
  draftApplied: boolean;
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
          canEdit: text.permissions[this.userService.currentUserId] === TextInfoPermission.Write,
          chaptersWithDrafts: text.chapters.filter(chapter => chapter.hasDraft).map(chapter => chapter.number),
          draftApplied: text.chapters.filter(chapter => chapter.hasDraft).every(chapter => chapter.draftApplied)
        }))
        .sort((a, b) => a.bookNumber - b.bookNumber)
        .filter(book => book.chaptersWithDrafts.length > 0) as BookWithDraft[];
      return draftBooks;
    })
  );

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly i18n: I18nService,
    private readonly userService: UserService,
    private readonly draftHandlingService: DraftHandlingService,
    private readonly noticeService: NoticeService,
    private readonly dialogService: DialogService,
    private readonly errorReportingService: ErrorReportingService,
    private readonly router: Router
  ) {}

  get isProjectAdmin$(): Observable<boolean> {
    return this.activatedProjectService.changes$.pipe(
      filterNullish(),
      map(p => p.data?.userRoles[this.userService.currentUserId] === SFProjectRole.ParatextAdministrator)
    );
  }

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

  async chooseAlternateProjectToAddDraft(bookWithDraft: BookWithDraft): Promise<void> {
    const dialogRef: MatDialogRef<DraftApplyDialogComponent, DraftApplyDialogResult> = this.dialogService.openMatDialog(
      DraftApplyDialogComponent,
      { data: { bookNum: bookWithDraft.bookNumber }, width: '600px' }
    );
    const result: DraftApplyDialogResult | undefined = await firstValueFrom(dialogRef.afterClosed());
    if (result == null || result.projectId == null) {
      return;
    }
    await this.applyBookDraftAsync(bookWithDraft, result.projectId);
  }

  async confirmAndAddToProjectAsync(bookWithDraft: BookWithDraft): Promise<void> {
    if (!bookWithDraft.canEdit) {
      await this.dialogService.message(translate('draft_preview_books.no_permission_to_edit_book'));
      return;
    }

    const bookName: string = this.bookNumberToName(bookWithDraft.bookNumber);
    const confirmed = await this.dialogService.confirmWithOptions({
      title: bookWithDraft.draftApplied
        ? this.i18n.translate('draft_add_dialog.readd_book_to_project', { bookName })
        : this.i18n.translate('draft_add_dialog.add_book_to_project', { bookName }),
      message: this.i18n.translate('draft_add_dialog.book_contents_will_be_overwritten', { bookName }),
      affirmative: bookWithDraft.draftApplied ? 'draft_add_dialog.readd_to_project' : 'draft_add_dialog.add_to_project'
    });

    if (!confirmed) return;

    await this.applyBookDraftAsync(bookWithDraft);
  }

  private async applyBookDraftAsync(bookWithDraft: BookWithDraft, alternateProjectId?: string): Promise<void> {
    const promises: Promise<boolean>[] = [];
    const bookName: string = this.bookNumberToName(bookWithDraft.bookNumber);
    const project: SFProjectProfile = this.activatedProjectService.projectDoc!.data!;
    for (const chapter of bookWithDraft.chaptersWithDrafts) {
      const draftTextDocId = new TextDocId(this.activatedProjectService.projectId!, bookWithDraft.bookNumber, chapter);
      const targetTextDocId = new TextDocId(
        alternateProjectId ?? this.activatedProjectService.projectId!,
        bookWithDraft.bookNumber,
        chapter
      );
      promises.push(this.draftHandlingService.getAndApplyDraftAsync(project, draftTextDocId, targetTextDocId));
    }

    try {
      const results: boolean[] = await Promise.all(promises);
      if (results.some(result => !result)) {
        // The draft is in the legacy format. This can only be applied chapter by chapter.
        this.dialogService.message(translate('draft_preview_books.one_or_more_drafts_failed'));
        return;
      }
      this.noticeService.show(translate('draft_preview_books.draft_successfully_applied', { bookName }));
    } catch (error) {
      // report the error to bugsnag
      this.errorReportingService.silentError(
        'Error while trying to apply a draft',
        ErrorReportingService.normalizeError(error)
      );
      this.dialogService.message(translate('draft_preview_books.one_or_more_drafts_failed'));
    }
  }

  navigate(book: BookWithDraft): void {
    this.router.navigate(this.linkForBookAndChapter(book.bookNumber, book.chaptersWithDrafts[0]), {
      queryParams: { 'draft-active': true }
    });
  }
}
