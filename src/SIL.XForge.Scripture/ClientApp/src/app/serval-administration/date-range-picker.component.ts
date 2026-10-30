import { Component, DestroyRef, EventEmitter, Input, OnInit, Output } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn
} from '@angular/forms';
import { MatIconButton } from '@angular/material/button';
import { DateAdapter } from '@angular/material/core';
import {
  MatDatepickerToggle,
  MatDateRangeInput,
  MatDateRangePicker,
  MatEndDate,
  MatStartDate
} from '@angular/material/datepicker';
import { MatFormField, MatFormFieldModule, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
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

/** The normalized range from the beginning of the day `days` days ago through the end of today. */
export function lastDaysDateRange(days: number): NormalizedDateRange {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  // Normalize the end the same way as the date range picker does, to the last millisecond of today
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + 1);
  end.setMilliseconds(end.getMilliseconds() - 1);
  return { start, end };
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
    MatLabel,
    MatIcon,
    MatIconButton
  ]
})
export class DateRangePickerComponent implements OnInit {
  /** When the date range is not the default, highlight the control and show a reset button. */
  @Input() showReset: boolean = false;

  /**
   * The range that the control shows initially and that the reset button restores. Undefined means no range. Setting
   * this replaces the range in the control without emitting dateRangeChange, since the parent already knows the range.
   */
  @Input() set defaultRange(range: NormalizedDateRange | undefined) {
    this._defaultRange = range;
    this.parentRange = range;
    this.dateRangeForm.setValue(
      {
        start: range == null ? null : new Date(range.start),
        end: range == null ? null : new Date(range.end)
      },
      { emitEvent: false }
    );
    this.isDefaultRange = true;
  }

  /** Maximum selectable date (today) */
  readonly maxSelectableDate: Date;

  /** Current date range format hint based on locale */
  dateRangeFormatHint: string | undefined;

  /** Form group for date range inputs */
  readonly dateRangeForm: FormGroup<{
    start: FormControl<Date | null>;
    end: FormControl<Date | null>;
  }>;

  /** Event emitted when the date range changes with a valid normalized range */
  @Output() dateRangeChange = new EventEmitter<NormalizedDateRange | undefined>();

  /** Whether the range in the control is equal to the default range. */
  isDefaultRange: boolean = true;

  private _defaultRange: NormalizedDateRange | undefined;
  /**
   * The range that the parent knows about, which is the default range or the last emitted range. The date inputs echo
   * programmatic changes back through the form, so this prevents telling the parent about a range it already knows.
   */
  private parentRange: NormalizedDateRange | undefined;

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

  protected resetToDefaultDateRange(): void {
    if (this._defaultRange == null) {
      this.dateRangeForm.setValue({ start: null, end: null }, { emitEvent: true });
      return;
    }

    this.dateRangeForm.setValue(
      {
        start: new Date(this._defaultRange.start),
        end: new Date(this._defaultRange.end)
      },
      { emitEvent: true }
    );
  }

  /**
   * Process form input. Emits a normalized and valid range if possible. This method will be called for each start and
   * end date selection when working with the popup calendar control. Sometimes it will be called twice when a start
   * date is clicked (once with the end date with the previous value if the user clicked a new start date; once with the
   * end date undefined). It is also called while typing into the input controls.
   */
  private emitNormalizedIfValid(inputRange: { start: Date | null | undefined; end: Date | null | undefined }): void {
    if (inputRange.start == null && inputRange.end == null && this._defaultRange == null) {
      this.isDefaultRange = true;
      if (this.parentRange != null) {
        this.parentRange = undefined;
        this.dateRangeChange.emit();
      }
      return;
    }
    if (inputRange.start == null || inputRange.end == null) return;

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
    this.isDefaultRange = this.areRangesEqual(normalizedRange, this._defaultRange);
    if (this.areRangesEqual(normalizedRange, this.parentRange)) return;
    this.parentRange = normalizedRange;
    this.dateRangeChange.emit(normalizedRange);
  }

  private areRangesEqual(left: NormalizedDateRange | undefined, right: NormalizedDateRange | undefined): boolean {
    if (left == null && right == null) return true;
    if (left == null || right == null) return false;
    return left.start.getTime() === right.start.getTime() && left.end.getTime() === right.end.getTime();
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
