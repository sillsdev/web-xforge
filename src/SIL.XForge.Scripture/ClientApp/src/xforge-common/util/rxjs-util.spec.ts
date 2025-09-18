import { Component, DestroyRef, OnDestroy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, from, Observable } from 'rxjs';
import { filterNullish, quietTakeUntilDestroyed } from './rxjs-util';

describe('filterNullUndefined', () => {
  it('should filter out only null and undefined values', () => {
    const source$: Observable<number | string | boolean | object | bigint | undefined | null> = from([
      0,
      1,
      undefined,
      null,
      NaN,
      {},
      'hello',
      '',
      null,
      false,
      undefined,
      -0,
      0n
    ]);
    const result$: Observable<number | string | boolean | object | bigint> = source$.pipe(filterNullish());

    const expected: (number | string | boolean | object | bigint)[] = [0, 1, NaN, {}, 'hello', '', false, -0, 0n];
    const result: (number | string | boolean | object | bigint)[] = [];
    result$.subscribe(value => result.push(value));

    expect(result).toEqual(expected);
  });
});

describe('quietTakeUntilDestroyed', () => {
  it('should unsubscribe observables when the destroyRef callback is called', () => {
    let onDestroyCallback: () => void;
    const destroyRef: DestroyRef = {
      onDestroy: (callback: () => void) => {
        onDestroyCallback = callback;
        return () => {};
      }
    };

    let completed = false;

    new BehaviorSubject(1).pipe(quietTakeUntilDestroyed(destroyRef)).subscribe({
      complete: () => {
        completed = true;
      }
    });

    expect(completed).toBeFalse();
    onDestroyCallback!();
    expect(completed).toBeTrue();
  });

  it('should unsubscribe when the component is destroyed', () => {
    const fixture = TestBed.createComponent(QuietTakeUntilDestroyedTestComponent);
    const component = fixture.componentInstance;
    expect(component.mainSubjectCompleted).toBeFalse();
    expect(component.subjectCreatedAfterDestroyCompleted).toBeFalse();
    fixture.destroy();
    expect(component.mainSubjectCompleted).toBeTrue();
    expect(component.subjectCreatedAfterDestroyCompleted).toBeTrue();
  });
});

@Component({
  standalone: false
})
class QuietTakeUntilDestroyedTestComponent implements OnDestroy {
  mainSubjectCompleted = false;
  subjectCreatedAfterDestroyCompleted = false;

  constructor(private destroyRef: DestroyRef) {
    new BehaviorSubject(1).pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe({
      complete: () => {
        this.mainSubjectCompleted = true;
      }
    });
  }

  ngOnDestroy(): void {
    new BehaviorSubject(1).pipe(quietTakeUntilDestroyed(this.destroyRef, { logWarnings: false })).subscribe({
      complete: () => {
        this.subjectCreatedAfterDestroyCompleted = true;
      }
    });
  }
}
