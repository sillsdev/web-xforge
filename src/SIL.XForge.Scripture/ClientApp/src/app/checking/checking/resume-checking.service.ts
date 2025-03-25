import { DestroyRef, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { combineLatest, from, merge, Observable, of } from 'rxjs';
import {
  delay,
  distinctUntilChanged,
  filter,
  finalize,
  map,
  shareReplay,
  startWith,
  switchMap,
  tap
} from 'rxjs/operators';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { noopDestroyRef } from 'xforge-common/realtime.service';
import { UserService } from 'xforge-common/user.service';
import { areStringArraysEqual } from 'xforge-common/util/string-util';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { CheckingQuestionsService } from './checking-questions.service';
import { ResumeBaseService } from './resume-base.service';

/**
 * Provides information about what location the user should be sent to in order to resume community checking (or start
 * for the first time).
 *
 * At present, this means sending the user to their last location. If there is no last location, it will send them to
 * the first unanswered question.
 */
@Injectable({ providedIn: 'root' })
export class ResumeCheckingService extends ResumeBaseService {
  /**
   * Gets a path to navigate to the community checking component and resume checking. In general, this will lead
   * the user to first unanswered question.  If there are no unanswered questions, the path will be to the first
   * book/chapter in the project.
   * @returns The path tokens, or undefined if project has no texts.
   */
  readonly resumeLink$: Observable<string[] | undefined> = this.createLink();

  constructor(
    private readonly questionService: CheckingQuestionsService,
    router: Router,
    userService: UserService,
    activatedProjectService: ActivatedProjectService,
    onlineStatusService: OnlineStatusService,
    projectService: SFProjectService,
    destroyRef: DestroyRef
  ) {
    super(router, userService, activatedProjectService, onlineStatusService, projectService, destroyRef);
  }

  private createLink(): Observable<string[] | undefined> {
    let projectId: string = '';

    return combineLatest([
      this.activatedProjectService.changes$,
      this.projectUserConfigDoc$.pipe(
        switchMap(doc => doc?.changes$.pipe(startWith(undefined)) ?? of(undefined)),
        map(() => this.projectUserConfigDoc$.getValue())
      )
    ]).pipe(
      filter(([projectDoc, projectUserConfigDoc]) => projectDoc !== undefined && projectUserConfigDoc !== undefined),
      tap(([projectDoc]) => (projectId = projectDoc?.id || '')),
      map(([projectDoc, projectUserConfigDoc]) => {
        const config = projectUserConfigDoc?.data;
        if (config?.selectedBookNum && config?.selectedChapterNum) {
          return of(this.getLinkTokens(projectDoc!, config.selectedBookNum, config.selectedChapterNum));
        }

        return this.getQuestion(projectDoc).pipe(
          map(question => this.getLinkTokensFromQuestion(projectDoc, question)),
          distinctUntilChanged((prev, curr) => {
            if (prev == null && curr == null) {
              return true;
            }

            if (prev == null || curr == null) {
              return false;
            }

            return areStringArraysEqual(prev, curr);
          })
        );
      }),
      switchMap(observable => observable),
      shareReplay(1),
      filter(link => link == null || link[1] === projectId), // Ensure link is for current project
      delay(0)
    );
  }

  private getLinkTokensFromQuestion(
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

    return this.getLinkTokens(projectDoc, bookNum, chapterNum);
  }

  private getLinkTokens(projectDoc: SFProjectProfileDoc, bookNum: number, chapterNum: number): string[] {
    return ['projects', projectDoc.id, 'checking', Canon.bookNumberToId(bookNum), chapterNum.toString()];
  }

  /**
   * Gets the question for the user to resume community checking on.
   * @returns A question doc, or undefined if no project is selected,
   * or the first question if no question matches the criteria (e.g. user has answered all questions' already)
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

    // This query is not associated with a component, so provide a no-op destroy ref
    return from(this.questionService.queryQuestions(projectDoc.id, { activeOnly: true }, noopDestroyRef)).pipe(
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
          map(() => {
            const firstUnansweredQuestion = query?.docs.find(q => q.data?.answers.every(a => a.ownerRef !== userId));
            return firstUnansweredQuestion ?? query.docs[0];
          }),
          finalize(() => query?.dispose())
        )
      )
    );
  }
}
