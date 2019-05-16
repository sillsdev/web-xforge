import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { clone } from '@orbit/utils';
import { Observable } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { Question, QuestionSource } from '../../core/models/question';
import { QuestionData } from '../../core/models/question-data';
import { ScrVers } from '../../core/models/scripture/scr-vers';
import { VerseRef } from '../../core/models/scripture/verse-ref';
import { ScrVersType } from '../../core/models/scripture/versification';
import { Text, TextsByBook } from '../../core/models/text';
import { getTextJsonDataIdStr, TextJsonDataId } from '../../core/models/text-json-data-id';
import { SFProjectService } from '../../core/sfproject.service';
import { TextService } from '../../core/text.service';
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
  isLoading = true;
  itemVisible: { [textId: string]: boolean } = {};
  questions: { [textId: string]: QuestionData } = {};
  getTextJsonDataIdStr = getTextJsonDataIdStr;
  isProjectAdmin$: Observable<boolean>;
  texts: Text[];
  textsByBook: TextsByBook;

  private projectId: string;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly adminAuthGuard: SFAdminAuthGuard,
    private readonly dialog: MdcDialog,
    private readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly textService: TextService,
    private readonly userService: UserService
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(
      this.activatedRoute.params.pipe(
        tap(params => {
          this.isLoading = true;
          this.noticeService.loadingStarted();
          this.projectId = params['projectId'];
          this.isProjectAdmin$ = this.adminAuthGuard.allowTransition(this.projectId);
        }),
        switchMap(() => this.projectService.getTexts(this.projectId))
      ),
      async r => {
        this.textsByBook = {};
        this.texts = [];
        for (const text of r) {
          this.textsByBook[text.bookId] = text;
          this.texts.push(text);
          for (const chapter of text.chapters) {
            await this.bindQuestionData(new TextJsonDataId(text.id, chapter.number));
          }
        }
        this.isLoading = false;
        this.noticeService.loadingFinished();
      }
    );
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.noticeService.loadingFinished();
  }

  allQuestionsCount(text: Text): number {
    let count: number;
    for (const chapter of text.chapters) {
      const questionCount = this.questionCount(text.id, chapter.number);
      if (questionCount) {
        if (!count) {
          count = 0;
        }
        count += questionCount;
      }
    }
    return count;
  }

  questionCount(textId: string, chapterNumber: number): number {
    const id = new TextJsonDataId(textId, chapterNumber);
    if (!(id.toString() in this.questions)) {
      return undefined;
    }

    return this.questions[id.toString()].data.length;
  }

  questionCountLabel(count: number): string {
    return count ? count + ' questions' : '';
  }

  allAnswersCount(text: Text): number {
    let count: number;
    for (const chapter of text.chapters) {
      const answerCount = this.chapterAnswerCount(text.id, chapter.number);
      if (answerCount) {
        if (!count) {
          count = 0;
        }
        count += answerCount;
      }
    }
    return count;
  }

  chapterAnswerCount(textId: string, chapterNumber: number): number {
    const id = new TextJsonDataId(textId, chapterNumber);
    if (!(id.toString() in this.questions)) {
      return undefined;
    }

    let count: number;
    for (const index of Object.keys(this.questions[id.toString()].data)) {
      const answerCount = this.answerCount(textId, chapterNumber, +index);
      if (answerCount) {
        if (!count) {
          count = 0;
        }
        count += answerCount;
      }
    }

    return count;
  }

  answerCount(textId: string, chapterNumber: number, questionIndex: number = 0): number {
    const id = new TextJsonDataId(textId, chapterNumber);
    if (!(id.toString() in this.questions)) {
      return undefined;
    }

    let count: number;
    const question = this.questions[id.toString()].data[questionIndex];
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

  questionDialog(editMode = false, textId?: string, chapterNumber?: number, questionIndex: number = 0): void {
    let newQuestion: Question = { id: undefined, ownerRef: undefined, projectRef: undefined };
    let id: TextJsonDataId;
    let question: Question;
    if (editMode) {
      if (
        textId == null ||
        textId === '' ||
        chapterNumber == null ||
        chapterNumber < 0 ||
        questionIndex == null ||
        questionIndex < 0
      ) {
        throw new Error('Must supply valid textId, chapterNumber and questionIndex in editMode');
      }

      id = new TextJsonDataId(textId, chapterNumber);
      question = this.questions[id.toString()].data[questionIndex];
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

        if (editMode) {
          this.questions[id.toString()].replaceInList(question, newQuestion, [questionIndex]);
        } else {
          id = new TextJsonDataId(this.textFromBook(verseStart.book).id, verseStart.chapterNum);
          const questionData = await this.textService.getQuestionData(id);
          newQuestion.id = objectId();
          newQuestion.ownerRef = this.userService.currentUserId;
          newQuestion.projectRef = this.projectId;
          newQuestion.source = QuestionSource.Created;
          newQuestion.answers = [];
          questionData.insertInList(newQuestion);
        }
      }
    });
  }

  private async bindQuestionData(id: TextJsonDataId): Promise<void> {
    if (id == null) {
      return;
    }

    this.unbindQuestionData(id);
    const questionData: QuestionData = await this.textService.getQuestionData(id);
    this.questions[id.toString()] = questionData;
  }

  private unbindQuestionData(id: TextJsonDataId): void {
    if (!(id.toString() in this.questions)) {
      return;
    }

    delete this.questions[id.toString()];
  }

  private textFromBook(bookId: string): Text {
    if (!(bookId in this.textsByBook)) {
      return undefined;
    }
    return this.textsByBook[bookId];
  }
}
