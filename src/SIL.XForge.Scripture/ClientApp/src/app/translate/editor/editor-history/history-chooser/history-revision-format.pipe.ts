import { Pipe, PipeTransform } from '@angular/core';
import { I18nService } from 'xforge-common/i18n.service';
import { Revision } from '../../../../core/paratext.service';

@Pipe({
    name: 'revisionFormat',
    pure: false,
    standalone: false
})
export class HistoryRevisionFormatPipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  transform(revision: Revision | string): string {
    const revisionKey = typeof revision === 'string' ? revision : revision.timestamp;
    return this.i18n.formatDate(new Date(revisionKey));
  }
}
