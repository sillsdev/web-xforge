import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { DateAdapter, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { BehaviorSubject } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { DateRangePickerComponent, lastDaysDateRange, NormalizedDateRange } from './date-range-picker.component';

describe('DateRangePickerComponent', () => {
  it('should initialize with the default range without telling the parent', () => {
    const defaultRange: NormalizedDateRange = lastDaysDateRange(14);
    const env = new TestEnvironment({ defaultRange });

    expect(env.component.dateRangeForm.value).toEqual({ start: defaultRange.start, end: defaultRange.end });
    expect(env.component.isDefaultRange).toBe(true);
    // The parent provided the range, so it does not need to be told about it.
    expect(env.emitSpy).not.toHaveBeenCalled();
  });

  it('can initiate with an empty range', () => {
    const env = new TestEnvironment();
    env.component.showReset = true;
    env.fixture.detectChanges();

    const initialFormValue = env.component.dateRangeForm.value;
    expect(initialFormValue.start).toBeNull();
    expect(initialFormValue.end).toBeNull();
    // Initialization with an empty range does not tell the parent about a range.
    expect(env.emitSpy).not.toHaveBeenCalled();
    expect(env.component.isDefaultRange).toBe(true);

    const endDate = new Date(env.component.maxSelectableDate);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 1);

    env.component.dateRangeForm.setValue({ start: startDate, end: endDate });
    env.fixture.detectChanges();
    // The range has been updated
    expect(env.emitSpy).toHaveBeenCalled();
    expect(env.component.isDefaultRange).toBe(false);

    // Clear the range
    expect(env.component.showReset).toBe(true);
    const clearButton = env.fixture.nativeElement.querySelector('[data-test-id="reset-button"]');
    clearButton.click();
    env.fixture.detectChanges();
    // Clearing the range tells the parent that no range is in effect.
    expect(env.emitSpy).toHaveBeenCalledWith(/* nothing */);
    expect(env.component.dateRangeForm.value).toEqual({ start: null, end: null });
    expect(env.component.isDefaultRange).toBe(true);
  });

  it('should not emit undefined for a range if the default is defined', () => {
    const env = new TestEnvironment({ defaultRange: lastDaysDateRange(14) });
    env.component.showReset = true;
    env.fixture.detectChanges();

    env.component.dateRangeForm.setValue({ start: null, end: null });
    env.fixture.detectChanges();
    // If the default range is defined, the date range picker should not consider a null range as valid
    expect(env.emitSpy).not.toHaveBeenCalled();
    expect(env.component.isDefaultRange).toBe(true);
  });

  it('replaces a selected range with a new default range without telling the parent', () => {
    const env = new TestEnvironment();
    const endDate = new Date(env.component.maxSelectableDate);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 1);
    env.component.dateRangeForm.setValue({ start: startDate, end: endDate });
    env.fixture.detectChanges();
    expect(env.component.isDefaultRange).toBe(false);
    env.emitSpy.calls.reset();
    const newDefaultRange: NormalizedDateRange = lastDaysDateRange(14);

    // SUT
    env.component.defaultRange = newDefaultRange;
    env.fixture.detectChanges();

    expect(env.component.dateRangeForm.value).toEqual({ start: newDefaultRange.start, end: newDefaultRange.end });
    expect(env.component.isDefaultRange).toBe(true);
    expect(env.emitSpy).not.toHaveBeenCalled();
  });

  it('clears the range for an undefined default range without telling the parent', () => {
    const env = new TestEnvironment({ defaultRange: lastDaysDateRange(14) });

    // SUT
    env.component.defaultRange = undefined;
    env.fixture.detectChanges();

    expect(env.component.dateRangeForm.value).toEqual({ start: null, end: null });
    expect(env.component.isDefaultRange).toBe(true);
    expect(env.emitSpy).not.toHaveBeenCalled();
  });

  it('computes a range from the beginning of the day some days ago through the end of today', () => {
    const range: NormalizedDateRange = lastDaysDateRange(14);

    const expectedStart = new Date();
    expectedStart.setHours(0, 0, 0, 0);
    expectedStart.setDate(expectedStart.getDate() - 14);
    expect(range.start).toEqual(expectedStart);
    const expectedEnd = new Date();
    expectedEnd.setHours(23, 59, 59, 999);
    expect(range.end).toEqual(expectedEnd);
  });

  it('should disable future dates', () => {
    const env = new TestEnvironment();
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    expect(env.component.disableFutureDates(today)).toBe(true);
    expect(env.component.disableFutureDates(tomorrow)).toBe(false);
  });

  it('should show format hint for locale', () => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    expect(env.component.dateRangeFormatHint).toBeDefined();
  });

  describe('date adapter localization', () => {
    it('should mirror i18n locale changes in the date adapter', () => {
      const env = new TestEnvironment();
      const dateAdapter = TestBed.inject(DateAdapter);
      spyOn(dateAdapter, 'setLocale');

      const updatedLocale: Locale = {
        canonicalTag: 'fr',
        direction: 'ltr',
        englishName: 'French',
        localName: 'Français',
        production: true,
        tags: ['fr']
      };

      env.localeSubject.next(updatedLocale);

      expect(dateAdapter.setLocale).toHaveBeenCalledWith('fr');
    });
  });
});

class TestEnvironment {
  readonly localeSubject: BehaviorSubject<Locale>;
  readonly i18nStub: Partial<I18nService>;
  readonly fixture: ComponentFixture<DateRangePickerComponent>;
  readonly component: DateRangePickerComponent;
  readonly emitSpy: jasmine.Spy<DateRangePickerComponent['dateRangeChange']['emit']>;

  constructor({
    defaultRange = undefined
  }: {
    defaultRange?: NormalizedDateRange;
  } = {}) {
    const initialLocale: Locale = {
      canonicalTag: 'en-US',
      direction: 'ltr',
      englishName: 'English',
      localName: 'English',
      production: true,
      tags: ['en-US']
    };

    this.localeSubject = new BehaviorSubject<Locale>(initialLocale);

    this.i18nStub = {
      localeCode: 'en-US',
      locale$: this.localeSubject.asObservable()
    };

    TestBed.configureTestingModule({
      imports: [DateRangePickerComponent, ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatDatepickerModule],
      providers: [provideNativeDateAdapter(), FormBuilder, { provide: I18nService, useValue: this.i18nStub }]
    }).compileComponents();

    this.fixture = TestBed.createComponent(DateRangePickerComponent);
    this.component = this.fixture.componentInstance;
    this.emitSpy = spyOn(this.component.dateRangeChange, 'emit').and.callThrough();
    if (defaultRange != null) this.component.defaultRange = defaultRange;
    this.fixture.detectChanges();
  }
}
