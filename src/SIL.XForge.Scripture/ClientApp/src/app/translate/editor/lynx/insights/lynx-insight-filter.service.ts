import { Injectable } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { LynxInsightFilter, LynxInsightFilterScope } from 'realtime-server/lib/esm/scriptureforge/models/lynx-insight';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { RouteBookChapter } from 'xforge-common/activated-book-chapter.service';
import { TextDocService } from '../../../../core/text-doc.service';
import { LynxInsight } from './lynx-insight';

@Injectable({
  providedIn: 'root'
})
export class LynxInsightFilterService {
  constructor(private readonly textDocService: TextDocService) {}

  matchesFilter(
    insight: LynxInsight,
    filter: LynxInsightFilter,
    bookChapter: RouteBookChapter,
    dismissedIds: string[],
    projectTexts?: TextInfo[]
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

    // Check edit permissions and USFM validity if project texts are provided
    if (projectTexts != null && !this.hasDisplayPermission(insight, projectTexts)) {
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

  /**
   * Check if an insight has display permission (edit permission and USFM validity).
   * @param insight The insight to check.
   * @param projectTexts The project texts to check permissions against.
   * @returns True if the insight should be displayed, false otherwise.
   */
  hasDisplayPermission(insight: LynxInsight, projectTexts: TextInfo[]): boolean {
    // Find the text info for this book
    const text: TextInfo | undefined = projectTexts.find(t => t.bookNum === insight.textDocId.bookNum);
    if (text == null) {
      return false;
    }

    // Check chapter edit permission
    const hasEditPermission: boolean | undefined = this.textDocService.hasChapterEditPermissionForText(
      text,
      insight.textDocId.chapterNum
    );
    if (!hasEditPermission) {
      return false;
    }

    // Check USFM validity
    const isUsfmValid: boolean = this.textDocService.isUsfmValidForText(text, insight.textDocId.chapterNum);
    if (!isUsfmValid) {
      return false;
    }

    return true;
  }
}
