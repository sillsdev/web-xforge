import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Input } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';
import { Router, RouterModule } from '@angular/router';
import { TranslocoModule } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { BehaviorSubject, firstValueFrom, map, Observable, tap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { DialogService } from 'xforge-common/dialog.service';
import { ErrorReportingService } from 'xforge-common/error-reporting.service';
import { I18nService } from 'xforge-common/i18n.service';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { UserService } from 'xforge-common/user.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { SFProjectProfileDoc } from '../../../core/models/sf-project-profile-doc';
import { TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
import { TextDocService } from '../../../core/text-doc.service';
import { BuildDto } from '../../../machine-api/build-dto';
import { booksFromScriptureRange } from '../../../shared/utils';
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
            canEdit: text.permissions[this.userService.currentUserId] === TextInfoPermission.Write,
            chaptersWithDrafts: text.chapters.filter(chapter => chapter.hasDraft).map(chapter => chapter.number),
            draftApplied: text.chapters.filter(chapter => chapter.hasDraft).every(chapter => chapter.draftApplied)
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
              canEdit: text?.permissions?.[this.userService.currentUserId] === TextInfoPermission.Write,
              chaptersWithDrafts: text?.chapters?.map(ch => ch.number) ?? [],
              draftApplied: text?.chapters?.filter(ch => ch.hasDraft).every(ch => ch.draftApplied) ?? false
            };
          })
          // Do not filter chapters with drafts, as the book or chapters may have been removed.
          // We still want to display these books to the user, but disabled so they cannot interact with them.
          .sort((a, b) => a.bookNumber - b.bookNumber) as BookWithDraft[];
      }
      return draftBooks;
    })
  );

  draftApplyProgress$: BehaviorSubject<DraftApplyProgress | undefined> = new BehaviorSubject<
    DraftApplyProgress | undefined
  >(undefined);

  protected projectParatextId?: string;

  private applyChapters: number[] = [];
  private draftApplyBookNum: number = 0;
  private chaptersApplied: number[] = [];

  constructor(
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly projectService: SFProjectService,
    private readonly i18n: I18nService,
    private readonly userService: UserService,
    private readonly draftHandlingService: DraftHandlingService,
    private readonly dialogService: DialogService,
    private readonly textDocService: TextDocService,
    private readonly errorReportingService: ErrorReportingService,
    private readonly router: Router,
    private readonly destroyRef: DestroyRef
  ) {}

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
      initialParatextId: paratextId,
      bookNum: bookWithDraft.bookNumber,
      chapters: bookWithDraft.chaptersWithDrafts
    };
    const dialogRef: MatDialogRef<DraftApplyDialogComponent, DraftApplyDialogResult> = this.dialogService.openMatDialog(
      DraftApplyDialogComponent,
      { data: dialogData, width: '600px' }
    );
    const result: DraftApplyDialogResult | undefined = await firstValueFrom(dialogRef.afterClosed());
    if (result == null || result.projectId == null) {
      return;
    }

    const projectDoc: SFProjectProfileDoc = await this.projectService.subscribeProfile(
      result.projectId,
      new DocSubscription('DraftPreviewBooksComponent', this.destroyRef)
    );
    const projectTextInfo: TextInfo = projectDoc.data?.texts.find(
      t => t.bookNum === bookWithDraft.bookNumber && t.chapters
    )!;

    const projectChapters: number[] = projectTextInfo.chapters.map(c => c.number);
    const missingChapters: number[] = bookWithDraft.chaptersWithDrafts.filter(c => !projectChapters.includes(c));
    if (missingChapters.length > 0) {
      await this.projectService.onlineAddChapters(result.projectId, bookWithDraft.bookNumber, missingChapters);
      for (const chapter of missingChapters) {
        const textDocId = new TextDocId(result.projectId, bookWithDraft.bookNumber, chapter);
        await this.textDocService.createTextDoc(
          textDocId,
          new DocSubscription('DraftPreviewBooksComponent', this.destroyRef)
        );
      }
    }
    await this.applyBookDraftAsync(bookWithDraft, result.projectId);
  }

  private async applyBookDraftAsync(bookWithDraft: BookWithDraft, projectId: string): Promise<void> {
    this.applyChapters = bookWithDraft.chaptersWithDrafts;
    this.draftApplyBookNum = bookWithDraft.bookNumber;
    this.chaptersApplied = [];
    this.updateProgress();

    const promises: Promise<boolean>[] = [];
    const project: SFProjectProfile = this.activatedProjectService.projectDoc!.data!;
    for (const chapter of bookWithDraft.chaptersWithDrafts) {
      const draftTextDocId = new TextDocId(this.activatedProjectService.projectId!, bookWithDraft.bookNumber, chapter);
      const targetTextDocId = new TextDocId(projectId, bookWithDraft.bookNumber, chapter);
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
      queryParams: { 'draft-active': true, 'draft-timestamp': this.build?.additionalInfo?.dateGenerated }
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
    let timestamp: Date | undefined = undefined;
    if (this.build?.additionalInfo?.dateGenerated != null) {
      timestamp = new Date(this.build.additionalInfo.dateGenerated);
    }
    return await this.draftHandlingService
      .getAndApplyDraftAsync(project, draftTextDocId, targetTextDocId, timestamp)
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
