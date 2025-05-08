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

    if (filter.scope === 'book' && routeBookNum !== insight.textDocId.bookNum) {
      return false;
    }

    if (
      filter.scope === 'chapter' &&
      (routeBookNum !== insight.textDocId.bookNum || routeChapter !== insight.textDocId.chapterNum)
    ) {
      return false;
    }

    return true;
  }

  getScope(insight: LynxInsight, bookChapter: RouteBookChapter): LynxInsightFilterScope {
    const routeBookNum: number | undefined = bookChapter.bookId ? Canon.bookIdToNumber(bookChapter.bookId) : undefined;
    const routeChapter = bookChapter.chapter;

    if (insight.textDocId.bookNum === routeBookNum && insight.textDocId.chapterNum === routeChapter) {
      return 'chapter';
    } else if (insight.textDocId.bookNum === routeBookNum) {
      return 'book';
    } else {
      return 'project';
    }
  }
}
