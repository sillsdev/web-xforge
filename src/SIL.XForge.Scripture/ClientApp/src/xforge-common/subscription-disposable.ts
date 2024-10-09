import { Directive, OnDestroy } from '@angular/core';
import { Observable, Subject, Subscription } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

/** Handles Observable unsubscribing
 * @deprecated Angular previously did not have a good way to subscribe to a component's destruction. This class was used
 * to help handle unsubscribing when a component was destroyed. When possible, use
 * {@link https://angular.dev/api/core/DestroyRef DestroyRef}.
 */
// Decorator required by Angular compiler
@Directive()
// eslint-disable-next-line @angular-eslint/directive-class-suffix
export abstract class SubscriptionDisposable implements OnDestroy {
  protected ngUnsubscribe: Subject<void> = new Subject<void>();

  ngOnDestroy(): void {
    this.dispose();
  }

  dispose(): void {
    this.ngUnsubscribe.next();
    this.ngUnsubscribe.complete();
  }

  protected subscribe<T>(
    observable: Observable<T>,
    next?: (value: T) => void,
    error?: (error: any) => void,
    complete?: () => void
  ): Subscription {
    return observable.pipe(takeUntil(this.ngUnsubscribe)).subscribe(next, error, complete);
  }
}
