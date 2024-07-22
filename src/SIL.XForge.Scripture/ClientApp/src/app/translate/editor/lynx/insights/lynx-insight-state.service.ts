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
  Observable,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  take,
  tap,
  withLatestFrom
} from 'rxjs';
import { ActivatedBookChapterService } from 'xforge-common/activated-book-chapter.service';
import { ActivatedProjectUserConfigService } from 'xforge-common/activated-project-user-config.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import { EDITOR_INSIGHT_DEFAULTS, LynxInsight, LynxInsightConfig, LynxInsightDisplayState } from './lynx-insight';
import { LynxInsightFilterService } from './lynx-insight-filter.service';

type BooleanProp<T> = { [K in keyof T]: T[K] extends boolean | undefined ? K : never }[keyof T];

@Injectable({
  providedIn: 'root'
})
export class LynxInsightStateService {
  private rawInsightSource$ = new BehaviorSubject<LynxInsight[]>([
    // Mark 1
    {
      id: '0a',
      type: 'info',
      chapter: 1,
      book: 41,
      range: {
        index: 300,
        length: 5
      },
      code: '1011'
    },
    {
      id: '0b',
      type: 'info',
      chapter: 1,
      book: 41,
      range: {
        index: 314,
        length: 3
      },
      code: '1011'
    },
    {
      id: '0c',
      type: 'info',
      chapter: 1,
      book: 41,
      range: {
        index: 318,
        length: 10
      },
      code: '1011'
    },
    {
      id: '1',
      type: 'info',
      chapter: 1,
      book: 41,
      range: {
        index: 0,
        length: 5
      },
      code: '1001'
    },
    // {
    //   id: '1b',
    //   type: 'info',
    //   chapter: 1,
    //   book: 41,
    //   range: {
    //     index: 1,
    //     length: 6
    //   },
    //   code: '1001'
    // },
    {
      id: '2',
      type: 'warning',
      chapter: 1,
      book: 41,
      range: {
        index: 16,
        length: 1
      },
      code: '2001'
    },
    {
      id: '2a',
      type: 'warning',
      chapter: 1,
      book: 41,
      range: {
        index: 22,
        length: 1
      },
      code: '2001'
    },
    {
      id: '2b',
      type: 'error',
      chapter: 1,
      book: 41,
      range: {
        index: 40,
        length: 10
      },
      code: '3002'
    },
    {
      id: '3',
      type: 'error',
      chapter: 1,
      book: 41,
      range: {
        index: 86,
        length: 10
      },
      code: '3001'
    },
    {
      id: '3a',
      type: 'warning',
      chapter: 1,
      book: 41,
      range: {
        index: 76,
        length: 30
      },
      code: '2011'
    },
    {
      id: '3b',
      type: 'info',
      chapter: 1,
      book: 41,
      range: {
        index: 88,
        length: 13
      },
      code: '1012'
    },
    {
      id: '4',
      type: 'warning',
      chapter: 1,
      book: 41,
      range: {
        index: 34,
        length: 11
      },
      code: '1000'
      // code: '2002'
    },
    {
      id: '5',
      type: 'warning',
      chapter: 1,
      book: 41,
      range: {
        index: 110,
        length: 11
      },
      code: '2005'
    },
    {
      id: '5a',
      type: 'info',
      chapter: 1,
      book: 41,
      range: {
        index: 112,
        length: 5
      },
      code: '1005'
    },
    {
      id: '6',
      type: 'info',
      chapter: 1,
      book: 41,
      range: {
        index: 125,
        length: 10
      },
      code: '1006'
    },
    {
      id: '6a',
      type: 'error',
      chapter: 1,
      book: 41,
      range: {
        index: 127,
        length: 5
      },
      code: '3006'
    },
    // Mark 2
    {
      id: '11',
      type: 'info',
      chapter: 2,
      book: 41,
      range: {
        index: 2,
        length: 5
      },
      code: '1001'
    },
    {
      id: '22',
      type: 'warning',
      chapter: 2,
      book: 41,
      range: {
        index: 16,
        length: 1
      },
      code: '2001'
    },
    {
      id: '33',
      type: 'warning',
      chapter: 2,
      book: 41,
      range: {
        index: 22,
        length: 1
      },
      code: '2001'
    },
    {
      id: '44',
      type: 'error',
      chapter: 2,
      book: 41,
      range: {
        index: 86,
        length: 10
      },
      code: '3001'
    },
    {
      id: '55',
      type: 'warning',
      chapter: 2,
      book: 41,
      range: {
        index: 34,
        length: 11
      },
      code: '2002'
    },
    // Luke 2
    {
      id: '111',
      type: 'info',
      chapter: 2,
      book: 42,
      range: {
        index: 0,
        length: 5
      },
      code: '1001'
    },
    {
      id: '222',
      type: 'warning',
      chapter: 2,
      book: 42,
      range: {
        index: 16,
        length: 1
      },
      code: '2001'
    },
    {
      id: '333',
      type: 'warning',
      chapter: 2,
      book: 42,
      range: {
        index: 22,
        length: 1
      },
      code: '2001'
    },
    {
      id: '444',
      type: 'error',
      chapter: 2,
      book: 42,
      range: {
        index: 86,
        length: 10
      },
      code: '3001'
    },
    {
      id: '555',
      type: 'warning',
      chapter: 2,
      book: 42,
      range: {
        index: 34,
        length: 11
      },
      code: '2002'
    }
  ]);

