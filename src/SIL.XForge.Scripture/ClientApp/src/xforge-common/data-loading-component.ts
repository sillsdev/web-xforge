import { Directive, OnDestroy } from '@angular/core';
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
  private _isLoading: boolean = false;

  constructor(protected readonly noticeService: NoticeService) {
    super();
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this.loadingFinished();
  }

  protected loadingStarted(): void {
    if (!this._isLoading) {
      this.noticeService.loadingStarted();
      this._isLoading = true;
    }
  }

  protected loadingFinished(): void {
    if (this._isLoading) {
      this.noticeService.loadingFinished();
      this._isLoading = false;
    }
  }
}
