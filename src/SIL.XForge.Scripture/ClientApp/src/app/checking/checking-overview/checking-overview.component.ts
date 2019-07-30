import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { clone } from '@orbit/utils';
import { Subscription } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { nameof, objectId } from 'xforge-common/utils';
import { CommentsDoc } from '../../core/models/comments-doc';
import { Question, QuestionSource } from '../../core/models/question';
import { QuestionsDoc } from '../../core/models/questions-doc';
import { ScrVers } from '../../core/models/scripture/scr-vers';
import { VerseRef } from '../../core/models/scripture/verse-ref';
import { ScrVersType } from '../../core/models/scripture/versification';
import { SFProject } from '../../core/models/sfproject';
import { SFProjectDataDoc } from '../../core/models/sfproject-data-doc';
import { SFProjectRoles } from '../../core/models/sfproject-roles';
import { SFProjectUser } from '../../core/models/sfproject-user';
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
  commentsDocs: { [docId: string]: CommentsDoc } = {};
  questionsDocs: { [docId: string]: QuestionsDoc } = {};
  texts: TextInfo[] = [];
  projectId: string;
  textsByBook: TextsByBook;

  private projectDataDoc: SFProjectDataDoc;
  private projectDataChangesSub: Subscription;
  private projectCurrentUser: SFProjectUser;

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
    if (this.questionsDocs == null) {
      return '-';
    }

    let count: number = 0;
    for (const questionsDoc of Object.values(this.questionsDocs)) {
      count += questionsDoc.data.length;
    }

    return '' + count;
  }

  get myAnswerCount(): string {
    if (this.questionsDocs == null) {
      return '-';
    }

    let count: number = 0;
    for (const questionsDoc of Object.values(this.questionsDocs)) {
      for (const question of questionsDoc.data) {
        if (question.answers == null) {
          continue;
        }
        if (this.isProjectAdmin) {
          count += question.answers.length;
        } else {
          count += question.answers.filter(a => a.ownerRef === this.projectCurrentUser.userRef).length;
        }
      }
    }

    return '' + count;
  }

  get myLikeCount(): string {
    if (this.questionsDocs == null) {
      return '-';
    }

    let count: number = 0;
    for (const questionsDoc of Object.values(this.questionsDocs)) {
      for (const question of questionsDoc.data) {
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
            count += answer.likes.filter(a => a.ownerRef === this.projectCurrentUser.userRef).length;
          }
        }
      }
    }

    return '' + count;
  }

  get myCommentCount(): string {
    if (this.commentsDocs == null) {
      return '-';
    }

    let count: number = 0;
    for (const commentsDoc of Object.values(this.commentsDocs)) {
      if (commentsDoc == null) {
        continue;
      }

      if (this.isProjectAdmin) {
        count += commentsDoc.data.length;
      } else {
        count += commentsDoc.data.filter(c => c.ownerRef === this.projectCurrentUser.userRef).length;
      }
    }

    return '' + count;
  }

  get isProjectAdmin(): boolean {
    return this.projectCurrentUser && this.projectCurrentUser.role === SFProjectRoles.ParatextAdministrator;
  }

  ngOnInit(): void {
    this.subscribe(
      this.activatedRoute.params.pipe(
        switchMap(params => {
          this.projectId = params['projectId'];
          return this.projectService.get(this.projectId, [[nameof<SFProject>('users')]]);
        }),
        filter(projectResults => projectResults.data != null)
      ),
      async projectResults => {
        this.isLoading = true;
        this.noticeService.loadingStarted();
        const project = projectResults.data;
        this.projectCurrentUser = projectResults
          .getManyIncluded<SFProjectUser>(project.users)
          .find(pu => pu.userRef === this.userService.currentUserId);
        try {
          this.projectDataDoc = await this.projectService.getDataDoc(this.projectId);
          await this.initTexts();
        } finally {
          this.isLoading = false;
          this.noticeService.loadingFinished();
        }

        if (this.projectDataChangesSub != null) {
          this.projectDataChangesSub.unsubscribe();
        }
        this.projectDataChangesSub = this.projectDataDoc.remoteChanges().subscribe(async () => {
          this.isLoading = true;
          this.noticeService.loadingStarted();
          try {
            await this.initTexts();
          } finally {
            this.noticeService.loadingFinished();
            this.isLoading = false;
          }
        });
      }
    );
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.projectDataChangesSub != null) {
      this.projectDataChangesSub.unsubscribe();
    }
    this.noticeService.loadingFinished();
  }

  getTextJsonDocIdStr(bookId: string, chapter: number): string {
    return getTextDocIdStr(this.projectId, bookId, chapter);
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
    const id = new TextDocId(this.projectId, bookId, chapterNumber);
    if (!(id.toString() in this.questionsDocs)) {
      return undefined;
    }

    return this.questionsDocs[id.toString()].data.length;
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
    const id = new TextDocId(this.projectId, bookId, chapterNumber);
    if (!(id.toString() in this.questionsDocs)) {
      return undefined;
    }

    let count: number;
    for (const index of Object.keys(this.questionsDocs[id.toString()].data)) {
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
    const id = new TextDocId(this.projectId, bookId, chapterNumber);
    if (!(id.toString() in this.questionsDocs)) {
      return undefined;
    }

    let count: number;
    const question = this.questionsDocs[id.toString()].data[questionIndex];
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
      if (!(id.toString() in this.questionsDocs)) {
        continue;
      }

      for (const question of this.questionsDocs[id.toString()].data) {
        if (CheckingUtils.hasUserAnswered(question, this.userService.currentUserId)) {
          answered++;
        } else if (CheckingUtils.hasUserReadQuestion(question, this.projectCurrentUser)) {
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

      id = new TextDocId(this.projectId, bookId, chapterNumber);
      question = this.questionsDocs[id.toString()].data[questionIndex];
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
          this.questionsDocs[id.toString()].submitJson0Op(op => op.replace(qs => qs, questionIndex, newQuestion));
        } else {
          id = new TextDocId(this.projectId, this.textFromBook(verseStart.book).bookId, verseStart.chapterNum);
          const questionsDoc = await this.projectService.getQuestionsDoc(id);
          newQuestion.id = newQuestionId;
          newQuestion.ownerRef = this.userService.currentUserId;
          newQuestion.source = QuestionSource.Created;
          newQuestion.answers = [];
          questionsDoc.submitJson0Op(op => op.insert(qs => qs, 0, newQuestion));
        }
      }
    });
  }

  private async initTexts(): Promise<void> {
    this.textsByBook = {};
    this.texts = [];
    for (const text of this.projectDataDoc.data.texts) {
      this.textsByBook[text.bookId] = text;
      this.texts.push(text);
      for (const chapter of text.chapters) {
        await this.bindForumDocs(new TextDocId(this.projectId, text.bookId, chapter.number));
      }
    }
  }

  private async bindForumDocs(id: TextDocId): Promise<void> {
    if (id == null) {
      return;
    }

    this.unbindForumDocs(id);
    this.questionsDocs[id.toString()] = await this.projectService.getQuestionsDoc(id);
    this.commentsDocs[id.toString()] = await this.projectService.getCommentsDoc(id);
  }

  private unbindForumDocs(id: TextDocId): void {
    if (!(id.toString() in this.questionsDocs)) {
      return;
    }

    delete this.questionsDocs[id.toString()];
    delete this.commentsDocs[id.toString()];
  }

  private textFromBook(bookId: string): TextInfo {
    if (!(bookId in this.textsByBook)) {
      return undefined;
    }
    return this.textsByBook[bookId];
  }
}
