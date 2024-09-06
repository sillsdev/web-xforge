import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/** This class is a helper for tests. */
@Injectable({
  providedIn: 'root'
})
export class TestBreakpointObserver extends BreakpointObserver {
  private observe$: Subject<BreakpointState> = new Subject<BreakpointState>();
  private isMatchedResult: boolean = true;

  set matchedResult(value: boolean) {
    this.isMatchedResult = value;
  }

  observe(): Observable<BreakpointState> {
    return this.observe$;
  }

  isMatched(_: string | readonly string[]): boolean {
    return this.isMatchedResult;
  }

  emitObserveValue(result: boolean): void {
    this.observe$.next({ matches: result } as BreakpointState);
  }
}
