import { MatPaginatorIntl } from '@angular/material';
import { translate } from '@ngneat/transloco';

export class Paginator extends MatPaginatorIntl {
  itemsPerPageLabel = translate('paginator.items_per_page');
  constructor() {
    super();
  }
}
