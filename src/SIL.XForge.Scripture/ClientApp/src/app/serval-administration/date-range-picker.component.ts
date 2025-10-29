import { Component, DestroyRef, EventEmitter, OnInit, Output } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn
} from '@angular/forms';
import { DateAdapter } from '@angular/material/core';
import {
  MatDatepickerToggle,
  MatDateRangeInput,
  MatDateRangePicker,
  MatEndDate,
  MatStartDate
} from '@angular/material/datepicker';
import { MatFormField, MatFormFieldModule, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { distinctUntilChanged, map } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';

/** Form value for date range inputs */
interface DateRangeFormValue {
  start: Date | null;
  end: Date | null;
}

/** Normalized date range with validated start and end dates */
export interface NormalizedDateRange {
  start: Date;
  end: Date;
}

/**
 * Date range picker component for selecting date ranges. Manages its own form validation and emits normalized and valid
 * date range changes.
 */
@Component({
  selector: 'app-date-range-picker',
  templateUrl: './date-range-picker.component.html',
  styleUrls: ['./date-range-picker.component.scss'],
  imports: [
    ReactiveFormsModule,
    MatDatepickerToggle,
    MatFormField,
    MatFormFieldModule,
    MatDateRangeInput,
    MatDateRangePicker,
    MatEndDate,
    MatStartDate,
    MatInput,
    MatLabel
  ]
})
export class DateRangePickerComponent implements OnInit {
  /** Maximum selectable date (today) */
  readonly maxSelectableDate: Date;

  /** Current date range format hint based on locale */
  dateRangeFormatHint: string | undefined;

  /** Form group for date range inputs */
  readonly dateRangeForm: FormGroup<{
    start: FormControl<Date | null>;
    end: FormControl<Date | null>;
  }>;

  private readonly defaultDaysBack = 14;

  /** Event emitted when the date range changes with a valid normalized range */
  @Output() dateRangeChange = new EventEmitter<NormalizedDateRange>();

  constructor(
    private formBuilder: FormBuilder,
    private dateAdapter: DateAdapter<Date>,
    private i18nService: I18nService,
    private destroyRef: DestroyRef
  ) {
    this.maxSelectableDate = this.endOfTheDayOf(new Date());

    // Custom validator to disallow future dates
    const noFutureDateValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
      const value: Date | null = control.value;
      if (value == null) return null;
      // Compare only date part
      const normalized = this.beginningOfTheDayOf(value);
      if (normalized > this.maxSelectableDate) {
        return { futureDate: true };
      }
      return null;
    };

    this.dateRangeForm = this.formBuilder.group({
      start: new FormControl<Date | null>(null, [noFutureDateValidator]),
      end: new FormControl<Date | null>(null, [noFutureDateValidator])
    });
  }

  ngOnInit(): void {
    // Set initial range
    const initialEndDate = new Date(this.maxSelectableDate);
    const initialStartDate = new Date(this.maxSelectableDate);
    initialStartDate.setDate(initialStartDate.getDate() - this.defaultDaysBack);

    const normalizedStart = this.beginningOfTheDayOf(initialStartDate);
    const normalizedEnd = this.endOfTheDayOf(initialEndDate);

    this.dateRangeForm.setValue({ start: normalizedStart, end: normalizedEnd }, { emitEvent: false });

    // Tell parent of the initial range.
    this.dateRangeChange.emit({
      start: new Date(normalizedStart.getTime()),
      end: new Date(normalizedEnd.getTime())
    });

    // Update format hint based on current locale
    this.updateLocaleSensitiveSettings(this.i18nService.localeCode);

    // Listen to locale changes
    this.i18nService.locale$
      .pipe(
        map(locale => locale.canonicalTag),
        distinctUntilChanged(),
        quietTakeUntilDestroyed(this.destroyRef)
      )
      .subscribe(localeCode => {
        this.updateLocaleSensitiveSettings(localeCode);
      });

    // Listen to form changes and emit normalized and valid ranges
    this.dateRangeForm.valueChanges
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe((value: Partial<DateRangeFormValue> | undefined) => {
        if (value == null) return;
        const range = { start: value.start, end: value.end };
        this.emitNormalizedIfValid(range);
      });
  }

  /**
   * Process form input. Emits a normalized and valid range if possible. This method will be called for each start and
   * end date selection when working with the popup calendar control. Sometimes it will be called twice when a start
   * date is clicked (once with the end date with the previous value if the user clicked a new start date; once with the
   * end date undefined). It is also called while typing into the input controls.
   */
  private emitNormalizedIfValid(inputRange: { start: Date | null | undefined; end: Date | null | undefined }): void {
    // Don't do anything if we lack a start or end value.
    if (inputRange.start == null) return;
    if (inputRange.end == null) return;

    // Normalize the dates.
    const normalizedStart: Date = this.beginningOfTheDayOf(inputRange.start);
    const normalizedEnd: Date = this.endOfTheDayOf(inputRange.end);

    // If start or end is in the future, wait for valid selections.
    if (normalizedStart > this.maxSelectableDate) return;
    if (normalizedEnd > this.maxSelectableDate) return;

    // If the start is past the end, wait for valid selections. This can happen from the calendar control.
    if (normalizedStart > normalizedEnd) return;

    // Dates are a valid and normalized range. Emit.
    const normalizedRange: NormalizedDateRange = { start: normalizedStart, end: normalizedEnd };
    this.dateRangeChange.emit(normalizedRange);
  }

  /** Get the beginning of the day for a date */
  private beginningOfTheDayOf(date: Date): Date {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    return newDate;
  }

  /** Get the end of the day for a date. This is important because if the user selects to see events through 2025-07-01,
   * and expects that to be an inclusive selection, we don't want to treat that as 2025-07-01 00:00:00.000 and omit
   * events that happened at 2025-07-01 06:00:00.000. This method would convert that date to 2025-07-01 23:59:59.999,
   * the end of the day of that date. */
  private endOfTheDayOf(date: Date): Date {
    const newDate = new Date(date);
    newDate.setHours(0, 0, 0, 0);
    newDate.setDate(newDate.getDate() + 1);
    newDate.setMilliseconds(newDate.getMilliseconds() - 1);
    return newDate;
  }

  /** Disable future dates in the date picker */
  disableFutureDates = (date: Date | null): boolean => {
    if (date == null) {
      return true;
    }
    const normalizedDate = this.beginningOfTheDayOf(date);
    return normalizedDate <= this.maxSelectableDate;
  };

  private updateLocaleSensitiveSettings(localeCode: string): void {
    this.dateAdapter.setLocale(localeCode);
    this.updateDateRangeFormatHint(localeCode);
  }

  private updateDateRangeFormatHint(localeCode: string): void {
    const pattern = this.createDateFormatPattern(localeCode);
    this.dateRangeFormatHint = pattern;
  }

  /** Create a date format hint pattern for the given locale. For example, MM/DD/YYYY for US, or DD/MM/YYYY for UK. */
  private createDateFormatPattern(localeCode: string): string | undefined {
    try {
      const formatter = new Intl.DateTimeFormat(localeCode);
      const someDate = new Date('2025-01-01');
      const parts = formatter.formatToParts(someDate);
      let pattern = '';
      for (const part of parts) {
        switch (part.type) {
          case 'year':
            pattern += 'Y'.repeat(part.value.length);
            break;
          case 'month':
            pattern += 'M'.repeat(part.value.length);
            break;
          case 'day':
            pattern += 'D'.repeat(part.value.length);
            break;
          case 'literal':
            pattern += part.value;
            break;
          default:
            break;
        }
      }
      return pattern.length > 0 ? pattern : undefined;
    } catch {
      return undefined;
    }
  }
}
