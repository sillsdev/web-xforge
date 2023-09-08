import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UserService } from 'xforge-common/user.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { QuestionDoc } from 'src/app/core/models/question-doc';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { Injectable } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { CheckingQuestionsService } from './checking-questions.service';

/**
 * Provides information about what location the user should be sent to in order to resume community checking (or start
 * for the first time).
 *
 * At present, this means sending the user to the first question that is unanswered, and limiting the scope of questions
 * to the chapter level.
 */
@Injectable({ providedIn: 'root' })
export class ResumeCheckingService extends SubscriptionDisposable {
  firstUnansweredQuestionQuery?: RealtimeQuery<QuestionDoc>;

  constructor(
    private readonly userService: UserService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly questionService: CheckingQuestionsService
  ) {
    super();
    this.subscribe(this.activatedProjectService.projectId$, projectId => this.refreshQuestionQuery(projectId));
  }

  /**
   * @returns The question for the user to resume community checking on, or undefined, if no project is selected, the
   * question has not yet been loaded, or no question matches the criteria (e.g. user has answered all questions'
   * already)
   */
  getQuestion(): QuestionDoc | undefined {
    return this.firstUnansweredQuestionQuery?.docs[0];
  }

  /**
   * @returns An path to navigate to the community checking component and resume checking. In general this will lead
   * the user to first unanswered question.
   */
  getLink(): string[] {
    const verseRef = this.getQuestion()?.data?.verseRef;
    const projectId = this.activatedProjectService.projectId;

    if (verseRef != null && projectId != null) {
      const book = Canon.bookNumberToId(verseRef.bookNum);
      return ['projects', projectId, 'checking', book, String(verseRef.chapterNum)];
    } else {
      // TODO FIXME handle case where no questions, or all questions already answered
      return [''];
    }
  }

  private async refreshQuestionQuery(projectId: string | undefined): Promise<void> {
    this.firstUnansweredQuestionQuery = undefined;
    if (projectId == null) {
      return;
    }

    const query = await this.questionService.queryFirstUnansweredQuestion(projectId, this.userService.currentUserId);

    // ensure the project has not changed while awaiting the query
    if (this.activatedProjectService.projectId === projectId) {
      this.firstUnansweredQuestionQuery = query;
    }
  }
}
