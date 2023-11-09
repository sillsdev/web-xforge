import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UserService } from 'xforge-common/user.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { QuestionDoc } from 'src/app/core/models/question-doc';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { Injectable } from '@angular/core';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { Canon } from '@sillsdev/scripture';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';
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
    this.subscribe(this.activatedProjectService.projectDoc$, projectDoc => this.refreshQuestionQuery(projectDoc));
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

    // TODO Make the code that ultimately consumes this value capable of handling the case where there is no link at
    // this time without having to resort to this workaround.
    if (projectId == null) return [''];

    let book: string;
    let chapter: number;
    if (verseRef != null) {
      book = Canon.bookNumberToId(verseRef.bookNum);
      chapter = verseRef.chapterNum;
    } else if (this.activatedProjectService.projectDoc != null) {
      const projectDoc = this.activatedProjectService.projectDoc;
      const firstText = projectDoc.data?.texts[0];
      book = Canon.bookNumberToId(firstText?.bookNum ?? Canon.firstBook);
      chapter = firstText?.chapters[0]?.number ?? 1;
    } else {
      book = Canon.bookNumberToId(Canon.firstBook);
      chapter = 1;
    }
    return ['projects', projectId, 'checking', book, String(chapter)];
  }

  private async refreshQuestionQuery(projectDoc: SFProjectProfileDoc | undefined): Promise<void> {
    this.firstUnansweredQuestionQuery = undefined;
    if (projectDoc?.data == null) {
      return;
    }

    // ensure user has permission to view questions
    const userId = this.userService.currentUserId;
    if (!SF_PROJECT_RIGHTS.hasRight(projectDoc.data, userId, SFProjectDomain.Answers, Operation.View)) {
      return;
    }

    const query = await this.questionService.queryFirstUnansweredQuestion(projectDoc.id, userId);

    // ensure the project has not changed while awaiting the query
    if (this.activatedProjectService.projectId === projectDoc.id) {
      this.firstUnansweredQuestionQuery = query;
    }
  }
}
