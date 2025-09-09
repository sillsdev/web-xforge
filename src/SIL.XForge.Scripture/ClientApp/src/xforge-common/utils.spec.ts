import { Component, DestroyRef, OnDestroy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { quietTakeUntilDestroyed } from './util/rxjs-util';
import { getAspCultureCookieLanguage, getLinkHTML } from './utils';

describe('xforge-common utils', () => {
  it('should parse ASP Culture cookie', () => {
    let language = getAspCultureCookieLanguage('c=ab');
    expect(language).toEqual('ab');

    language = getAspCultureCookieLanguage('uic=cd');
    expect(language).toEqual('cd');

    language = getAspCultureCookieLanguage('c=ab|uic=cd');
    expect(language).toEqual('cd');

    language = getAspCultureCookieLanguage('uic=cd|c=ab');
    expect(language).toEqual('cd');

    language = getAspCultureCookieLanguage('');
    expect(language).toEqual('en');
  });

  it('should correctly generate links', () => {
    expect(getLinkHTML('example', 'https://example.com')).toEqual(
      `<a href="https://example.com" target="_blank">example</a>`
    );
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
