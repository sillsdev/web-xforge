import { Component, DestroyRef, OnInit, ViewChild } from '@angular/core';
import { MatMenuTrigger } from '@angular/material/menu';
import {
  LynxInsightFilter,
  LynxInsightFilterScope,
  LynxInsightFilterScopes,
  LynxInsightSortOrder,
  LynxInsightSortOrders,
  LynxInsightType,
  LynxInsightTypes
} from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { I18nService } from 'xforge-common/i18n.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { LynxInsightStateService } from '../../lynx-insight-state.service';

@Component({
  selector: 'app-lynx-insights-panel-header',
  templateUrl: './lynx-insights-panel-header.component.html',
  styleUrl: './lynx-insights-panel-header.component.scss'
})
export class LynxInsightsPanelHeaderComponent implements OnInit {
  @ViewChild(MatMenuTrigger) menuTrigger?: MatMenuTrigger;

  readonly scopes: LynxInsightFilterScope[] = [...LynxInsightFilterScopes].reverse(); // Order narrowest first
  readonly insightTypes: LynxInsightType[] = [...LynxInsightTypes];
  readonly insightOrders: LynxInsightSortOrder[] = [...LynxInsightSortOrders];

  selectedScopeIndex: number = 0;
  filter?: LynxInsightFilter;
  orderBy?: LynxInsightSortOrder;
  scopeCounts?: Record<LynxInsightFilterScope, number>;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly i18n: I18nService,
    readonly state: LynxInsightStateService
  ) {}

  ngOnInit(): void {
    this.state.filter$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(filter => {
      this.filter = filter;
      this.selectedScopeIndex = this.scopes.indexOf(filter.scope);
    });

    this.state.orderBy$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(orderBy => {
      this.orderBy = orderBy;
    });

    this.state.filteredInsightCountsByScope$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(counts => (this.scopeCounts = counts));
  }

  setScopeIndex(index: number): void {
    this.state.updateFilter({ scope: this.scopes[index] });
  }

  setOrder(orderBy: LynxInsightSortOrder): void {
    this.state.updateSort(orderBy);

    // Event bubbling is stopped in the template to prevent clicks other than 'order by' from closing the menu,
    // so close the menu manually here.
    this.menuTrigger?.closeMenu();
  }

  toggleFilterType(insightType: LynxInsightType): void {
    this.state.toggleFilterType(insightType);
  }

  toggleFilterDismissed(): void {
    this.state.toggleFilterDismissed();
  }
}
