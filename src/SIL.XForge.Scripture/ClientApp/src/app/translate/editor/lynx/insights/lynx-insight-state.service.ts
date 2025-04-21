import { Inject, Injectable } from '@angular/core';
import { isEqual } from 'lodash-es';
import {
  LynxInsightFilter,
  LynxInsightFilterScope,
  LynxInsightSortOrder,
  LynxInsightType
} from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { LynxInsightUserData } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight-user-data';
import {
  BehaviorSubject,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  Observable,
  shareReplay,
  take,
  withLatestFrom
} from 'rxjs';
import { ActivatedBookChapterService } from 'xforge-common/activated-book-chapter.service';
import { ActivatedProjectUserConfigService } from 'xforge-common/activated-project-user-config.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { EDITOR_INSIGHT_DEFAULTS, LynxInsight, LynxInsightConfig, LynxInsightDisplayState } from './lynx-insight';
import { LynxInsightFilterService } from './lynx-insight-filter.service';
import { LynxWorkspaceService } from './lynx-workspace.service';

type BooleanProp<T> = { [K in keyof T]: T[K] extends boolean | undefined ? K : never }[keyof T];

@Injectable({
  providedIn: 'root'
})
export class LynxInsightStateService {
  private rawInsights$: Observable<LynxInsight[]> = this.lynxWorkspaceService.rawInsightSource$.pipe(
    distinctUntilChanged(isEqual),
    shareReplay(1)
  );

  // Stored filter and order are loaded from project user config
  private filterSource$ = new BehaviorSubject<LynxInsightFilter>(this.defaults.filter);
  readonly filter$ = this.filterSource$.pipe(distinctUntilChanged());
  private orderBySource$ = new BehaviorSubject<LynxInsightSortOrder>(this.defaults.sortOrder);
  readonly orderBy$ = this.orderBySource$.pipe(distinctUntilChanged());

  private readonly dismissedInsightIdsSource$ = new BehaviorSubject<string[]>([]);
  readonly dismissedInsightIds$ = this.dismissedInsightIdsSource$.pipe(distinctUntilChanged(), shareReplay(1));

  readonly filteredChapterInsights$: Observable<LynxInsight[]> = combineLatest([
    this.rawInsights$,
    this.filter$,
    this.activatedBookChapter.activatedBookChapter$.pipe(filterNullish()),
    this.dismissedInsightIds$
  ]).pipe(
    map(([insights, filter, routeBookChapter, dismissedIds]) =>
      insights.filter(insight =>
        this.insightFilterService.matchesFilter(
          insight,
          { ...filter, scope: 'chapter' },
          routeBookChapter,
          dismissedIds
        )
      )
    ),
    distinctUntilChanged(isEqual),
    shareReplay(1)
  );

  readonly filteredInsights$: Observable<LynxInsight[]> = combineLatest([
    this.rawInsights$,
    this.filter$,
    this.activatedBookChapter.activatedBookChapter$.pipe(filterNullish()),
    this.dismissedInsightIds$
  ]).pipe(
    map(([insights, filter, routeBookChapter, dismissedIds]) =>
      insights.filter(insight =>
        this.insightFilterService.matchesFilter(insight, filter, routeBookChapter, dismissedIds)
      )
    ),
    distinctUntilChanged(isEqual),
    shareReplay(1)
  );

  /**
   * Insight counts for the currently filtered types grouped by scope.
   */
  readonly filteredInsightCountsByScope$: Observable<Record<LynxInsightFilterScope, number>> = combineLatest([
    this.rawInsights$,
    this.filter$,
    this.activatedBookChapter.activatedBookChapter$.pipe(filterNullish()),
    this.dismissedInsightIds$
  ]).pipe(
    map(([insights, filter, routeBookChapter, dismissedIds]) => {
      const result: Record<LynxInsightFilterScope, number> = { project: 0, book: 0, chapter: 0 };
      const filterTypes = new Set<LynxInsightType>(filter.types);
      const dismissedIdSet: Set<string> = new Set(dismissedIds);

      for (const insight of insights) {
        if (!filter.includeDismissed && dismissedIdSet.has(insight.id)) {
          continue;
        }

        if (!filterTypes.has(insight.type)) {
          continue;
        }

        const scope: LynxInsightFilterScope = this.insightFilterService.getScope(insight, routeBookChapter);

        result.project++;

        if (scope === 'chapter' || scope === 'book') {
          result.book++;
        }

        if (scope === 'chapter') {
          result.chapter++;
        }
      }

      return result;
    }),
    distinctUntilChanged(isEqual),
    shareReplay(1)
  );

  /**
   * Insight counts for the currently filtered types and scope, grouped by type.
   */
  readonly filteredInsightCountsByType$: Observable<Record<LynxInsightType, number>> = this.filteredInsights$.pipe(
    map((insights: LynxInsight[]) => {
      const result: Record<LynxInsightType, number> = { error: 0, warning: 0, info: 0 };

      for (const insight of insights) {
        result[insight.type]++;
      }

      return result;
    }),
    distinctUntilChanged(isEqual),
    shareReplay(1)
  );

  private readonly insightPanelVisibleSource$ = new BehaviorSubject<boolean>(false);
  readonly insightPanelVisible$ = this.insightPanelVisibleSource$.pipe(distinctUntilChanged());

