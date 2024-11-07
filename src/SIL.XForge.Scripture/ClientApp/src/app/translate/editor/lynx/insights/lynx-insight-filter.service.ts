import { Injectable } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { LynxInsightFilter, LynxInsightFilterScope } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { RouteBookChapter } from 'xforge-common/activated-book-chapter.service';
import { LynxInsight } from './lynx-insight';

@Injectable({
  providedIn: 'root'
})
export class LynxInsightFilterService {
  constructor() {}

  matchesFilter(
    insight: LynxInsight,
    filter: LynxInsightFilter,
    bookChapter: RouteBookChapter,
    dismissedIds: string[]
  ): boolean {
    const routeBookNum: number | undefined = bookChapter.bookId ? Canon.bookIdToNumber(bookChapter.bookId) : undefined;
    const routeChapter = bookChapter.chapter;
    const dismissedIdSet: Set<string> = new Set(dismissedIds ?? []);

    if (!filter.includeDismissed && dismissedIdSet.has(insight.id)) {
      return false;
    }

    if (!filter.types.includes(insight.type)) {
      return false;
    }

    if (filter.scope === 'project') {
      return true;
    }

    if (filter.scope === 'book' && routeBookNum !== insight.book) {
      return false;
    }

    if (filter.scope === 'chapter' && (routeBookNum !== insight.book || routeChapter !== insight.chapter)) {
      return false;
    }

    return true;
  }

  getScope(insight: LynxInsight, bookChapter: RouteBookChapter): LynxInsightFilterScope {
    const routeBookNum: number | undefined = bookChapter.bookId ? Canon.bookIdToNumber(bookChapter.bookId) : undefined;
    const routeChapter = bookChapter.chapter;

    if (insight.book === routeBookNum && insight.chapter === routeChapter) {
      return 'chapter';
    } else if (insight.book === routeBookNum) {
      return 'book';
    } else {
      return 'project';
    }
  }
}
