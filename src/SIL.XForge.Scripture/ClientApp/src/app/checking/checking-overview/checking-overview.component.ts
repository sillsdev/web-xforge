import { MdcDialog } from '@angular-mdc/web/dialog';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { translate } from '@ngneat/transloco';
import { distanceInWordsToNow } from 'date-fns';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { getTextDocId } from 'realtime-server/lib/scriptureforge/models/text-data';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { merge, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { TextDocId } from '../../core/models/text-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { SFProjectService } from '../../core/sf-project.service';
import { CheckingUtils } from '../checking.utils';
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
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly questionDialogService: QuestionDialogService
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
        if (this.isProjectAdmin) {
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
          if (this.isProjectAdmin) {
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
          if (this.isProjectAdmin) {
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
    return (
      this.projectDoc != null &&
      this.projectDoc.data != null &&
      this.projectDoc.data.checkingConfig.usersSeeEachOthersResponses
    );
  }

  get isProjectAdmin(): boolean {
    return (
      this.projectDoc != null &&
      this.projectDoc.data != null &&
      this.projectDoc.data.userRoles[this.userService.currentUserId] === SFProjectRole.ParatextAdministrator
    );
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
    this.subscribe(this.activatedRoute.params.pipe(map(params => params['projectId'])), async projectId => {
      this.loadingStarted();
      this.projectId = projectId;
      try {
        this.projectDoc = await this.projectService.get(projectId);
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
        this.loadingStarted();
        try {
          this.initTexts();
        } finally {
          this.loadingFinished();
        }
      });
    });
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

  getQuestionDocs(textDocId: TextDocId, fromArchive = false): QuestionDoc[] {
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

  dateInWords(date: string): string {
    return distanceInWordsToNow(new Date(date));
  }

  questionCount(bookNum: number, chapterNumber: number, fromArchive = false): number {
    if (this.projectDoc == null) {
      return 0;
    }
    const id = new TextDocId(this.projectDoc.id, bookNum, chapterNumber);
    const questionDocs = this.getQuestionDocs(id, fromArchive);
    return questionDocs.length;
  }

  questionCountLabel(count: number): string {
    return count > 0 ? translate('checking_overview.question_count_label', { count: count }) : '';
  }

  timeArchivedStamp(date: string): string {
    return translate('checking_overview.time_archived_stamp', { timeMessage: this.dateInWords(date) });
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
      question: questionDoc != null ? questionDoc.data : undefined,
      textsByBookId: this.textsByBookId,
      projectId: this.projectDoc.id
    };
    const resultQuestionDoc = await this.questionDialogService.questionDialog(data, questionDoc);
    if (resultQuestionDoc != null && questionDoc == null) {
      // Only add question to the view if a new question was created, not when a question is edited
      this.addQuestionDoc(resultQuestionDoc);
    }
  }

  getBookName(text: TextInfo): string {
    return Canon.bookNumberToEnglishName(text.bookNum);
  }

  getBookId(text: TextInfo): string {
    return Canon.bookNumberToId(text.bookNum);
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
