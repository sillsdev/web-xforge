import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { DateAdapter, provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { BehaviorSubject } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { DateRangePickerComponent } from './date-range-picker.component';

describe('DateRangePickerComponent', () => {
  it('should initialize with default date range', () => {
    const env = new TestEnvironment();
    env.fixture.detectChanges();
    const formValue = env.component.dateRangeForm.value;
    expect(formValue.start).toBeTruthy();
    expect(formValue.end).toBeTruthy();
    expect(formValue.start!.getTime()).toBeLessThan(formValue.end!.getTime());
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

  constructor() {
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
      imports: [
        DateRangePickerComponent,
        ReactiveFormsModule,
        MatFormFieldModule,
        MatInputModule,
        MatDatepickerModule,
        NoopAnimationsModule
      ],
      providers: [provideNativeDateAdapter(), FormBuilder, { provide: I18nService, useValue: this.i18nStub }]
    }).compileComponents();

    this.fixture = TestBed.createComponent(DateRangePickerComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }
}
