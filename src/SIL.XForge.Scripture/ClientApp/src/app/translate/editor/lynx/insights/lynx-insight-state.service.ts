import { Inject, Injectable } from '@angular/core';
import { isEqual } from 'lodash-es';
import { BehaviorSubject, Observable, combineLatest, distinctUntilChanged, map, shareReplay, tap } from 'rxjs';
import { ActivatedBookChapterService } from 'xforge-common/activated-book-chapter.service';
import { filterNullish } from 'xforge-common/util/rxjs-util';
import {
  EDITOR_INSIGHT_DEFAULTS,
  LynxInsight,
  LynxInsightConfig,
  LynxInsightDisplayState,
  LynxInsightFilter,
  LynxInsightFilterScope,
  LynxInsightSortOrder,
  LynxInsightType
} from './lynx-insight';
import { LynxInsightFilterService } from './lynx-insight-filter.service';

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
    {
      id: '1b',
      type: 'info',
      chapter: 1,
      book: 41,
      range: {
        index: 1,
        length: 6
      },
      code: '1001'
    },
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
    // TODO: this causes an error to be thrown when removing all formatting is called
    // {
    //   id: '3b',
    //   type: 'info',
    //   chapter: 1,
    //   book: 41,
    //   range: {
    //     index: 88,
    //     length: 13
    //   },
    //   code: '1012'
    // },
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
    // TODO: this causes an error to be thrown
    // {
    //   id: '5a',
    //   type: 'info',
    //   chapter: 1,
    //   book: 41,
    //   range: {
    //     index: 112,
    //     length: 5
    //   },
    //   code: '1005'
    // },
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
    // distinctUntilChanged((prev, curr) => {
    //   const equal = isEqual(prev, curr);
    //   console.log('rawInsights$ distinctUntilChanged (LynxInsightStateService)', prev, curr, equal);
    //   return equal;
    // }),
    distinctUntilChanged(isEqual),
    shareReplay(1),
    tap(insights => console.log('rawInsights$ changed (LynxInsightStateService)', insights))
  );

  // TODO: Load stored filter from user project config
  readonly filter$ = new BehaviorSubject<LynxInsightFilter>(this.defaults.filter);
  readonly orderBy$ = new BehaviorSubject<LynxInsightSortOrder>(this.defaults.sortOrder);

  readonly filteredChapterInsights$: Observable<LynxInsight[]> = combineLatest([
    this.rawInsights$,
    this.filter$,
    this.activatedBookChapter.activatedBookChapter$.pipe(filterNullish())
  ]).pipe(
    map(([insights, filter, routeBookChapter]) =>
      insights.filter(insight =>
        this.insightFilterService.matchesFilter(insight, { ...filter, scope: 'chapter' }, routeBookChapter)
      )
    ),
    distinctUntilChanged(isEqual),
    shareReplay(1),
    tap(insights => console.log('filteredChapterInsights$ changed (LynxInsightStateService)', insights))
  );

  readonly filteredInsights$: Observable<LynxInsight[]> = combineLatest([
    this.rawInsights$,
    this.filter$,
    this.activatedBookChapter.activatedBookChapter$.pipe(filterNullish())
  ]).pipe(
    map(([insights, filter, routeBookChapter]) =>
      insights.filter(insight => this.insightFilterService.matchesFilter(insight, filter, routeBookChapter))
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
    this.activatedBookChapter.activatedBookChapter$.pipe(filterNullish())
  ]).pipe(
    map(([insights, filter, routeBookChapter]) => {
      const result: Record<LynxInsightFilterScope, number> = { project: 0, book: 0, chapter: 0 };
      const filterTypes = new Set<LynxInsightType>(filter.types);

      for (const insight of insights) {
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
   * Insight counts for the currently filtered types and scope grouped by type.
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

  constructor(
    @Inject(EDITOR_INSIGHT_DEFAULTS) private defaults: LynxInsightConfig,
    private readonly insightFilterService: LynxInsightFilterService,
    private readonly activatedBookChapter: ActivatedBookChapterService
  ) {
    // TODO: load stored filter from user project config
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

  /**
   * Updates the display state for an insight.  If `isExclusive` is true, clears those flags from all other insights
   * where it is set in the specified changes.
   * @param id The id of the insight to update.
   * @param displayStateChanges The changes to apply to the display state.
   * @param isExclusive Whether or not to clear the given display state flags from all other insights.
   */
  updateDisplayState(id: string, displayStateChanges: Partial<LynxInsightDisplayState>, isExclusive?: boolean): void;
  updateDisplayState(ids: string[], displayStateChanges: Partial<LynxInsightDisplayState>, isExclusive?: boolean): void;
  updateDisplayState(
    idOrIds: string | string[],
    displayStateChanges: Partial<LynxInsightDisplayState>,
    isExclusive = true
  ): void {
    let ids: Set<string> | undefined;
    let id: string | undefined;

    if (Array.isArray(idOrIds)) {
      ids = new Set(idOrIds);
    } else {
      id = idOrIds;
    }

    this.rawInsightSource$.next(
      this.rawInsightSource$.value.map(insight => {
        const isInsightToUpdate = ids != null ? ids.has(insight.id) : insight.id === id;

        if (isInsightToUpdate) {
          return { ...insight, displayState: { ...insight.displayState, ...displayStateChanges } };
        } else {
          if (isExclusive) {
            const itemChanges: Partial<LynxInsightDisplayState> = {};
            let changed = false;

            // Unset the flag on insight item if the flag is included in the display changes on the given insight
            for (const key of Object.keys(displayStateChanges)) {
              itemChanges[key] = false;
              changed = true;
            }

            if (changed) {
              return { ...insight, displayState: { ...insight.displayState, ...itemChanges } };
            }
          }

          return insight;
        }
      })
    );
  }

  clearDisplayState(): void {
    this.rawInsightSource$.next(this.rawInsightSource$.value.map(i => ({ ...i, displayState: {} })));
  }

  togglePanelVisibility(): void {
    this.insightPanelVisibleSource$.next(!this.insightPanelVisibleSource$.value);
  }

  updateFilter(filter: Partial<LynxInsightFilter>): void {
    this.filter$.next({ ...this.filter$.value, ...filter });
  }

  updateSort(sortOrder: LynxInsightSortOrder): void {
    this.orderBy$.next(sortOrder);
  }

  /**
   * Toggles the type in filter types.
   * @param insightType The type to toggle.
   */
  toggleFilterType(insightType: LynxInsightType): void {
    const types = this.filter$.value.types;
    const updatedTypes = types.includes(insightType) ? types.filter(t => t !== insightType) : [...types, insightType];

    this.filter$.next({ ...this.filter$.value, types: updatedTypes });
  }
}
