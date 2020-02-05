import { OnDestroy } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material';
import { translate, TranslocoService } from '@ngneat/transloco';
import { Subscription } from 'rxjs';

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

  ngOnDestroy(): void {
    this.changeSubscription.unsubscribe();
  }
}
