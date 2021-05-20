import { MdcDialog } from '@angular-mdc/web/dialog';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { getTextDocId } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { combineLatest, merge, Subscription } from 'rxjs';
import { filter, map, tap } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { TextDocId } from '../../core/models/text-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { SFProjectService } from '../../core/sf-project.service';
import { CheckingAccessInfo, CheckingUtils } from '../checking.utils';
import {
  ImportQuestionsDialogComponent,
  ImportQuestionsDialogData
} from '../import-questions-dialog/import-questions-dialog.component';
import { QuestionAnsweredDialogComponent } from '../question-answered-dialog/question-answered-dialog.component';
import { QuestionDialogData } from '../question-dialog/question-dialog.component';
import { QuestionDialogService } from '../question-dialog/question-dialog.service';

@Component({
  selector: 'app-checking-overview',
  templateUrl: './checking-overview.component.html',
  styleUrls: ['./checking-overview.component.scss']
})
export class CheckingOverviewComponent extends DataLoadingComponent implements OnInit, OnDestroy {
  itemVisible: { [bookIdOrDocId: string]: boolean } = {};
  itemVisibleArchived: { [bookIdOrDocId: string]: boolean } = {};
  texts: TextInfo[] = [];
  projectId?: string;

  private _hasTransceleratorQuestions = false;
  private questionDocs = new Map<string, QuestionDoc[]>();
  private textsByBookId: TextsByBookId = {};
  private projectDoc?: SFProjectDoc;
  private dataChangesSub?: Subscription;
  private projectUserConfigDoc?: SFProjectUserConfigDoc;
  private questionsQuery?: RealtimeQuery<QuestionDoc>;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly dialog: MdcDialog,
    noticeService: NoticeService,
    readonly i18n: I18nService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly questionDialogService: QuestionDialogService,
    private readonly pwaService: PwaService,
    private readonly router: Router
  ) {
    super(noticeService);
  }

  get allQuestionsCount(): string {
    return '' + this.allPublishedQuestions.length;
  }

  get myAnswerCount(): string {
    let count: number = 0;
    for (const questionDoc of this.allPublishedQuestions) {
      if (questionDoc.data != null) {
        if (this.canCreateQuestion) {
          count += questionDoc.data.answers.length;
        } else {
          count += questionDoc.data.answers.filter(a => a.ownerRef === this.userService.currentUserId).length;
        }
      }
    }

    return '' + count;
  }

  get myLikeCount(): string {
    let count: number = 0;
    for (const questionDoc of this.allPublishedQuestions) {
      if (questionDoc.data != null) {
        for (const answer of questionDoc.data.answers) {
          if (this.canCreateQuestion) {
            count += answer.likes.length;
          } else {
            count += answer.likes.filter(l => l.ownerRef === this.userService.currentUserId).length;
          }
        }
      }
    }

    return '' + count;
  }

  get myCommentCount(): string {
    let count: number = 0;
    for (const questionDoc of this.allPublishedQuestions) {
      if (questionDoc.data != null) {
        for (const answer of questionDoc.data.answers) {
          if (this.canCreateQuestion) {
            count += answer.comments.length;
          } else {
            count += answer.comments.filter(c => c.ownerRef === this.userService.currentUserId).length;
          }
        }
      }
    }

    return '' + count;
  }

  get canSeeOtherUserResponses(): boolean {
    return this.projectDoc?.data?.checkingConfig.usersSeeEachOthersResponses === true;
  }

  get showImportButton(): boolean {
    return this._hasTransceleratorQuestions && this.pwaService.isOnline;
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

  get allArchivedQuestionsCount(): number {
    if (this.questionsQuery == null) {
      return 0;
    }
    return this.questionsQuery.docs.filter(qd => qd.data != null && qd.data.isArchived).length;
  }

  private get allPublishedQuestions(): QuestionDoc[] {
    if (this.questionsQuery == null) {
      return [];
    }
    return this.questionsQuery.docs.filter(qd => qd.data != null && !qd.data.isArchived);
  }

  ngOnInit(): void {
    let projectDocPromise: Promise<SFProjectDoc>;
    const projectId$ = this.activatedRoute.params.pipe(
      tap(params => {
        this.loadingStarted();
        projectDocPromise = this.projectService.get(params['projectId']);
      }),
      map(params => params['projectId'] as string)
    );
    this.subscribe(projectId$, async projectId => {
      this.loadingStarted();
      this.projectId = projectId;
      try {
        this.projectDoc = await projectDocPromise;
        this.projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
        if (this.questionsQuery != null) {
          this.questionsQuery.dispose();
        }
        this.questionsQuery = await this.projectService.queryQuestions(projectId);
        this.initTexts();
      } finally {
        this.loadingFinished();
      }

      if (this.dataChangesSub != null) {
        this.dataChangesSub.unsubscribe();
      }
      this.dataChangesSub = merge(this.projectDoc.remoteChanges$, this.questionsQuery.remoteChanges$).subscribe(() => {
        if (this.projectDoc != null && this.projectDoc.data != null) {
          if (this.projectDoc.data.checkingConfig.checkingEnabled) {
            this.initTextsWithLoadingIndicator();
          } else {
            if (this.projectUserConfigDoc != null) {
              const checkingAccessInfo: CheckingAccessInfo = {
                userId: this.userService.currentUserId,
                projectId: this.projectDoc.id,
                project: this.projectDoc.data,
                projectUserConfigDoc: this.projectUserConfigDoc
              };
              CheckingUtils.onAppAccessRemoved(checkingAccessInfo, this.router, this.noticeService);
            }
          }
        }
      });
    });
    this.subscribe(
      combineLatest([projectId$, this.pwaService.onlineStatus]).pipe(filter(([_, isOnline]) => isOnline)),
      async ([projectId, _]) => {
        await projectDocPromise;
        this._hasTransceleratorQuestions =
          this.canCreateQuestion && (await this.projectService.hasTransceleratorQuestions(projectId));
      }
    );
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.dataChangesSub != null) {
      this.dataChangesSub.unsubscribe();
    }
    if (this.questionsQuery != null) {
      this.questionsQuery.dispose();
    }
  }

  getTextDocId(bookNum: number, chapter: number): string {
    if (this.projectDoc == null) {
      return '';
    }
    return getTextDocId(this.projectDoc.id, bookNum, chapter);
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
    const textQuestionDocs = this.questionDocs.get(textDocId.toString());
    if (textQuestionDocs == null) {
      return [];
    }
    if (fromArchive) {
      return textQuestionDocs.filter(qd => qd.data != null && qd.data.isArchived);
    }
    return textQuestionDocs.filter(qd => qd.data != null && !qd.data.isArchived);
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
    return count > 0 ? translate('checking_overview.question_count_label', { count: count }) : '';
  }

  timeArchivedStamp(date: string): string {
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
        const answerCount = q.data.answers.length;
        count += answerCount;
      }
    }
    return count;
  }

  answerCountLabel(count?: number): string {
    return count != null && count > 0 ? translate('checking_overview.answer_count_label', { count: count }) : '';
  }

  setQuestionArchiveStatus(questionDoc: QuestionDoc, archiveStatus: boolean) {
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
    if (this.projectDoc == null) {
      return;
    }
    if (questionDoc != null && questionDoc.data != null) {
      if (questionDoc.data.answers.length > 0) {
        const answeredDialogRef = this.dialog.open(QuestionAnsweredDialogComponent);
        const response = (await answeredDialogRef.afterClosed().toPromise()) as string;
        if (response === 'close') {
          return;
        }
      }
    }

    const data: QuestionDialogData = {
      questionDoc,
      textsByBookId: this.textsByBookId,
      projectId: this.projectDoc.id,
      isRightToLeft: this.projectDoc.data?.isRightToLeft
    };
    await this.questionDialogService.questionDialog(data);
    this.initTextsWithLoadingIndicator();
  }

  importDialog(): void {
    if (this.projectDoc == null) {
      return;
    }
    const data: ImportQuestionsDialogData = {
      projectId: this.projectDoc.id,
      userId: this.userService.currentUserId,
      textsByBookId: this.textsByBookId
    };
    this.dialog.open(ImportQuestionsDialogComponent, { data });
  }

  getBookName(text: TextInfo): string {
    return this.i18n.localizeBook(text.bookNum);
  }

  getBookId(text: TextInfo): string {
    return Canon.bookNumberToId(text.bookNum);
  }

  private initTextsWithLoadingIndicator() {
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
    for (const text of this.projectDoc.data.texts) {
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
