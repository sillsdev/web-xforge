import { Injectable } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { from, merge, Observable, of } from 'rxjs';
import { distinctUntilChanged, filter, finalize, map, shareReplay, switchMap, tap } from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { areStringArraysEqual } from 'xforge-common/util/string-util';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
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
  private readonly questionLink$: Observable<string[] | undefined> = this.createLink();

  constructor(
    private readonly userService: UserService,
    private readonly activatedProjectService: ActivatedProjectService,
    private readonly questionService: CheckingQuestionsService,
    private readonly onlineStatusService: OnlineStatusService
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
    let projectId: string = '';

    return this.activatedProjectService.changes$.pipe(
      filterNullish(),
      tap(projectDoc => (projectId = projectDoc.id)),
      switchMap(projectDoc =>
        this.getQuestion(projectDoc).pipe(
          map(question => this.getLinkTokens(projectDoc, question)),
          distinctUntilChanged((prev, curr) => {
            if (prev == null && curr == null) {
              return true;
            }

            if (prev == null || curr == null) {
              return false;
            }

            return areStringArraysEqual(prev, curr);
          })
        )
      ),
      shareReplay(1),
      filter(link => link == null || link[1] === projectId) // Ensure link is for current project
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
        merge(
          query.ready$.pipe(
            // Query 'ready$' will not emit when offline (initial emission of false is due to BehaviorSubject),
            // but offline docs may be available.
            filter(isReady => isReady || !this.onlineStatusService.isOnline)
          ),
          query.remoteChanges$,
          query.localChanges$,
          query.remoteDocChanges$
        ).pipe(
          map(() => query?.docs[0]),
          finalize(() => query?.dispose())
        )
      )
    );
  }
}
