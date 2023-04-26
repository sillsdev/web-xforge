import { Component } from '@angular/core';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserService } from 'xforge-common/user.service';

interface AnsweringProgress {
  numQuestions: number;
  numAnswered: number;
}

@Component({
  selector: 'app-progress',
  templateUrl: './progress.component.html',
  styleUrls: ['./progress.component.scss']
})
export class ProgressComponent extends SubscriptionDisposable {
  questionsByBook: Map<number, AnsweringProgress> = new Map();
  questionsByChapter: Map<number, Map<number, AnsweringProgress>> = new Map();

  bookSelections: { [book: number]: boolean } = {};

  constructor(
    activatedProject: ActivatedProjectService,
    private readonly projectService: SFProjectService,
    private readonly userService: UserService,
    private readonly i18n: I18nService
  ) {
    super();

    this.subscribe(activatedProject.projectDoc$, projectDoc => this.updateStats(projectDoc));
  }

  async updateStats(projectDoc: SFProjectProfileDoc | undefined): Promise<void> {
    if (projectDoc?.data == null) {
      return;
    }
    const questionsQuery = await this.projectService.queryQuestions(projectDoc.id);

    const questionsByBook: Map<number, AnsweringProgress> = new Map();
    const questionsByChapter: Map<number, Map<number, AnsweringProgress>> = new Map();

    for (const questionDoc of questionsQuery.docs) {
      const question = questionDoc.data;
      if (question == null) continue;

      const bookNum = question.verseRef.bookNum;
      const chapterNum = question.verseRef.chapterNum;

      if (!questionsByBook.has(bookNum)) {
        questionsByBook.set(bookNum, { numQuestions: 0, numAnswered: 0 });
      }
      if (!questionsByChapter.has(bookNum)) {
        questionsByChapter.set(bookNum, new Map());
      }
      if (!questionsByChapter.get(bookNum)!.has(chapterNum)) {
        questionsByChapter.get(bookNum)!.set(chapterNum, { numQuestions: 0, numAnswered: 0 });
      }

      questionsByBook.get(bookNum)!.numQuestions++;
      questionsByChapter.get(bookNum)!.get(chapterNum)!.numQuestions++;

      for (const answer of question.answers) {
        if (answer.ownerRef === this.userService.currentUserId) {
          questionsByBook.get(bookNum)!.numAnswered++;
          questionsByChapter.get(bookNum)!.get(chapterNum)!.numAnswered++;
          // only count one answer, even if the user answered multiple times
          break;
        }
      }
    }

    this.questionsByBook = questionsByBook;
    this.questionsByChapter = questionsByChapter;
  }

  get books(): number[] {
    return Array.from(this.questionsByBook.keys()).sort((a, b) => a - b);
  }

  getBookName(book: number): string {
    return this.i18n.localizeBook(book);
  }

  getMessageFor(book: number): string {
    const progress = this.questionsByBook.get(book);
    if (progress == null) return '';

    const percent = Math.floor((progress.numAnswered / progress.numQuestions) * 100);

    return `${percent}% - You've answered ${progress.numAnswered} of ${
      progress.numQuestions
    } questions in ${this.getBookName(book)}!`;
  }

  getDataFor(book: number): number[] {
    const progress = this.questionsByBook.get(book);
    if (progress == null) return [];
    return [progress.numAnswered, progress.numQuestions - progress.numAnswered];
  }

  answered(book: number): number {
    const progress = this.questionsByBook.get(book);
    if (progress == null) return 0;
    return progress.numAnswered;
  }

  unanswered(book: number): number {
    const progress = this.questionsByBook.get(book);
    if (progress == null) return 0;
    return progress.numQuestions - progress.numAnswered;
  }

  getChapters(book: number): number[] {
    if (this.shouldShowChaptersInBook(book) === false) return [];

    const chapters = Array.from(this.questionsByChapter.get(book)!.keys()).sort((a, b) => a - b);
    return chapters;
  }

  answeredInChapter(book: number, chapter: number): number {
    const progress = this.questionsByChapter.get(book)?.get(chapter);
    if (progress == null) return 0;
    return progress.numAnswered;
  }

  unansweredInChapter(book: number, chapter: number): number {
    const progress = this.questionsByChapter.get(book)?.get(chapter);
    if (progress == null) return 0;
    return progress.numQuestions - progress.numAnswered;
  }

  chapterMessage(book: number, chapter: number): string {
    const progress = this.questionsByChapter.get(book)?.get(chapter);
    if (progress == null) return '';

    return `You've answered ${progress.numAnswered} of ${progress.numQuestions} questions in ${this.getBookName(
      book
    )} ${chapter}`;
  }

  toggleBook(book: number): void {
    this.bookSelections[book] = !this.bookSelections[book];
  }

  shouldShowChaptersInBook(book: number): boolean {
    return this.bookSelections[book] ?? false;
  }
}
