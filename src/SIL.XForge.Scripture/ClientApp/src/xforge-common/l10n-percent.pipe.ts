import { Injectable, Pipe, PipeTransform } from '@angular/core';
import { I18nService } from './i18n.service';

/**
 * This service provides a method to get an Intl.NumberFormat object for the current locale, for formatting percentages.
 * - MDN states that re-using the same Intl.NumberFormat object for multiple numbers is more efficient:
 *   https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/toLocaleString
 * - L10nPercentPipe can't be the cache because an instance of a pipe is created for each use in a template.
 */
@Injectable({ providedIn: 'root' })
export class L10nPercentFormatService {
  constructor(private readonly i18n: I18nService) {}

  private lastLocale: string | undefined;
  private percentFormat: Intl.NumberFormat | undefined;

  getPercentFormat(): Intl.NumberFormat {
    if (this.percentFormat == null || this.lastLocale !== this.i18n.localeCode) {
      this.percentFormat = new Intl.NumberFormat(this.i18n.localeCode, { style: 'percent' });
      this.lastLocale = this.i18n.localeCode;
    }
    return this.percentFormat;
  }
}

@Injectable({ providedIn: 'root' })
@Pipe({ name: 'l10nPercent', standalone: true, pure: false })
export class L10nPercentPipe implements PipeTransform {
  constructor(private readonly formatter: L10nPercentFormatService) {}

  transform(value: number): string {
    return this.formatter.getPercentFormat().format(value);
  }
}