  private rawInsights$: Observable<LynxInsight[]> = this.rawInsightSource$.pipe(
    distinctUntilChanged(isEqual),
    tap(insights => console.log('rawInsights$ changed (LynxInsightStateService)', insights)),
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
    tap(insights => console.log('filteredChapterInsights$ changed (LynxInsightStateService)', insights)),
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
    tap(val => console.log('filteredInsights$ changed (LynxInsightStateService)', val)),
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
    tap(val => console.log('filteredInsightCountsByScope$ changed (LynxInsightStateService)', val)),
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
    tap(val => console.log('filteredInsightCountsByType$ changed (LynxInsightStateService)', val)),
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
    shareReplay(1),
    tap(displayState => console.log('displayStateSource$ changed (LynxInsightStateService)', displayState))
  );

  constructor(
    @Inject(EDITOR_INSIGHT_DEFAULTS) private defaults: LynxInsightConfig,
    private readonly insightFilterService: LynxInsightFilterService,
    private readonly activatedBookChapter: ActivatedBookChapterService,
    private readonly activatedProjectUserConfig: ActivatedProjectUserConfigService
  ) {
    this.init();
  }

  getInsight(id: string): LynxInsight | undefined {
    return this.rawInsightSource$.value.find(i => i.id === id);
  }

  addInsight(insight: LynxInsight): void {
    this.rawInsightSource$.next([...this.rawInsightSource$.value, insight]);
  }

  updateInsight(newValue: LynxInsight): void {
    this.rawInsightSource$.next(
      this.rawInsightSource$.value.map(i => (i.id === newValue.id ? { ...i, ...newValue } : i))
    );
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

        if (typeof currentVal === 'boolean') {
          displayStateChanges[prop] = !currentVal;
        }
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

      if (persistedUserState?.dismissedInsightIds != null) {
        this.dismissedInsightIdsSource$.next(persistedUserState.dismissedInsightIds);
      }

      // Notify to start persisting changes to user state data
      stateLoaded$.next(true);
    });

    // Save state to project user config
    combineLatest([
      this.filter$,
      this.orderBy$,
      this.insightPanelVisible$,
      this.dismissedInsightIds$,
      stateLoaded$.pipe(filter(loaded => loaded))
    ])
      .pipe(withLatestFrom(this.activatedProjectUserConfig.projectUserConfigDoc$))
      .subscribe(([[filter, sortOrder, isOpen, dismissedInsightIds], pucDoc]) => {
        pucDoc?.submitJson0Op(op =>
          op.set(puc => puc.lynxInsightState, {
            panelData: {
              isOpen,
              filter,
              sortOrder
            },
            dismissedInsightIds
          })
        );
      });
  }
}
