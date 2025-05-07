import { Component, DestroyRef, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { Canon } from '@sillsdev/scripture';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { Chapter, TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { asyncScheduler, merge, Subscription } from 'rxjs';
import { map, tap, throttleTime } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { L10nNumberPipe } from 'xforge-common/l10n-number.pipe';
import { DocSubscription } from 'xforge-common/models/realtime-doc';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { TextDocId } from '../../core/models/text-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { CheckingUtils } from '../checking.utils';
import { CheckingQuestionsService } from '../checking/checking-questions.service';
import {
  ImportQuestionsDialogComponent,
  ImportQuestionsDialogData
} from '../import-questions-dialog/import-questions-dialog.component';
import { QuestionDialogData } from '../question-dialog/question-dialog.component';
import { QuestionDialogService } from '../question-dialog/question-dialog.service';
@Component({
  selector: 'app-checking-overview',
  templateUrl: './checking-overview.component.html',
  styleUrls: ['./checking-overview.component.scss']
})
export class CheckingOverviewComponent extends DataLoadingComponent implements OnInit, OnDestroy {
  texts: TextInfo[] = [];
  projectId?: string;

  private questionDocs = new Map<string, QuestionDoc[]>();
  private textsByBookId?: TextsByBookId;
  private projectDoc?: SFProjectProfileDoc;
  private dataChangesSub?: Subscription;
  private projectUserConfigDoc?: SFProjectUserConfigDoc;
  private questionsQuery?: RealtimeQuery<QuestionDoc>;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly activatedRoute: ActivatedRoute,
    private readonly dialogService: DialogService,
    noticeService: NoticeService,
    readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    private readonly checkingQuestionsService: CheckingQuestionsService,
    private readonly userService: UserService,
    private readonly questionDialogService: QuestionDialogService,
    private readonly permissions: PermissionsService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly l10nNumberPipe: L10nNumberPipe
  ) {
    super(noticeService);
  }

  get showQuestionsLoadingMessage(): boolean {
    return !this.questionsLoaded && this.allQuestionsCount === 0;
  }

  get showArchivedQuestionsLoadingMessage(): boolean {
    return !this.questionsLoaded && (this.questionsQuery?.docs ?? []).filter(qd => qd.data?.isArchived).length === 0;
  }

  get showNoQuestionsMessage(): boolean {
    return this.questionsLoaded && this.allQuestionsCount === 0;
  }

  get showNoArchivedQuestionsMessage(): boolean {
    return (
      this.questionsLoaded && this.questionsQuery?.docs.filter(qd => qd.data != null && qd.data.isArchived).length === 0
    );
  }

  get allQuestionsCount(): number {
    return this.allPublishedQuestions.length;
  }

  get myAnswerCount(): number {
    let count: number = 0;
    const canCreateQuestion = this.canCreateQuestion;
    const currentUserId = this.userService.currentUserId;
    for (const questionDoc of this.allPublishedQuestions) {
      if (questionDoc.data != null) {
        if (canCreateQuestion) {
          count += questionDoc.getAnswers().length;
        } else {
          count += questionDoc.getAnswers(currentUserId).length;
        }
      }
    }

    return count;
  }

  get myLikeCount(): number {
    let count: number = 0;
    const canCreateQuestion = this.canCreateQuestion;
    const currentUserId = this.userService.currentUserId;
    for (const questionDoc of this.allPublishedQuestions) {
      if (questionDoc.data != null) {
        for (const answer of questionDoc.getAnswers()) {
          if (canCreateQuestion) {
            count += answer.likes.length;
          } else {
            count += answer.likes.filter(l => l.ownerRef === currentUserId).length;
          }
        }
      }
    }

    return count;
  }

  get myCommentCount(): number {
    let count: number = 0;
    const canCreateQuestion = this.canCreateQuestion;
    const currentUserId = this.userService.currentUserId;
    for (const questionDoc of this.allPublishedQuestions) {
      if (questionDoc.data != null) {
        for (const answer of questionDoc.getAnswers()) {
          if (canCreateQuestion) {
            count += answer.comments.filter(c => !c.deleted).length;
          } else {
            count += answer.comments.filter(c => c.ownerRef === currentUserId && !c.deleted).length;
          }
        }
      }
    }

    return count;
  }

  get canSeeOtherUserResponses(): boolean {
    return this.projectDoc?.data?.checkingConfig.usersSeeEachOthersResponses === true;
  }

  get showImportButton(): boolean {
    return this.projectDoc != null && this.textsByBookId != null && Object.keys(this.textsByBookId).length > 0;
  }

  get canCreateQuestion(): boolean {
    const project = this.projectDoc?.data;
    const userId = this.userService.currentUserId;
    return project != null && SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.Questions, Operation.Create);
  }

  get canEditQuestion(): boolean {
    const project = this.projectDoc?.data;
    const userId = this.userService.currentUserId;
    return project != null && SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.Questions, Operation.Edit);
  }

  private get allPublishedQuestions(): QuestionDoc[] {
    if (this.questionsQuery == null) {
      return [];
    }
    return this.questionsQuery.docs.filter(qd => qd.data != null && !qd.data.isArchived);
  }

  private get questionsLoaded(): boolean {
    // if the user is offline, 'ready' will never be true, but the query will still return the offline docs
    return !this.onlineStatusService.isOnline || this.questionsQuery?.ready === true;
  }

  ngOnInit(): void {
    let projectDocPromise: Promise<SFProjectProfileDoc>;
    const projectId$ = this.activatedRoute.params.pipe(
      tap(params => {
        this.loadingStarted();
        projectDocPromise = this.projectService.getProfile(
          params['projectId'],
          new DocSubscription('CheckingOverviewComponent', this.destroyRef)
        );
      }),
      map(params => params['projectId'] as string)
    );
    projectId$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(async projectId => {
      this.loadingStarted();
      this.projectId = projectId;
      try {
        this.projectDoc = await projectDocPromise;
        this.projectUserConfigDoc = await this.projectService.getUserConfig(
          projectId,
          this.userService.currentUserId,
          new DocSubscription('CheckingOverviewComponent', this.destroyRef)
        );
        this.questionsQuery?.dispose();
        this.questionsQuery = await this.checkingQuestionsService.queryQuestions(
          projectId,
          { sort: true },
          this.destroyRef
        );
        this.initTexts();
      } finally {
        this.loadingFinished();
      }

      if (this.dataChangesSub != null) {
        this.dataChangesSub.unsubscribe();
      }
      this.dataChangesSub = merge(
        this.projectDoc.remoteChanges$,
        this.questionsQuery.remoteChanges$,
        this.questionsQuery.localChanges$
      )
        // TODO Find a better solution than merely throttling remote changes
        .pipe(throttleTime(1000, asyncScheduler, { leading: true, trailing: true }))
        .subscribe(() => {
          if (this.projectDoc != null && this.projectDoc.data != null) {
            if (this.permissions.canAccessCommunityChecking(this.projectDoc)) {
              this.initTextsWithLoadingIndicator();
            }
          }
        });
    });
  }

  ngOnDestroy(): void {
    this.dataChangesSub?.unsubscribe();
    this.questionsQuery?.dispose();
  }

  getRouterLink(bookId: string): string[] {
    if (this.projectId == null) {
      return [];
    }
    return ['/projects', this.projectId, 'checking', bookId];
  }

  getTextDocIdType(bookNum: number, chapter: number): TextDocId | undefined {
    if (this.projectDoc == null) {
      return undefined;
    }
    return new TextDocId(this.projectDoc.id, bookNum, chapter);
  }

  getQuestionDocs(textDocId: TextDocId | undefined, fromArchive = false): QuestionDoc[] {
    if (textDocId == null) {
      return [];
    }
    return (this.questionDocs.get(textDocId.toString()) || [])
      .filter(qd => qd.data?.isArchived === fromArchive)
      .sort((a, b) => a.data!.verseRef.verseNum - b.data!.verseRef.verseNum);
  }

  bookQuestionCount(text: TextInfo, fromArchive = false): number {
    let count: number = 0;
    for (const chapter of text.chapters) {
      const questionCount = this.questionCount(text.bookNum, chapter.number, fromArchive);
      count += questionCount;
    }
    return count;
  }

  questionCount(bookNumber: number, chapterNumber: number, fromArchive = false): number {
    if (this.projectDoc == null) {
      return 0;
    }
    const id = new TextDocId(this.projectDoc.id, bookNumber, chapterNumber);
    const questionDocs = this.getQuestionDocs(id, fromArchive);
    return questionDocs.length;
  }

  questionCountLabel(count: number): string {
    return translate('checking_overview.question_count_label', { count: count });
  }

  timeArchivedStamp(date: string | undefined): string {
    if (date == null) {
      return '';
    }
    return translate('checking_overview.time_archived_stamp', { timeStamp: this.i18n.formatDate(new Date(date)) });
  }

  bookAnswerCount(text: TextInfo): number {
    let count: number = 0;
    for (const chapter of text.chapters) {
      const answerCount = this.chapterAnswerCount(text.bookNum, chapter.number);
      count += answerCount;
    }
    return count;
  }

  chapterAnswerCount(bookNum: number, chapterNumber: number): number {
    if (this.projectDoc == null) {
      return 0;
    }
    const id = new TextDocId(this.projectDoc.id, bookNum, chapterNumber);
    let count: number = 0;
    for (const q of this.getQuestionDocs(id)) {
      if (q.data != null) {
        const answerCount = q.getAnswers().length;
        count += answerCount;
      }
    }
    return count;
  }

  answerCountLabel(count?: number): string {
    return count != null && count > 0
      ? translate('checking_overview.answer_count_label', { count: this.l10nNumberPipe.transform(count) })
      : '';
  }

  async setArchiveStatusForQuestionsInBook(text: TextInfo, archive: boolean): Promise<void> {
    if (await this.confirmArchiveQuestions(archive, this.i18n.localizeBook(text.bookNum))) {
      for (const chapter of text.chapters) {
        for (const questionDoc of this.getQuestionDocs(this.getTextDocIdType(text.bookNum, chapter.number), !archive)) {
          if (questionDoc.data!.isArchived !== archive) this.setQuestionArchiveStatus(questionDoc, archive);
        }
      }
    }
  }

  async setArchiveStatusForQuestionsInChapter(text: TextInfo, chapter: Chapter, archive: boolean): Promise<void> {
    if (await this.confirmArchiveQuestions(archive, this.i18n.localizeBook(text.bookNum) + ' ' + chapter.number)) {
      for (const questionDoc of this.getQuestionDocs(this.getTextDocIdType(text.bookNum, chapter.number), !archive)) {
        if (questionDoc.data!.isArchived !== archive) this.setQuestionArchiveStatus(questionDoc, archive);
      }
    }
  }

  setQuestionArchiveStatus(questionDoc: QuestionDoc, archiveStatus: boolean): void {
    questionDoc.submitJson0Op(op => {
      op.set(q => q.isArchived, archiveStatus);
      if (archiveStatus) {
        op.set(q => q.dateArchived!, new Date().toJSON());
      } else {
        op.unset(q => q.dateArchived!);
      }
    });
  }

  overallProgress(): number[] {
    let totalUnread: number = 0;
    let totalRead: number = 0;
    let totalAnswered: number = 0;
    for (const text of this.texts) {
      const [unread, read, answered] = this.bookProgress(text);
      totalUnread += unread;
      totalRead += read;
      totalAnswered += answered;
    }

    return [totalUnread, totalRead, totalAnswered];
  }

  bookHasChapterAudio(text: TextInfo): boolean {
    return text.chapters.filter((c: Chapter) => c.hasAudio).length > 0;
  }

  bookProgress(text: TextInfo): number[] {
    let unread: number = 0;
    let read: number = 0;
    let answered: number = 0;
    if (this.projectId != null) {
      for (const chapter of text.chapters) {
        const id = new TextDocId(this.projectId, text.bookNum, chapter.number);
        for (const questionDoc of this.getQuestionDocs(id)) {
          if (CheckingUtils.hasUserAnswered(questionDoc.data, this.userService.currentUserId)) {
            answered++;
          } else if (
            this.projectUserConfigDoc != null &&
            CheckingUtils.hasUserReadQuestion(questionDoc.data, this.projectUserConfigDoc.data)
          ) {
            read++;
          } else {
            unread++;
          }
        }
      }
    }
    return [unread, read, answered];
  }

  async questionDialog(questionDoc?: QuestionDoc): Promise<void> {
    if (this.projectDoc == null || this.textsByBookId == null) {
      return;
    }
    if (questionDoc?.data != null && questionDoc.getAnswers().length > 0) {
      const confirm = await this.dialogService.confirm(
        'question_answered_dialog.question_has_answer',
        'question_answered_dialog.edit_anyway'
      );
      if (!confirm) {
        return;
      }
    }

    const data: QuestionDialogData = {
      questionDoc,
      projectDoc: this.projectDoc,
      textsByBookId: this.textsByBookId,
      projectId: this.projectDoc.id,
      isRightToLeft: this.projectDoc.data?.isRightToLeft
    };
    await this.questionDialogService.questionDialog(data);
    this.initTextsWithLoadingIndicator();
  }

  importDialog(): void {
    if (this.projectDoc == null || this.textsByBookId == null) {
      return;
    }
    const data: ImportQuestionsDialogData = {
      projectId: this.projectDoc.id,
      userId: this.userService.currentUserId,
      textsByBookId: this.textsByBookId
    };
    this.dialogService.openMatDialog(ImportQuestionsDialogComponent, { data });
  }

  getBookName(text: TextInfo): string {
    return this.i18n.localizeBook(text.bookNum);
  }

  getBookId(text: TextInfo): string {
    return Canon.bookNumberToId(text.bookNum);
  }

  private async confirmArchiveQuestions(archive: boolean, scope: string): Promise<boolean> {
    return await this.dialogService.confirm(
      this.i18n.translate(`checking_overview.${archive ? 'confirm_bulk_archive' : 'confirm_bulk_republish'}`, {
        scope
      }),
      `checking_overview.${archive ? 'archive' : 'republish'}`
    );
  }

  private initTextsWithLoadingIndicator(): void {
    this.loadingStarted();
    try {
      this.initTexts();
    } finally {
      this.loadingFinished();
    }
  }

  private initTexts(): void {
    if (this.projectDoc == null || this.projectDoc.data == null || this.questionsQuery == null) {
      return;
    }

    this.questionDocs.clear();
    this.textsByBookId = {};
    this.texts = [];
    for (const text of this.projectDoc.data.texts.slice().sort((a, b) => a.bookNum - b.bookNum)) {
      // ignore empty books
      if (text.chapters.length === 1 && text.chapters[0].lastVerse === 0) {
        continue;
      }
      this.textsByBookId[Canon.bookNumberToId(text.bookNum)] = text;
      this.texts.push(text);
      for (const chapter of text.chapters) {
        const textId = new TextDocId(this.projectDoc.id, text.bookNum, chapter.number);
        this.questionDocs.set(textId.toString(), []);
      }
    }

    for (const questionDoc of this.questionsQuery.docs) {
      this.addQuestionDoc(questionDoc);
    }
  }

  private addQuestionDoc(questionDoc: QuestionDoc): void {
    if (this.projectDoc == null || questionDoc.data == null) {
      return;
    }
    const textId = new TextDocId(
      this.projectDoc.id,
      questionDoc.data.verseRef.bookNum,
      questionDoc.data.verseRef.chapterNum
    );
    const textQuestionDocs = this.questionDocs.get(textId.toString());
    if (textQuestionDocs != null) {
      textQuestionDocs.push(questionDoc);
    }
  }
}
