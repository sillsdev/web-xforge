import { Injectable, Pipe, PipeTransform } from '@angular/core';
import { I18nService } from './i18n.service';

/**
 * This service provides a method to get an Intl.NumberFormat object for the current locale.
 * - MDN states that re-using the same Intl.NumberFormat object for multiple numbers is more efficient:
 *   https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/toLocaleString
 * - L10nNumberPipe can't be the cache because an instance of a pipe is created for each use in a template.
 */
@Injectable({ providedIn: 'root' })
export class L10nNumberFormatService {
  constructor(private readonly i18n: I18nService) {}

  private lastLocale: string | undefined;
  private numberFormat: Intl.NumberFormat | undefined;

  getNumberFormat(): Intl.NumberFormat {
    if (this.numberFormat == null || this.lastLocale !== this.i18n.localeCode) {
      this.numberFormat = new Intl.NumberFormat(this.i18n.localeCode);
      this.lastLocale = this.i18n.localeCode;
    }
    return this.numberFormat;
  }
}

@Injectable({ providedIn: 'root' })
@Pipe({ name: 'l10nNumber', pure: false })
export class L10nNumberPipe implements PipeTransform {
  constructor(private readonly formatter: L10nNumberFormatService) {}

  transform(value: number): string {
    return this.formatter.getNumberFormat().format(value);
  }
}
