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
  private _isLoading$ = new BehaviorSubject<boolean>(false);
  private _isLoaded$ = new BehaviorSubject<boolean>(false);

  constructor(protected readonly noticeService: NoticeService) {
    super();
  }

  get isLoadingData$(): Observable<boolean> {
    return this._isLoading$.asObservable();
  }

  get isLoadingData(): boolean {
    return this._isLoading$.value;
  }

  get isLoaded$(): Observable<boolean> {
    return this._isLoaded$.asObservable();
  }

  get isLoaded(): boolean {
    return this._isLoaded$.value;
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.loadingFinished();
  }

  protected loadingStarted(): void {
    if (!this.isLoadingData) {
      this.noticeService.loadingStarted();
      this._isLoading$.next(true);
      this._isLoaded$.next(false);
    }
  }

  protected loadingFinished(): void {
    if (this.isLoadingData) {
      this.noticeService.loadingFinished();
      this._isLoading$.next(false);
      this._isLoaded$.next(true);
    }
  }
}
