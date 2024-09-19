import { Injectable } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivationEnd, Params, Router } from '@angular/router';
import { isEqual } from 'lodash-es';
import { BehaviorSubject, Observable, distinctUntilChanged, filter } from 'rxjs';

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

  constructor(private readonly router: Router) {
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
