import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { clone } from '@orbit/utils';
import { Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
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
export class CheckingOverviewComponent extends SubscriptionDisposable implements OnInit, OnDestroy {
  isLoading = true;
  itemVisible: { [bookIdOrDocId: string]: boolean } = {};
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
    private readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {
    super();
  }

  get allQuestionsCount(): string {
    if (this.questionListDocs == null) {
      return '-';
    }

    let count: number = 0;
    for (const questionListDoc of Object.values(this.questionListDocs)) {
      count += questionListDoc.data.questions.length;
    }

    return '' + count;
  }

  get myAnswerCount(): string {
    if (this.questionListDocs == null) {
      return '-';
    }

    let count: number = 0;
    for (const questionListDoc of Object.values(this.questionListDocs)) {
      for (const question of questionListDoc.data.questions) {
        if (question.answers == null) {
          continue;
        }
        if (this.isProjectAdmin) {
          count += question.answers.length;
        } else {
          count += question.answers.filter(a => a.ownerRef === this.userService.currentUserId).length;
        }
      }
    }

    return '' + count;
  }

  get myLikeCount(): string {
    if (this.questionListDocs == null) {
      return '-';
    }

    let count: number = 0;
    for (const questionListDoc of Object.values(this.questionListDocs)) {
      for (const question of questionListDoc.data.questions) {
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
            count += answer.likes.filter(a => a.ownerRef === this.userService.currentUserId).length;
          }
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

      if (this.isProjectAdmin) {
        count += commentListDoc.data.comments.length;
      } else {
        count += commentListDoc.data.comments.filter(c => c.ownerRef === this.userService.currentUserId).length;
      }
    }

    return '' + count;
  }

  get isProjectAdmin(): boolean {
    return (
      this.projectDoc != null &&
      this.projectDoc.data.userRoles[this.userService.currentUserId] === SFProjectRoles.ParatextAdministrator
    );
  }

  ngOnInit(): void {
    this.subscribe(this.activatedRoute.params.pipe(map(params => params['projectId'])), async projectId => {
      this.isLoading = true;
      this.noticeService.loadingStarted();
      try {
        this.projectDoc = await this.projectService.get(projectId);
        this.projectUserConfigDoc = await this.projectService.getUserConfig(projectId, this.userService.currentUserId);
        await this.initTexts();
      } finally {
        this.isLoading = false;
        this.noticeService.loadingFinished();
      }

      if (this.projectDataChangesSub != null) {
        this.projectDataChangesSub.unsubscribe();
      }
      this.projectDataChangesSub = this.projectDoc.remoteChanges$.subscribe(async () => {
        this.isLoading = true;
        this.noticeService.loadingStarted();
        try {
          await this.initTexts();
        } finally {
          this.noticeService.loadingFinished();
          this.isLoading = false;
        }
      });
    });
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.projectDataChangesSub != null) {
      this.projectDataChangesSub.unsubscribe();
    }
    this.noticeService.loadingFinished();
  }

  getTextJsonDocIdStr(bookId: string, chapter: number): string {
    return getTextDocIdStr(this.projectDoc.id, bookId, chapter);
  }

  bookQuestionCount(text: TextInfo): number {
    let count: number;
    for (const chapter of text.chapters) {
      const questionCount = this.questionCount(text.bookId, chapter.number);
      if (questionCount) {
        if (!count) {
          count = 0;
        }
        count += questionCount;
      }
    }
    return count;
  }

  questionCount(bookId: string, chapterNumber: number): number {
    const id = new TextDocId(this.projectDoc.id, bookId, chapterNumber);
    if (!(id.toString() in this.questionListDocs)) {
      return undefined;
    }

    return this.questionListDocs[id.toString()].data.questions.length;
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
    for (const index of Object.keys(this.questionListDocs[id.toString()].data.questions)) {
      const answerCount = this.answerCount(bookId, chapterNumber, +index);
      if (answerCount) {
        if (!count) {
          count = 0;
        }
        count += answerCount;
      }
    }

    return count;
  }

  answerCount(bookId: string, chapterNumber: number, questionIndex: number = 0): number {
    const id = new TextDocId(this.projectDoc.id, bookId, chapterNumber);
    if (!(id.toString() in this.questionListDocs)) {
      return undefined;
    }

    let count: number;
    const question = this.questionListDocs[id.toString()].data.questions[questionIndex];
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

      for (const question of this.questionListDocs[id.toString()].data.questions) {
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

  archiveQuestion(bookId?: string, chapterNumber?: number, questionIndex: number = 0): void {
    console.log('archiveQuestion not yet implemented', bookId, chapterNumber, questionIndex);
  }

  questionDialog(editMode = false, bookId?: string, chapterNumber?: number, questionIndex: number = 0): void {
    let newQuestion: Question = { id: undefined, ownerRef: undefined };
    let id: TextDocId;
    let question: Question;
    if (editMode) {
      if (
        bookId == null ||
        bookId === '' ||
        chapterNumber == null ||
        chapterNumber < 0 ||
        questionIndex == null ||
        questionIndex < 0
      ) {
        throw new Error('Must supply valid bookId, chapterNumber and questionIndex in editMode');
      }

      id = new TextDocId(this.projectDoc.id, bookId, chapterNumber);
      question = this.questionListDocs[id.toString()].data.questions[questionIndex];
      newQuestion = clone(question);
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

        if (editMode) {
          this.questionListDocs[id.toString()].submitJson0Op(op =>
            op.replace(cq => cq.questions, questionIndex, newQuestion)
          );
        } else {
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

  private async initTexts(): Promise<void> {
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
