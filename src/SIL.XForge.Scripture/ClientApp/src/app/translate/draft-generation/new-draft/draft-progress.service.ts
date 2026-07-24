import { Injectable } from '@angular/core';
import {
  bookAppearsCompleteForTrainingAutoSelection,
  ProgressService
} from '../../../shared/progress-service/progress.service';
import { ChapterSet, VerboseScriptureRange } from '../../../shared/scripture-range';

/**
 * Minimum fraction of a chapter's verse segments that must be non-blank for the chapter to count as having content.
 * Chapters at or below this ratio are treated as untranslated, which drives three decisions off the same policy:
 * whether a source chapter is offered as material to draft from, whether a target chapter counts toward existing
 * content (and so is excluded from the default drafting selection), and whether a book is eligible for partial
 * drafting. Kept in one place, behind `chapterHasContent`, so those uses can't drift apart.
 */
const MIN_CHAPTER_COMPLETION_RATIO_FOR_CONTENT = 0.1;

/** Whether a chapter has enough non-blank verse segments to count as having content (see the constant above). */
function chapterHasContent(chapter: { verseSegments: number; blankVerseSegments: number }): boolean {
  if (chapter.verseSegments === 0) {
    return false;
  }
  const completionRatio = (chapter.verseSegments - chapter.blankVerseSegments) / chapter.verseSegments;
  return completionRatio > MIN_CHAPTER_COMPLETION_RATIO_FOR_CONTENT;
}

/**
 * Default freshness window for progress lookups. Progress data older than this is re-fetched. A completed sync
 * additionally invalidates a project's progress regardless of age; ProgressService detects that itself via the
 * project's sync token, so callers here don't have to signal it.
 */
const DEFAULT_PROGRESS_STALENESS_MS = 1000;

@Injectable({ providedIn: 'root' })
/** Like ProgressService, but provides a VerboseScriptureRange instead of raw progress data */
export class DraftProgressService {
  constructor(private readonly progressService: ProgressService) {}

  /**
   * Returns the chapters in a project that have content (see chapterHasContent). Books with no such chapters are
   * omitted entirely; empty books shouldn't be offered for selection. Note that a chapter can exist in the project
   * but be absent from this range because it is blank. getPresentChapters can be used to tell those apart.
   */
  async getChaptersWithContent(projectId: string): Promise<VerboseScriptureRange> {
    return await this.getChapters(projectId, chapterHasContent);
  }

  /**
   * Returns the chapters a project contains, whether or not they have any content. Chapters absent from this range
   * do not exist in the project at all. Reuses the progress data cached by getChaptersWithContent, so calling both
   * for the same project costs no extra request.
   */
  async getPresentChapters(projectId: string): Promise<VerboseScriptureRange> {
    return await this.getChapters(projectId, () => true);
  }

  private async getChapters(
    projectId: string,
    includeChapter: (chapter: { verseSegments: number; blankVerseSegments: number }) => boolean
  ): Promise<VerboseScriptureRange> {
    const progress = await this.progressService.getProgressWithChapterProgress(projectId, {
      maxStalenessMs: DEFAULT_PROGRESS_STALENESS_MS
    });
    const scriptureRange = new VerboseScriptureRange();
    for (const bookProgress of progress.books) {
      const chapters = new ChapterSet([]);
      for (const chapterProgress of bookProgress.chapters) {
        if (includeChapter(chapterProgress)) {
          chapters.chapters.add(chapterProgress.chapterNumber);
        }
      }
      if (chapters.count() > 0) {
        scriptureRange.books.set(bookProgress.bookId, chapters);
      }
    }
    return scriptureRange;
  }

  /**
   * Returns the IDs of the books in a project that appear complete enough to be auto-selected as training data (see
   * bookAppearsCompleteForTrainingAutoSelection). Derived from the segment-level progress counts that
   * getChaptersWithContent discards, which is why this is computed separately. Reuses the cached progress, so calling
   * it alongside getChaptersWithContent for the same project costs no extra request.
   */
  async getCompleteBookIds(projectId: string): Promise<Set<string>> {
    const progress = await this.progressService.getProgressWithChapterProgress(projectId, {
      maxStalenessMs: DEFAULT_PROGRESS_STALENESS_MS
    });
    const completeBookIds = new Set<string>();
    for (const bookProgress of progress.books) {
      if (bookAppearsCompleteForTrainingAutoSelection(bookProgress)) {
        completeBookIds.add(bookProgress.bookId);
      }
    }
    return completeBookIds;
  }
}
