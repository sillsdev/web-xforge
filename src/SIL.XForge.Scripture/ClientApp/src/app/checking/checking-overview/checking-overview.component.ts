import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { distanceInWordsToNow } from 'date-fns';
import cloneDeep from 'lodash/cloneDeep';
import { Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { CommentListDoc } from '../../core/models/comment-list-doc';
import { Question, QuestionSource } from '../../core/models/question';
import { QuestionListDoc } from '../../core/models/question-list-doc';
import { ScrVers } from '../../core/models/scripture/scr-vers';
import { VerseRef } from '../../core/models/scripture/verse-ref';
import { ScrVersType } from '../../core/models/scripture/versification';
import { SFProjectDoc } from '../../core/models/sfproject-doc';
import { SFProjectRoles } from '../../core/models/sfproject-roles';
import { SFProjectUserConfigDoc } from '../../core/models/sfproject-user-config-doc';
import { getTextDocIdStr, TextDocId } from '../../core/models/text-doc-id';
import { TextInfo, TextsByBook } from '../../core/models/text-info';
import { SFProjectService } from '../../core/sfproject.service';
import { CheckingUtils } from '../checking.utils';
import {
  QuestionDialogComponent,
  QuestionDialogData,
  QuestionDialogResult
} from '../question-dialog/question-dialog.component';

@Component({
  selector: 'app-checking-overview',
  templateUrl: './checking-overview.component.html',
  styleUrls: ['./checking-overview.component.scss']
})
export class CheckingOverviewComponent extends DataLoadingComponent implements OnInit, OnDestroy {
  itemVisible: { [bookIdOrDocId: string]: boolean } = {};
  itemVisibleArchived: { [bookIdOrDocId: string]: boolean } = {};
  commentListDocs: { [docId: string]: CommentListDoc } = {};
  questionListDocs: { [docId: string]: QuestionListDoc } = {};
  texts: TextInfo[] = [];
  projectId: string;
  textsByBook: TextsByBook;

  private projectDoc: SFProjectDoc;
  private projectDataChangesSub: Subscription;
  private projectUserConfigDoc: SFProjectUserConfigDoc;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly dialog: MdcDialog,
    noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {
    super(noticeService);
  }

  get allQuestionsCount(): string {
    if (this.questionListDocs == null) {
      return '-';
    }

    return '' + this.allPublishedQuestions.length;
  }

  get myAnswerCount(): string {
    if (this.questionListDocs == null) {
      return '-';
    }

    let count: number = 0;
    for (const question of this.allPublishedQuestions) {
      if (question.answers == null) {
        continue;
      }
      if (this.isProjectAdmin) {
        count += question.answers.length;
      } else {
        count += question.answers.filter(a => a.ownerRef === this.userService.currentUserId).length;
      }
    }

    return '' + count;
  }

  get myLikeCount(): string {
    if (this.questionListDocs == null) {
      return '-';
    }

    let count: number = 0;
    for (const question of this.allPublishedQuestions) {
      if (question.answers == null) {
        continue;
      }
      for (const answer of question.answers) {
        if (answer.likes == null) {
          continue;
        }
        if (this.isProjectAdmin) {
          count += answer.likes.length;
        } else {
          count += answer.likes.filter(l => l.ownerRef === this.userService.currentUserId).length;
        }
      }
    }

    return '' + count;
  }

  get myCommentCount(): string {
    if (this.commentListDocs == null) {
      return '-';
    }

    let count: number = 0;
    for (const commentListDoc of Object.values(this.commentListDocs)) {
      if (commentListDoc == null) {
        continue;
      }
      const publicComments = commentListDoc.data.comments.filter(
        c => this.allPublishedQuestions.find(q => q.answers && q.answers.map(a => a.id).includes(c.answerRef)) != null
      );
      if (this.isProjectAdmin) {
        count += publicComments.length;
      } else {
        count += publicComments.filter(c => c.ownerRef === this.userService.currentUserId).length;
      }
    }

    return '' + count;
  }

  get isProjectAdmin(): boolean {
    return (
      this.projectDoc != null &&
      this.projectDoc.data != null &&
      this.projectDoc.data.userRoles[this.userService.currentUserId] === SFProjectRoles.ParatextAdministrator
    );
  }

  get allArchivedQuestionsCount(): number {
    let questions: Readonly<Question[]> = [];
    for (const doc of Object.values(this.questionListDocs)) {
      questions = questions.concat(doc.data.questions);
    }
    return questions.filter(q => q.isArchived === true).length;
  }

  private get allPublishedQuestions(): Question[] {
    let questions: Readonly<Question[]> = [];
    for (const doc of Object.values(this.questionListDocs)) {
      questions = questions.concat(doc.data.questions);
    }
    return questions.filter(q => q.isArchived !== true);
  }

  ngOnInit(): void {
    this.subscribe(this.activatedRoute.params.pipe(map(params => params['projectId'])), async projectId => {
      this.loadingStarted();
      this.projectId = projectId;
      try {
        this.projectDoc = await this.projectService.get(projectId);
        this.projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
        await this.initTexts();
      } finally {
        this.loadingFinished();
      }

      if (this.projectDataChangesSub != null) {
        this.projectDataChangesSub.unsubscribe();
      }
      this.projectDataChangesSub = this.projectDoc.remoteChanges$.subscribe(async () => {
        this.loadingStarted();
        try {
          await this.initTexts();
        } finally {
          this.loadingFinished();
        }
      });
    });
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.projectDataChangesSub != null) {
      this.projectDataChangesSub.unsubscribe();
    }
  }

  getTextJsonDocIdStr(bookId: string, chapter: number): string {
    return getTextDocIdStr(this.projectDoc.id, bookId, chapter);
  }

  getQuestions(textDocId: TextDocId, fromArchive = false): Question[] {
    if (fromArchive) {
      return this.questionListDocs[textDocId.toString()].data.questions.filter(q => q.isArchived === true);
    }
    return this.questionListDocs[textDocId.toString()].data.questions.filter(q => q.isArchived !== true);
  }

  getQuestionIndex(questionId: string, textDocId: TextDocId): number {
    return this.questionListDocs[textDocId.toString()].data.questions.findIndex(q => q.id === questionId);
  }

  bookQuestionCount(text: TextInfo, fromArchive = false): number {
    let count: number;
    for (const chapter of text.chapters) {
      const questionCount = this.questionCount(text.bookId, chapter.number, fromArchive);
      if (questionCount) {
        if (!count) {
          count = 0;
        }
        count += questionCount;
      }
    }
    return count;
  }

  dateInWords(date: string): string {
    return distanceInWordsToNow(new Date(date));
  }

  questionCount(bookId: string, chapterNumber: number, fromArchive = false): number {
    const id = new TextDocId(this.projectDoc.id, bookId, chapterNumber);
    if (!(id.toString() in this.questionListDocs)) {
      return undefined;
    }
    if (fromArchive) {
      return this.questionListDocs[id.toString()].data.questions.filter(q => q.isArchived === true).length;
    }
    return this.questionListDocs[id.toString()].data.questions.filter(q => q.isArchived !== true).length;
  }

  questionCountLabel(count: number): string {
    return count ? count + ' questions' : '';
  }

  bookAnswerCount(text: TextInfo): number {
    let count: number;
    for (const chapter of text.chapters) {
      const answerCount = this.chapterAnswerCount(text.bookId, chapter.number);
      if (answerCount) {
        if (!count) {
          count = 0;
        }
        count += answerCount;
      }
    }
    return count;
  }

  chapterAnswerCount(bookId: string, chapterNumber: number): number {
    const id = new TextDocId(this.projectDoc.id, bookId, chapterNumber);
    if (!(id.toString() in this.questionListDocs)) {
      return undefined;
    }

    let count: number;
    for (const q of this.getQuestions(id)) {
      const answerCount = this.answerCount(bookId, chapterNumber, q.id);
      if (answerCount) {
        if (!count) {
          count = 0;
        }
        count += answerCount;
      }
    }

    return count;
  }

  answerCount(bookId: string, chapterNumber: number, questionId: string): number {
    const id = new TextDocId(this.projectDoc.id, bookId, chapterNumber);
    if (!(id.toString() in this.questionListDocs)) {
      return undefined;
    }

    let count: number;
    const question = this.questionListDocs[id.toString()].data.questions[this.getQuestionIndex(questionId, id)];
    if (question.answers) {
      if (!count) {
        count = 0;
      }
      count += question.answers.length;
    }

    return count;
  }

  answerCountLabel(count: number): string {
    return count ? count + ' answers' : '';
  }

  setQuestionArchiveStatus(questionId: string, archiveStatus: boolean, bookId: string, chapterNumber: number) {
    const id = new TextDocId(this.projectId, bookId, chapterNumber);
    const questionIndex = this.getQuestionIndex(questionId, id);
    const question = this.questionListDocs[id.toString()].data.questions[questionIndex];
    const updatedQuestion: Question = cloneDeep(question);
    updatedQuestion.isArchived = archiveStatus;
    updatedQuestion.dateArchived = archiveStatus ? new Date().toISOString() : null;
    this.questionListDocs[id.toString()].submitJson0Op(op =>
      op.replace(q => q.questions, questionIndex, updatedQuestion)
    );
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
    for (const chapter of text.chapters) {
      const id = new TextDocId(this.projectId, text.bookId, chapter.number);
      if (!(id.toString() in this.questionListDocs)) {
        continue;
      }

      for (const question of this.getQuestions(id)) {
        if (CheckingUtils.hasUserAnswered(question, this.userService.currentUserId)) {
          answered++;
        } else if (CheckingUtils.hasUserReadQuestion(question, this.projectUserConfigDoc.data)) {
          read++;
        } else {
          unread++;
        }
      }
    }

    return [unread, read, answered];
  }

  questionDialog(editMode = false, bookId?: string, chapterNumber?: number, questionId?: string): void {
    let newQuestion: Question = { id: undefined, ownerRef: undefined };
    let id: TextDocId;
    let question: Question;
    let questionIndex: number;
    if (editMode) {
      if (bookId == null || bookId === '' || chapterNumber == null || chapterNumber < 0 || questionId == null) {
        throw new Error('Must supply valid bookId, chapterNumber and questionId in editMode');
      }

      id = new TextDocId(this.projectDoc.id, bookId, chapterNumber);
      questionIndex = this.getQuestionIndex(questionId, id);
      question = this.questionListDocs[id.toString()].data.questions[questionIndex];
      newQuestion = cloneDeep(question);
    }
    const dialogConfig: MdcDialogConfig<QuestionDialogData> = {
      data: {
        editMode,
        question,
        textsByBook: this.textsByBook
      }
    };
    const dialogRef = this.dialog.open(QuestionDialogComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(async (result: QuestionDialogResult) => {
      if (result !== 'close') {
        const verseStart = VerseRef.fromStr(result.scriptureStart, ScrVers.English);
        const verseEnd = VerseRef.fromStr(result.scriptureEnd, ScrVers.English);
        const versification: string = ScrVersType[ScrVersType.English];
        const newQuestionId = editMode ? newQuestion.id : objectId();
        newQuestion.scriptureStart = {
          book: verseStart.book,
          chapter: verseStart.chapter,
          verse: verseStart.verse,
          versification
        };
        newQuestion.scriptureEnd = {
          book: verseEnd.book,
          chapter: verseEnd.chapter,
          verse: verseEnd.verse,
          versification
        };
        newQuestion.text = result.text;
        if (result.audio.fileName) {
          const response = await this.projectService.uploadAudio(
            this.projectId,
            new File([result.audio.blob], newQuestionId + '~' + result.audio.fileName)
          );
          // Get the amended filename and save it against the answer
          newQuestion.audioUrl = response;
        } else if (result.audio.status === 'reset') {
          newQuestion.audioUrl = '';
        }

        if (
          editMode &&
          question.scriptureStart.book === verseStart.book &&
          question.scriptureStart.chapter === verseStart.chapter
        ) {
          this.questionListDocs[id.toString()].submitJson0Op(op =>
            op.replace(cq => cq.questions, questionIndex, newQuestion)
          );
        } else {
          if (editMode) {
            // The scripture book or chapter reference has been edited. Delete the question in the old QuestionListDoc
            await this.deleteQuestion(question.id, id);
          }
          id = new TextDocId(this.projectDoc.id, this.textFromBook(verseStart.book).bookId, verseStart.chapterNum);
          const questionsDoc = await this.projectService.getQuestionList(id);
          newQuestion.id = newQuestionId;
          newQuestion.ownerRef = this.userService.currentUserId;
          newQuestion.source = QuestionSource.Created;
          newQuestion.answers = [];
          questionsDoc.submitJson0Op(op => op.insert(cq => cq.questions, 0, newQuestion));
        }
      }
    });
  }

  private async deleteQuestion(questionId: string, textDocId: TextDocId): Promise<boolean> {
    const questionIndex = this.questionListDocs[textDocId.toString()].data.questions.findIndex(
      q => q.id === questionId
    );
    return this.questionListDocs[textDocId.toString()].submitJson0Op(op =>
      op.remove(cq => cq.questions, questionIndex)
    );
  }

  private async initTexts(): Promise<void> {
    if (this.projectDoc == null || this.projectDoc.data == null) {
      return;
    }

    this.textsByBook = {};
    this.texts = [];
    for (const text of this.projectDoc.data.texts) {
      this.textsByBook[text.bookId] = text;
      this.texts.push(text);
      for (const chapter of text.chapters) {
        await this.bindForumDocs(new TextDocId(this.projectDoc.id, text.bookId, chapter.number));
      }
    }
  }

  private async bindForumDocs(id: TextDocId): Promise<void> {
    if (id == null) {
      return;
    }

    this.unbindForumDocs(id);
    this.questionListDocs[id.toString()] = await this.projectService.getQuestionList(id);
    this.commentListDocs[id.toString()] = await this.projectService.getCommentList(id);
  }

  private unbindForumDocs(id: TextDocId): void {
    if (!(id.toString() in this.questionListDocs)) {
      return;
    }

    delete this.questionListDocs[id.toString()];
    delete this.commentListDocs[id.toString()];
  }

  private textFromBook(bookId: string): TextInfo {
    if (!(bookId in this.textsByBook)) {
      return undefined;
    }
    return this.textsByBook[bookId];
  }
}
