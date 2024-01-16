import { Directive, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { NoticeService } from './notice.service';
import { SubscriptionDisposable } from './subscription-disposable';

/**
 * This is the abstract base class for components that load data from the backend.
 *
 * It automatically unsubscribes from observables by extending the SubscriptionDisposable class and properly handles
 * loading status using the NoticeService.
 */
// Decorator required by Angular compiler
@Directive()
// eslint-disable-next-line @angular-eslint/directive-class-suffix
export abstract class DataLoadingComponent extends SubscriptionDisposable implements OnDestroy {
  private isLoadingSource$ = new BehaviorSubject<boolean>(false);

  constructor(protected readonly noticeService: NoticeService) {
    super();
  }

  get isLoading$(): Observable<boolean> {
    return this.isLoadingSource$.asObservable();
  }

  get isLoading(): boolean {
    return this.isLoadingSource$.value;
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.loadingFinished();
  }

  protected loadingStarted(): void {
    if (!this.isLoading) {
      this.noticeService.loadingStarted();
      this.isLoadingSource$.next(true);
    }
  }

  protected loadingFinished(): void {
    if (this.isLoading) {
      this.noticeService.loadingFinished();
      this.isLoadingSource$.next(false);
    }
  }
}
