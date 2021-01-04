import { Directive, OnDestroy } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { translate, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';

// Decorator required by Angular compiler
@Directive()
// tslint:disable-next-line: directive-class-suffix
export class Paginator extends MatPaginatorIntl implements OnDestroy {
  itemsPerPageLabel = '';
  nextPageLabel = '';
  previousPageLabel = '';

  private changeSubscription: Subscription;

  constructor(private transloco: TranslocoService) {
    super();
    this.changeSubscription = this.transloco.selectTranslate('paginator.items_per_page').subscribe(value => {
      this.itemsPerPageLabel = value;
      this.nextPageLabel = translate('paginator.next_page');
      this.previousPageLabel = translate('paginator.previous_page');
      this.changes.next();
    });
  }

  // It needs to be a member property, not a member function, in order to compile
  getRangeLabel = (page: number, pageSize: number, length: number) => {
    // The logic for this function is copied from the docs and then modified for the sake of internationalization
    length = Math.max(length, 0);
    const startIndex = page * pageSize;
    const endIndex = startIndex < length ? Math.min(startIndex + pageSize, length) : startIndex + pageSize;
    return translate('paginator.range_label', { startIndex: startIndex + 1, endIndex, length });
  };

  ngOnDestroy(): void {
    this.changeSubscription.unsubscribe();
  }
}
