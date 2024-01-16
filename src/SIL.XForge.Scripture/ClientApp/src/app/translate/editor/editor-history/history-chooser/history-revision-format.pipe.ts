import { Pipe, PipeTransform } from '@angular/core';
import { Revision } from 'src/app/core/paratext.service';
import { I18nService } from 'xforge-common/i18n.service';

@Pipe({
  name: 'revisionFormat'
})
export class HistoryRevisionFormatPipe implements PipeTransform {
  constructor(private readonly i18n: I18nService) {}

  transform(revision: Revision): string {
    return this.i18n.formatDate(new Date(revision.key));
  }
}
