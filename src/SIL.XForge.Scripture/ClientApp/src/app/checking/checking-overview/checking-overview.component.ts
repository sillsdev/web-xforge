import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';

import { UserRef } from 'xforge-common/models/user';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { Question, QuestionSource, ScrVersType, VerseRefData } from '../../core/models/question';
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
      return 0;
    }

    const questionData = this.questionsData[textId];
    return questionData.data.length;
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