  private readonly displayStateSource$ = new BehaviorSubject<LynxInsightDisplayState>({
    activeInsightIds: [],
    cursorActiveInsightIds: []
  });
  readonly displayState$: Observable<LynxInsightDisplayState> = this.displayStateSource$.pipe(
    distinctUntilChanged(isEqual),
    shareReplay(1)
  );

  constructor(
    @Inject(EDITOR_INSIGHT_DEFAULTS) private defaults: LynxInsightConfig,
    private readonly insightFilterService: LynxInsightFilterService,
    private readonly activatedBookChapter: ActivatedBookChapterService,
    private readonly activatedProjectUserConfig: ActivatedProjectUserConfigService,
    private readonly lynxWorkspaceService: LynxWorkspaceService
  ) {
    this.init();
  }

  getInsight(id: string): LynxInsight | undefined {
    for (const insights of this.lynxWorkspaceService.currentInsights.values()) {
      const insight = insights.find(i => i.id === id);
      if (insight != null) {
        return insight;
      }
    }
    return undefined;
  }

  setActiveInsights(ids: string[]): void {
    this.displayStateSource$.next({ ...this.displayStateSource$.value, activeInsightIds: ids });
  }

  /**
   * Updates the display state with the given values.
   * @param displayStateChanges The changes to apply to the display state.
   */
  updateDisplayState(displayStateChanges: Partial<LynxInsightDisplayState>): void {
    this.displayStateSource$.next({ ...this.displayStateSource$.value, ...displayStateChanges });
  }

  /**
   * Toggle the listed bool display state props.
   */
  toggleDisplayState(props: BooleanProp<LynxInsightDisplayState>[]): void {
    const displayStateChanges: Partial<LynxInsightDisplayState> = {};

    for (const prop of props) {
      if (prop != null) {
        const currentVal = this.displayStateSource$.value[prop];

        // Toggle the value if it is set.  Set to true if it is not yet set.
        displayStateChanges[prop] = typeof currentVal === 'boolean' ? !currentVal : true;
      }
    }

    this.updateDisplayState(displayStateChanges);
  }

  clearDisplayState(): void {
    this.displayStateSource$.next({ activeInsightIds: [], cursorActiveInsightIds: [] });
  }

  togglePanelVisibility(): void {
    this.insightPanelVisibleSource$.next(!this.insightPanelVisibleSource$.value);
  }

  dismissInsights(ids: string[]): void {
    // Ensure no duplicates
    const dismissedIds = new Set(this.dismissedInsightIdsSource$.value);
    ids.forEach(id => dismissedIds.add(id));
    this.dismissedInsightIdsSource$.next(Array.from(dismissedIds));
  }

  restoreDismissedInsights(ids: string[]): void {
    const dismissedIds = new Set(this.dismissedInsightIdsSource$.value);
    ids.forEach(id => dismissedIds.delete(id));
    this.dismissedInsightIdsSource$.next(Array.from(dismissedIds));
  }

  updateFilter(filter: Partial<LynxInsightFilter>): void {
    this.filterSource$.next({ ...this.filterSource$.value, ...filter });
  }

  updateSort(sortOrder: LynxInsightSortOrder): void {
    this.orderBySource$.next(sortOrder);
  }

  /**
   * Toggles the type in filter types.
   * @param insightType The type to toggle.
   */
  toggleFilterType(insightType: LynxInsightType): void {
    const types = this.filterSource$.value.types;
    const updatedTypes = types.includes(insightType) ? types.filter(t => t !== insightType) : [...types, insightType];

    this.filterSource$.next({ ...this.filterSource$.value, types: updatedTypes });
  }

  /**
   * Toggles whether or not dismissed insights are included in the filter.
   */
  toggleFilterDismissed(): void {
    const includeDismissed: boolean = !this.filterSource$.value.includeDismissed;
    this.filterSource$.next({
      ...this.filterSource$.value,
      includeDismissed
    });
  }

  private init(): void {
    const stateLoaded$ = new BehaviorSubject<boolean>(false);

    // Load stored state from project user config
    this.activatedProjectUserConfig.projectUserConfig$.pipe(filterNullish(), take(1)).subscribe(puc => {
      const persistedUserState: LynxInsightUserData | undefined = puc?.lynxInsightState;

      if (persistedUserState?.panelData != null) {
        this.filterSource$.next(persistedUserState.panelData.filter);
        this.orderBySource$.next(persistedUserState.panelData.sortOrder);
        this.insightPanelVisibleSource$.next(persistedUserState.panelData.isOpen);
      }

      // Notify to start persisting changes to user state data
      stateLoaded$.next(true);
    });

    // Save state to project user config
    combineLatest([this.filter$, this.orderBy$, this.insightPanelVisible$, stateLoaded$.pipe(filter(loaded => loaded))])
      .pipe(withLatestFrom(this.activatedProjectUserConfig.projectUserConfigDoc$))
      .subscribe(([[filter, sortOrder, isOpen], pucDoc]) => {
        pucDoc?.submitJson0Op(op =>
          op.set(puc => puc.lynxInsightState, {
            panelData: {
              isOpen,
              filter,
              sortOrder
            }
          })
        );
      });
  }
}
