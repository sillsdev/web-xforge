import { DestroyRef, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { combineLatest, delay, filter, map, Observable, of, startWith, switchMap } from 'rxjs';
import { ActivatedProjectService } from 'xforge-common/activated-project.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { SFProjectService } from '../../core/sf-project.service';
import { ResumeBaseService } from './resume-base.service';

/**
 * Provides information about what location the user should be sent to in order to resume translate (or start
 * for the first time).
 *
 * This is their last location, if it exists. Otherwise, it will be the first chapter of the first book.
 */
@Injectable({ providedIn: 'root' })
export class ResumeTranslateService extends ResumeBaseService {
  readonly resumeLink$: Observable<string[] | undefined> = this.createLink();

  constructor(
    router: Router,
    userService: UserService,
    activatedProjectService: ActivatedProjectService,
    onlineStatusService: OnlineStatusService,
    projectService: SFProjectService,
    destroyRef: DestroyRef
  ) {
    super(router, userService, activatedProjectService, onlineStatusService, projectService, destroyRef);
  }

  protected createLink(): Observable<string[] | undefined> {
    return combineLatest([
      this.activatedProjectService.changes$,
      this.projectUserConfigDoc$.pipe(
        switchMap(doc => doc?.changes$.pipe(startWith(undefined)) ?? of(undefined)),
        map(() => this.projectUserConfigDoc$.getValue())
      )
    ]).pipe(
      filter(([projectDoc, projectUserConfigDoc]) => projectDoc !== undefined && projectUserConfigDoc !== undefined),
      map(([projectDoc, projectUserConfigDoc]) => {
        const project = projectDoc?.data;
        const config = projectUserConfigDoc?.data;
        const doesLastBookExist =
          projectDoc?.data?.texts.find(t => t.bookNum === config?.selectedBookNum) !== undefined;

        let bookNum: number;
        let chapterNum: number;
        if (doesLastBookExist) {
          bookNum = config!.selectedBookNum ?? project?.texts[0]?.bookNum ?? Canon.firstBook;
          chapterNum = config?.selectedChapterNum ?? project?.texts[bookNum]?.chapters[0].number ?? 1;
        } else {
          bookNum = project?.texts[0]?.bookNum ?? Canon.firstBook;
          chapterNum = project?.texts[bookNum]?.chapters[0].number ?? 1;
        }
        const bookId = Canon.bookNumberToId(bookNum);

        return this.getProjectLink([bookId, String(chapterNum)]);
      }),
      // The selected book and chapter are updated by CheckingQuestionsComponent during a change detection cycle.
      // This causes the link to the translate page to cause ExpressionChangedAfterItHasBeenCheckedError. To avoid this,
      // delay the link update until the next change detection cycle.
      delay(0)
    );
  }

  protected getProjectLink(subPages: string[] = []): string[] {
    if (this.activatedProjectService.projectId == null) {
      return [];
    }
    return ['/projects', this.activatedProjectService.projectId, 'translate', ...subPages];
  }
}
