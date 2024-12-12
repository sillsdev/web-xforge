import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Router, RouterModule } from '@angular/router';
import { translate, TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { BehaviorSubject, firstValueFrom, map, Observable } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { I18nService } from 'xforge-common/i18n.service';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { TextDocId } from '../../../core/models/text-doc';
import {
  DraftApplyDialogComponent,
  DraftApplyDialogConfig as DraftApplyDialogData,
  DraftApplyDialogResult
} from '../draft-apply-dialog/draft-apply-dialog.component';
import {
  DraftApplyProgress,
  DraftApplyProgressDialogComponent
} from '../draft-apply-progress-dialog/draft-apply-progress-dialog.component';
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

  draftApplyProgress$: BehaviorSubject<DraftApplyProgress | undefined> = new BehaviorSubject<
    DraftApplyProgress | undefined
  >(undefined);

  private applyChapters: number[] = [];
  private draftApplyBookNum: number = 0;
  private chaptersApplied: number[] = [];

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly i18n: I18nService,
    private readonly userService: UserService,
    private readonly draftHandlingService: DraftHandlingService,
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

  get numChaptersApplied(): number {
    return this.chaptersApplied.length;
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

  async chooseProjectToAddDraft(bookWithDraft: BookWithDraft, paratextId?: string): Promise<void> {
    const dialogData: DraftApplyDialogData = {
      bookNum: bookWithDraft.bookNumber,
      chapters: bookWithDraft.chaptersWithDrafts,
      paratextId: paratextId
    };
    const dialogRef: MatDialogRef<DraftApplyDialogComponent, DraftApplyDialogResult> = this.dialogService.openMatDialog(
      DraftApplyDialogComponent,
      { data: dialogData, width: '600px' }
    );
    const result: DraftApplyDialogResult | undefined = await firstValueFrom(dialogRef.afterClosed());
    if (result == null || result.projectId == null) {
      return;
    }
    await this.applyBookDraftAsync(bookWithDraft, result.projectId);
  }

  async addDraftToCurrentProject(bookWithDraft: BookWithDraft): Promise<void> {
    if (!bookWithDraft.canEdit) {
      await this.dialogService.message(translate('draft_preview_books.no_permission_to_edit_book'));
      return;
    }

    await this.chooseProjectToAddDraft(bookWithDraft, this.activatedProjectService.projectDoc.data.paratextId);
  }

  private async applyBookDraftAsync(bookWithDraft: BookWithDraft, alternateProjectId?: string): Promise<void> {
    this.applyChapters = bookWithDraft.chaptersWithDrafts;
    this.draftApplyBookNum = bookWithDraft.bookNumber;
    this.chaptersApplied = [];
    this.updateProgress();

    const promises: Promise<boolean>[] = [];
    const project: SFProjectProfile = this.activatedProjectService.projectDoc!.data!;
    for (const chapter of bookWithDraft.chaptersWithDrafts) {
      const draftTextDocId = new TextDocId(this.activatedProjectService.projectId!, bookWithDraft.bookNumber, chapter);
      const targetTextDocId = new TextDocId(
        alternateProjectId ?? this.activatedProjectService.projectId!,
        bookWithDraft.bookNumber,
        chapter
      );
      promises.push(this.applyAndReportChapter(project, draftTextDocId, targetTextDocId));
    }

    try {
      this.openProgressDialog();
      const results: boolean[] = await Promise.all(promises);
      if (results.some(result => !result)) {
        this.updateProgress(undefined, true);
        // The draft is in the legacy format. This can only be applied chapter by chapter.
        return;
      }
    } catch (error) {
      this.updateProgress(undefined, true);
      // report the error to bugsnag
      this.errorReportingService.silentError(
        'Error while trying to apply a draft',
        ErrorReportingService.normalizeError(error)
      );
    }
  }

  navigate(book: BookWithDraft): void {
    this.router.navigate(this.linkForBookAndChapter(book.bookNumber, book.chaptersWithDrafts[0]), {
      queryParams: { 'draft-active': true }
    });
  }

  openProgressDialog(): void {
    this.dialogService.openMatDialog(DraftApplyProgressDialogComponent, {
      data: { draftApplyProgress$: this.draftApplyProgress$ },
      disableClose: true
    });
  }

  private async applyAndReportChapter(
    project: SFProjectProfile,
    draftTextDocId: TextDocId,
    targetTextDocId: TextDocId
  ): Promise<boolean> {
    return await this.draftHandlingService
      .getAndApplyDraftAsync(project, draftTextDocId, targetTextDocId)
      .then(result => {
        this.updateProgress(result ? targetTextDocId.chapterNum : undefined);
        return result;
      });
  }

  private updateProgress(bookCompleted?: number, completed?: boolean): void {
    if (bookCompleted != null) {
      this.chaptersApplied.push(bookCompleted);
    }
    this.draftApplyProgress$.next({
      bookNum: this.draftApplyBookNum,
      chapters: this.applyChapters,
      chaptersApplied: this.chaptersApplied,
      completed: !!completed ? completed : this.chaptersApplied.length === this.applyChapters.length
    });
  }
}
