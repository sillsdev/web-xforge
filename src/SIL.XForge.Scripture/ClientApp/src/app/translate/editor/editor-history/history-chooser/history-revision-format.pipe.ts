import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from 'xforge-common/i18n.service';
import { Locale } from 'xforge-common/models/i18n-locale';
import { Revision } from '../../../../core/paratext.service';

@Pipe({
  name: 'revisionFormat',
  pure: true
})
export class HistoryRevisionFormatPipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  /**
   * Performs the transformation.
   *
   * @param revision The revision to display the date of.
   * @param _locale This parameter is so that the pipe will re-evaluate on locale changes. It is not used directly.
   * @returns The date string formatted using the user's current locale.
   */
  transform(revision: Revision | string, _locale: Locale | null): string {
    const revisionKey = typeof revision === 'string' ? revision : revision.timestamp;
    return this.i18n.formatDate(new Date(revisionKey));
  }
}
