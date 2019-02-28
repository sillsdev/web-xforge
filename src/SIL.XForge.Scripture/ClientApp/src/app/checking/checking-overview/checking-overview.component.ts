import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { clone } from '@orbit/utils';
import { Observable } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

import { UserRef } from 'xforge-common/models/user';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { Answer, Comment, Question, QuestionSource, ScrVersType, VerseRefData } from '../../core/models/question';
import { QuestionData } from '../../core/models/question-data';
import { ScrVers } from '../../core/models/scripture/scr-vers';
import { VerseRef } from '../../core/models/scripture/verse-ref';
import { SFProjectRef } from '../../core/models/sfproject';
import { Text } from '../../core/models/text';
import { QuestionService } from '../../core/question.service';
import { SFProjectService } from '../../core/sfproject.service';
import { SFAdminAuthGuard } from '../../shared/sfadmin-auth.guard';
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
  bookIdsWithQuestions: string[] = [];
  isProjectAdmin$: Observable<boolean>;
  texts: Text[];
  textsByBook: { [bookId: string]: Text };

  private questionsData: { [textId: string]: QuestionData } = {};
  private insertCommentCount = 0;
  private updatCommentCount = 0;
  private projectId: string;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly dialog: MdcDialog,
    private readonly adminAuthGuard: SFAdminAuthGuard,
    private readonly projectService: SFProjectService,
    private readonly questionService: QuestionService,
    private readonly userService: UserService
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(
      this.activatedRoute.params.pipe(
        tap(params => {
          this.projectId = params['id'];
          this.isProjectAdmin$ = this.adminAuthGuard.allowTransition(this.projectId);
        }),
        switchMap(() => this.projectService.getTexts(this.projectId))
      ),
      r => {
        this.textsByBook = {};
        this.texts = [];
        r.map(async t => {
          this.textsByBook[t.bookId] = t;
          this.texts.push(t);
          await this.bindQuestionData(t.id);
          this.setBookWithQuestion(t);
        });
      }
    );
  }

  ngOnDestroy(): void {
    for (const text of this.texts) {
      this.unbindQuestionData(text.id);
    }
  }

  questionCount(textId: string): number {
    if (!(textId in this.questionsData)) {
      return undefined;
    }

    const questionData = this.questionsData[textId];
    return questionData.data.length;
  }

  questionVersion(textId: string): number {
    if (!(textId in this.questionsData)) {
      return undefined;
    }

    const questionData = this.questionsData[textId];
    return questionData.version;
  }

  questionDialog(newMode = false): void {
    const dialogConfig = {
      data: {
        newMode
      } as QuestionDialogData
    } as MdcDialogConfig;
    const dialogRef = this.dialog.open(QuestionDialogComponent, dialogConfig);

    dialogRef.afterClosed().subscribe(async (result: QuestionDialogResult) => {
      if (result !== 'close') {
        const versification = ScrVers.English;
        const verseStart = VerseRef.fromStr(result.scriptureStart, versification);
        const verseEnd = VerseRef.fromStr(result.scriptureEnd, versification);
        const textId = this.textIdFrom(verseStart.book);
        const questionData = await this.questionService.connect(textId);
        const question: Question = {
          owner: new UserRef(this.userService.currentUserId),
          project: new SFProjectRef(this.projectId),
          source: QuestionSource.Created,
          scriptureStart: new VerseRefDataConstructor(verseStart.book, verseStart.chapter, verseStart.verse),
          scriptureEnd: new VerseRefDataConstructor(verseEnd.book, verseEnd.chapter, verseEnd.verse),
          text: result.text
        } as Question;
        questionData.submit([{ p: [0], li: question }], { source: 'user' });
      }
    });
  }

  async insertCommentNoAwait(textId: string): Promise<void> {
    if (!(textId in this.questionsData)) {
      return;
    }

    const owner = new UserRef(this.userService.currentUserId);
    const comment: Comment = {
      owner,
      text:
        'Create comment operation - inserted at beginning: my new comment (original hah?). Count: ' +
        ++this.insertCommentCount
    } as Comment;
    const questionData = this.questionsData[textId];
    questionData.submit([{ p: [0, 'answers', 0, 'comments', 0], li: comment }], { source: 'user' });
    console.log(questionData.data[0].answers[0].comments[0]);
  }

  async updateCommentNoAwait(textId: string): Promise<void> {
    if (!(textId in this.questionsData)) {
      return;
    }

    const questionData = this.questionsData[textId];
    const comment = questionData.data[0].answers[0].comments[0];
    console.log('comment', comment);
    const newComment = clone(comment);
    newComment.text += ' Update' + ++this.updatCommentCount;
    questionData.submit([{ p: [0, 'answers', 0, 'comments', 0], ld: comment, li: newComment }], { source: 'user' });
    console.log(questionData.data[0].answers[0].comments[0]);
  }

  async deleteCommentNoAwait(textId: string): Promise<void> {
    if (!(textId in this.questionsData)) {
      return;
    }

    const questionData = this.questionsData[textId];
    const comment = questionData.data[0].answers[0].comments[0];
    console.log('comment', comment);
    questionData.submit([{ p: [0, 'answers', 0, 'comments', 0], ld: comment }], { source: 'user' });
    console.log(questionData.data[0].answers[0].comments[0]);
  }

  async insertComments(textId: string): Promise<void> {
    if (!(textId in this.questionsData)) {
      return;
    }

    const MAX_COMMENTS = 2;
    const owner = new UserRef(this.userService.currentUserId);
    const comment: Comment = {
      owner,
      text: 'Create comment operation - inserted at beginning: my new comment (original hah?)'
    } as Comment;
    const questionData = this.questionsData[textId];
    for (const [iq, question] of questionData.data.entries()) {
      for (const [ia, answer] of question.answers.entries()) {
        for (let ic = 0; ic < MAX_COMMENTS; ic++) {
          await questionData.submit([{ p: [iq, 'answers', ia, 'comments', 0], li: comment }], { source: 'user' });
        }
      }
    }
    console.log(questionData.data);
  }

  async mockQuestions(): Promise<void> {
    const MAX_QUESTIONS = 100;
    const MAX_ANSWERS = 50;
    const MAX_COMMENTS = 20;
    const owner = new UserRef(this.userService.currentUserId);
    const answer: Answer = {
      owner,
      text: "If I was to post a really good answer, I don't think this would be it.",
      comments: []
    } as Answer;
    const comment: Comment = {
      owner,
      text: 'If I was to make a really good comment, do you think this would be it?'
    } as Comment;
    for (let ic = 0; ic < MAX_COMMENTS; ic++) {
      answer.comments.push(comment);
    }
    for (const text of this.texts) {
      if (this.questionCount(text.id) === 0 && text.id in this.questionsData) {
        const verseStart = VerseRef.fromStr(text.bookId + ' 1:1', ScrVers.English);
        const verseEnd = VerseRef.fromStr(text.bookId + ' 1:2', ScrVers.English);
        const question: Question = {
          owner,
          project: new SFProjectRef(this.projectId),
          source: QuestionSource.Created,
          scriptureStart: new VerseRefDataConstructor(verseStart.book, verseStart.chapter, verseStart.verse),
          scriptureEnd: new VerseRefDataConstructor(verseEnd.book, verseEnd.chapter, verseEnd.verse),
          text: 'If I was to ask a really good question, do you think this would be it?',
          answers: []
        } as Question;
        for (let ia = 0; ia < MAX_ANSWERS; ia++) {
          question.answers.push(answer);
        }
        console.log(question);
        const questionData = this.questionsData[text.id];
        for (let iq = 0; iq < MAX_QUESTIONS; iq++) {
          await questionData.submit([{ p: [0], li: question }], { source: 'user' });
        }
        console.log('finished');
      }
    }
  }

  private setBookWithQuestion(text: Text): void {
    const questionData: QuestionData = this.questionsData[text.id];
    if (text == null || text.bookId == null || questionData == null || questionData.data.length <= 0) {
      return;
    }

    this.bookIdsWithQuestions.push(text.bookId);
  }

  private async bindQuestionData(textId: string): Promise<void> {
    if (textId == null) {
      return;
    }

    await this.unbindQuestionData(textId);
    const questionData: QuestionData = await this.questionService.connect(textId);
    this.questionsData[textId] = questionData;
  }

  private async unbindQuestionData(textId: string): Promise<void> {
    if (!(textId in this.questionsData)) {
      return;
    }

    await this.questionService.disconnect(this.questionsData[textId]);
    delete this.questionsData[textId];
  }

  private textIdFrom(bookId: string): string {
    if (!(bookId in this.textsByBook)) {
      return undefined;
    }
    return this.textsByBook[bookId].id;
  }
}

class VerseRefDataConstructor implements VerseRefData {
  constructor(
    public book?: string,
    public chapter?: string,
    public verse?: string,
    public versification: ScrVersType = ScrVersType.English
  ) {}
}
