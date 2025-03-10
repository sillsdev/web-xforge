import { Directive, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { NoticeService } from './notice.service';

/**
 * This is the abstract base class for components that need to indicate when they are loading data in order to display
 * the loading indicator. Subclasses call `loadingStarted()` and `loadingFinished()` to indicate when they are loading
 * data. When the component is destroyed, it automatically calls `loadingFinished()`.
 */
// Decorator required by Angular compiler
@Directive()
// eslint-disable-next-line @angular-eslint/directive-class-suffix
export abstract class DataLoadingComponent implements OnDestroy {
  private _isLoading$ = new BehaviorSubject<boolean>(false);
  private _isLoaded$ = new BehaviorSubject<boolean>(false);

  constructor(protected readonly noticeService: NoticeService) {}

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
    this.loadingFinished();
  }

  protected loadingStarted(): void {
    if (!this.isLoadingData) {
      this.noticeService.loadingStarted(this.constructor.name);
      this._isLoading$.next(true);
      this._isLoaded$.next(false);
    }
  }

  protected loadingFinished(): void {
    if (this.isLoadingData) {
      this.noticeService.loadingFinished(this.constructor.name);
      this._isLoading$.next(false);
      this._isLoaded$.next(true);
    }
  }
}
