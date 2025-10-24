import { Component, DestroyRef, OnDestroy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { quietTakeUntilDestroyed } from './util/rxjs-util';
import { getAspCultureCookieLanguage, getLinkHTML, isPopulatedString } from './utils';

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

  describe('isPopulatedString', () => {
    it('should return true for non-empty strings', () => {
      expect(isPopulatedString('a')).toBe(true);
      expect(isPopulatedString('  a  ')).toBe(true);
      expect(isPopulatedString(' ')).toBe(true);
      expect(isPopulatedString('0')).toBe(true);
      expect(isPopulatedString('false')).toBe(true);
      const value: string | null | undefined = 'abc';
      expect(isPopulatedString(value)).toBe(true);
    });

    it('should return false for null, undefined, empty strings, or non-strings', () => {
      expect(isPopulatedString(null)).toBe(false);
      expect(isPopulatedString(undefined)).toBe(false);
      expect(isPopulatedString('')).toBe(false);
      let value: string | null | undefined = '';
      expect(isPopulatedString(value)).toBe(false);
      value = null;
      expect(isPopulatedString(value)).toBe(false);
      value = undefined;
      expect(isPopulatedString(value)).toBe(false);
      expect(isPopulatedString(0)).toBe(false);
      expect(isPopulatedString({})).toBe(false);
      expect(isPopulatedString([])).toBe(false);
    });
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

@Component({})
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
