import { Injectable } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { asyncScheduler, from, merge, Observable, of } from 'rxjs';
import { map, shareReplay, switchMap, throttleTime } from 'rxjs/operators';
import { QuestionDoc } from 'src/app/core/models/question-doc';
import { SFProjectProfileDoc } from 'src/app/core/models/sf-project-profile-doc';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { UserService } from 'xforge-common/user.service';
import { CheckingQuestionsService } from './checking-questions.service';

/**
 * Provides information about what location the user should be sent to in order to resume community checking (or start
 * for the first time).
 *
 * At present, this means sending the user to the first question that is unanswered, and limiting the scope of questions
 * to the chapter level.
 */
@Injectable({ providedIn: 'root' })
export class ResumeCheckingService {
  private readonly questionLink$: Observable<string[] | undefined> = this.createLink().pipe(shareReplay(1));

  constructor(
    private readonly userService: UserService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly questionService: CheckingQuestionsService
  ) {}

  /**
   * Gets a path to navigate to the community checking component and resume checking. In general, this will lead
   * the user to first unanswered question.  If there are no unanswered questions, the path will be to the first
   * book/chapter in the project.
   * @returns The path tokens, or undefined if project has no texts.
   */
  get checkingLink$(): Observable<string[] | undefined> {
    return this.questionLink$;
  }

  private createLink(): Observable<string[] | undefined> {
    return this.activatedProjectService.projectDoc$.pipe(
      switchMap(projectDoc =>
        this.getQuestion(projectDoc).pipe(map(question => this.getLinkTokens(projectDoc, question)))
      )
    );
  }

  private getLinkTokens(
    projectDoc: SFProjectProfileDoc | undefined,
    questionDoc: QuestionDoc | undefined
  ): string[] | undefined {
    if (projectDoc == null) {
      return undefined;
    }

    const verseRef = questionDoc?.data?.verseRef;
    let bookNum: number;
    let chapterNum: number;

    if (verseRef != null) {
      bookNum = verseRef.bookNum;
      chapterNum = verseRef.chapterNum;
    } else {
      // No questions, or all questions already answered.  Send user to first book/chapter.
      const firstTextWithChapters = projectDoc.data?.texts.find(t => t.chapters.length > 0);

      if (firstTextWithChapters == null) {
        return undefined;
      }

      bookNum = firstTextWithChapters.bookNum;
      chapterNum = firstTextWithChapters.chapters[0].number;
    }

    return ['projects', projectDoc.id, 'checking', Canon.bookNumberToId(bookNum), chapterNum.toString()];
  }

  /**
   * Gets the question for the user to resume community checking on.
   * @returns A question doc, or undefined if no project is selected
   * or no question matches the criteria (e.g. user has answered all questions' already)
   */
  private getQuestion(projectDoc: SFProjectProfileDoc | undefined): Observable<QuestionDoc | undefined> {
    if (projectDoc?.data == null) {
      return of(undefined);
    }

    // Ensure user has permission to view questions
    const userId = this.userService.currentUserId;
    if (!SF_PROJECT_RIGHTS.hasRight(projectDoc.data, userId, SFProjectDomain.Answers, Operation.View)) {
      return of(undefined);
    }

    return from(this.questionService.queryFirstUnansweredQuestion(projectDoc.id, userId)).pipe(
      switchMap(query =>
        merge(query.ready$, query.remoteChanges$, query.localChanges$, query.remoteDocChanges$).pipe(
          throttleTime(100, asyncScheduler, { leading: false, trailing: true }),
          map(() => query?.docs[0])
        )
      )
    );
  }
}
