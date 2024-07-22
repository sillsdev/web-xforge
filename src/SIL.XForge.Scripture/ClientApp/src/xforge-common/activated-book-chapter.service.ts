import { Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivationEnd, Params, Router } from '@angular/router';
import { Canon } from '@sillsdev/scripture';
import { isEqual } from 'lodash-es';
import {
  BehaviorSubject,
  Observable,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  of,
  shareReplay,
  switchMap,
  tap
} from 'rxjs';
import { ActivatedProjectUserConfigService } from './activated-project-user-config.service';
import { ActivatedProjectService } from './activated-project.service';
import { filterNullish } from './util/rxjs-util';

export interface RouteBookChapter {
  bookId?: string;
  chapter?: number;
}

@Injectable({
  providedIn: 'root'
})
export class ActivatedBookChapterService {
  private routeBookChapterSource$ = new BehaviorSubject<RouteBookChapter | undefined>(undefined);
  readonly routeBookChapter$: Observable<RouteBookChapter | undefined> = this.routeBookChapterSource$.pipe(
    distinctUntilChanged(isEqual)
  );

  readonly activatedBookChapter$: Observable<RouteBookChapter | undefined> = combineLatest([
    this.routeBookChapter$.pipe(filterNullish()),
    this.activatedProject.changes$.pipe(
      map(doc => doc?.data),
      filterNullish()
    ),
    this.activatedProjectUserConfig.projectUserConfig$.pipe(filterNullish())
  ]).pipe(
    switchMap(([{ bookId, chapter }, projectProfile, projectUserConfig]) => {
      if (bookId == null) {
        return of(undefined);
      }

      if (chapter == null) {
        chapter = projectUserConfig.selectedChapterNum;

        if (chapter == null) {
          let bookNum: number = Canon.bookIdToNumber(bookId);
          chapter = projectProfile.texts.find(t => t.bookNum === bookNum)?.chapters[0]?.number;
        }
      }

      return of({ bookId, chapter });
    }),
    distinctUntilChanged(isEqual),
    tap(activatedBookChapter => console.log('activatedBookChapter$', activatedBookChapter)),
    shareReplay(1)
  );

  constructor(
    private readonly router: Router,
    private readonly activatedProject: ActivatedProjectService,
    private readonly activatedProjectUserConfig: ActivatedProjectUserConfigService
  ) {
    this.router.events
      .pipe(
        takeUntilDestroyed(),
        filter((event): event is ActivationEnd => event instanceof ActivationEnd)
      )
      .subscribe(event => {
        this.routeBookChapterSource$.next(this.getBookChapterFromParams(event.snapshot.params));
      });
  }

  private getBookChapterFromParams(params: Params): RouteBookChapter | undefined {
    const bookId = params.bookId;
    const chapter = params.chapter ? Number(params.chapter) : undefined;

    return bookId ? { bookId, chapter } : undefined;
  }
}
