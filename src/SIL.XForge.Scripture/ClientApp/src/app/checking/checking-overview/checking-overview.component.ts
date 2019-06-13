import { MdcDialog, MdcDialogConfig } from '@angular-mdc/web';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { clone } from '@orbit/utils';
import { Observable, Subscription } from 'rxjs';
import { map } from 'rxjs/operators';
import { NoticeService } from 'xforge-common/notice.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';
import { objectId } from 'xforge-common/utils';
import { Question, QuestionSource } from '../../core/models/question';
import { QuestionsDoc } from '../../core/models/questions-doc';
import { ScrVers } from '../../core/models/scripture/scr-vers';
import { VerseRef } from '../../core/models/scripture/verse-ref';
import { ScrVersType } from '../../core/models/scripture/versification';
import { SFProjectDataDoc } from '../../core/models/sfproject-data-doc';
import { getTextDocIdStr, TextDocId } from '../../core/models/text-doc-id';
import { TextInfo, TextsByBook } from '../../core/models/text-info';
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
  isLoading = true;
  itemVisible: { [bookId: string]: boolean } = {};
  questions: { [bookId: string]: QuestionsDoc } = {};
  isProjectAdmin$: Observable<boolean>;
  texts: TextInfo[];
  textsByBook: TextsByBook;

  private projectId: string;
  private projectDataDoc: SFProjectDataDoc;
  private projectDataChangesSub: Subscription;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly adminAuthGuard: SFAdminAuthGuard,
    private readonly dialog: MdcDialog,
    private readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService
  ) {
    super();
  }

  ngOnInit(): void {
    this.subscribe(this.activatedRoute.params.pipe(map(params => params['projectId'])), async projectId => {
      this.projectId = projectId;
      this.isProjectAdmin$ = this.adminAuthGuard.allowTransition(this.projectId);
      this.isLoading = true;
      this.noticeService.loadingStarted();
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
    return getTextDocIdStr(this.projectId, bookId, chapter);
  }

  allQuestionsCount(text: TextInfo): number {
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
    if (!(id.toString() in this.questions)) {
      return undefined;
    }

    return this.questions[id.toString()].data.length;
  }

  questionCountLabel(count: number): string {
    return count ? count + ' questions' : '';
  }

  allAnswersCount(text: TextInfo): number {
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
    if (!(id.toString() in this.questions)) {
      return undefined;
    }

    let count: number;
    for (const index of Object.keys(this.questions[id.toString()].data)) {
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
          id = new TextDocId(this.projectId, this.textFromBook(verseStart.book).bookId, verseStart.chapterNum);
          const questionsDoc = await this.projectService.getQuestionsDoc(id);
          newQuestion.id = objectId();
          newQuestion.ownerRef = this.userService.currentUserId;
          newQuestion.source = QuestionSource.Created;
          newQuestion.answers = [];
          questionsDoc.insertInList(newQuestion);
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
        await this.bindQuestionsDoc(new TextDocId(this.projectId, text.bookId, chapter.number));
      }
    }
  }

  private async bindQuestionsDoc(id: TextDocId): Promise<void> {
    if (id == null) {
      return;
    }

    this.unbindQuestionsDoc(id);
    const questionsDoc: QuestionsDoc = await this.projectService.getQuestionsDoc(id);
    this.questions[id.toString()] = questionsDoc;
  }

  private unbindQuestionsDoc(id: TextDocId): void {
    if (!(id.toString() in this.questions)) {
      return;
    }

    delete this.questions[id.toString()];
  }

  private textFromBook(bookId: string): TextInfo {
    if (!(bookId in this.textsByBook)) {
      return undefined;
    }
    return this.textsByBook[bookId];
  }
}
