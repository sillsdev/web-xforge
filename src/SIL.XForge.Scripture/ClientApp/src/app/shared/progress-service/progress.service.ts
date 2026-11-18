import { Injectable } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { NoticeService } from 'xforge-common/notice.service';
import { SFProjectService } from '../../core/sf-project.service';

/** The expected number of chapters per book, based primarily on the eng.vrs versification files. */
export const chapterCounts: Record<string, number> = {
  GEN: 50,
  EXO: 40,
  LEV: 27,
  NUM: 36,
  DEU: 34,
  JOS: 24,
  JDG: 21,
  RUT: 4,
  '1SA': 31,
  '2SA': 24,
  '1KI': 22,
  '2KI': 25,
  '1CH': 29,
  '2CH': 36,
  EZR: 10,
  NEH: 13,
  EST: 10,
  JOB: 42,
  PSA: 150,
  PRO: 31,
  ECC: 12,
  SNG: 8,
  ISA: 66,
  JER: 52,
  LAM: 5,
  EZK: 48,
  DAN: 12,
  HOS: 14,
  JOL: 3,
  AMO: 9,
  OBA: 1,
  JON: 4,
  MIC: 7,
  NAM: 3,
  HAB: 3,
  ZEP: 3,
  HAG: 2,
  ZEC: 14,
  MAL: 4,
  MAT: 28,
  MRK: 16,
  LUK: 24,
  JHN: 21,
  ACT: 28,
  ROM: 16,
  '1CO': 16,
  '2CO': 13,
  GAL: 6,
  EPH: 6,
  PHP: 4,
  COL: 4,
  '1TH': 5,
  '2TH': 3,
  '1TI': 6,
  '2TI': 4,
  TIT: 3,
  PHM: 1,
  HEB: 13,
  JAS: 5,
  '1PE': 5,
  '2PE': 3,
  '1JN': 5,
  '2JN': 1,
  '3JN': 1,
  JUD: 1,
  REV: 22,
  TOB: 14,
  JDT: 16,
  ESG: 10,
  WIS: 19,
  SIR: 51,
  BAR: 6,
  LJE: 1,
  S3Y: 1,
  SUS: 1,
  BEL: 1,
  '1MA': 16,
  '2MA': 15,
  '3MA': 7,
  '4MA': 18,
  '1ES': 9,
  '2ES': 16,
  MAN: 1,
  PS2: 1,
  ODA: 14,
  PSS: 18,
  JSA: 24,
  JDB: 21,
  TBS: 14,
  SST: 1,
  DNT: 12,
  BLT: 1,
  '3ES': 9,
  EZA: 12,
  '5ES': 2,
  '6ES': 2,
  DAG: 14,
  PS3: 4,
  '2BA': 77,
  LBA: 9,
  JUB: 34,
  ENO: 42,
  '1MQ': 36,
  '2MQ': 20,
  '3MQ': 10,
  REP: 6,
  '4BA': 5,
  LAO: 1
};

/**
 * A book's translation progress, as verse counts for the book and for each of its chapters.
 *
 * The counts come from two sources that need not agree. `verses` and `blankVerses` are counted from the text, where a
 * verse range such as "7-9" is one unit. `expectedVerses` comes from the project's versification. So a chapter can
 * hold more or fewer verse units than the versification expects, and a chapter the project does not have adds to
 * `expectedVerses` but has no entry in `chapters`. A book the versification does not describe (such as front matter
 * or a glossary) has no expected count at all. The server reports the counts as it found them instead of reconciling
 * them; {@link bookTotalVerses} is the one place they are combined.
 */
export interface BookProgress {
  /** The book identifier (e.g. "GEN", "MAT"). */
  bookId: string;

  /**
   * The total number of verse units in this book. A verse unit corresponds to one verse marker in the text (so a
   * verse range such as "11-12" is one unit).
   */
  verses: number;

  /** The number of verse units in this book with no content in any of their segments. */
  blankVerses: number;

  chapters: ChapterProgress[];

  /**
   * The number of verses the project's versification expects in the whole book, including chapters the project does
   * not have, or `null` for a book the versification does not describe (a non-canonical book such as front matter or a
   * glossary).
   */
  expectedVerses: number | null;
}

/** A single chapter's translation-progress counts, in the same verse units as {@link BookProgress}. */
export interface ChapterProgress {
  chapterNumber: number;
  verses: number;
  blankVerses: number;
  /**
   * The number of verses the project's versification expects in this chapter. Zero if the versification has no such
   * chapter, which is always the case for a non-canonical book such as front matter or a glossary (see
   * {@link BookProgress.expectedVerses}).
   */
  expectedVerses: number;
}

/**
 * Project-wide translation progress, which adds together the {@link VerseCounts} of the books in the project so that a
 * project and a book are measured the same way (see {@link bookVerseCounts}). Books that do not exist in the project
 * at all are not counted.
 */
export class ProjectProgress implements VerseCounts {
  readonly translatedVerses: number;
  readonly untranslatedVerses: number;
  readonly totalVerses: number;
  readonly ratio: number;

  constructor(readonly books: BookProgress[]) {
    const bookCounts: VerseCounts[] = books.map(bookVerseCounts);
    const counts = verseCounts(
      bookCounts.reduce((sum, book) => sum + book.translatedVerses, 0),
      bookCounts.reduce((sum, book) => sum + book.totalVerses, 0)
    );
    this.translatedVerses = counts.translatedVerses;
    this.untranslatedVerses = counts.untranslatedVerses;
    this.totalVerses = counts.totalVerses;
    this.ratio = counts.ratio;
  }
}

/**
 * The number of verses a book should be measured against, so that chapters the project does not have yet count as
 * untranslated instead of being ignored.
 *
 * A chapter that has verse units is measured by those units, because a verse range such as "11-12" is one unit, and
 * measuring such a chapter by the versification's count would make it look incomplete forever. A chapter that has no
 * verse units, whether it is missing from the project or exists with only a chapter marker, is measured by the number
 * of verses the versification expects in it.
 *
 * The chapters without verse units cannot be summed directly, because a chapter missing from the project has no entry
 * in `chapters`. Instead, the versification's total for the whole book (`expectedVerses`) is reduced by the expected
 * counts of the chapters that do have verse units, and what remains is the expected size of all the others.
 *
 * A book the versification does not describe has no expected count, so it is measured by its verse units alone.
 */
export function bookTotalVerses(bookProgress: BookProgress): number {
  if (bookProgress.expectedVerses == null) {
    return bookProgress.verses;
  }
  const expectedVersesInChaptersWithVerses = bookProgress.chapters
    .filter(chapter => chapter.verses > 0)
    .reduce((sum, chapter) => sum + chapter.expectedVerses, 0);
  const expectedVersesInOtherChapters = bookProgress.expectedVerses - expectedVersesInChaptersWithVerses;
  return bookProgress.verses + expectedVersesInOtherChapters;
}

/** Translation progress reduced to verse counts, for a book or a whole project. */
export interface VerseCounts {
  translatedVerses: number;
  untranslatedVerses: number;
  /** The number of verses the progress is measured against; for a book, {@link bookTotalVerses}. */
  totalVerses: number;
  /** The translated fraction, or zero when there is nothing to measure against. */
  ratio: number;
}

function verseCounts(translatedVerses: number, totalVerses: number): VerseCounts {
  return {
    translatedVerses,
    untranslatedVerses: totalVerses - translatedVerses,
    totalVerses,
    ratio: totalVerses === 0 ? 0 : translatedVerses / totalVerses
  };
}

/**
 * A book's progress as verse counts, measured against {@link bookTotalVerses}. Chapters that are missing from the
 * project or have no verses yet count as untranslated, so a book with only a few complete chapters reports low
 * progress instead of 100%. This is the one place a book's counts are derived; consumers read from it rather than
 * subtracting the {@link BookProgress} fields themselves.
 */
export function bookVerseCounts(bookProgress: BookProgress): VerseCounts {
  return verseCounts(bookProgress.verses - bookProgress.blankVerses, bookTotalVerses(bookProgress));
}

/** Returns the expected number of chapters for a given bookId. */
export function expectedBookChapters(bookId: string): number {
  return chapterCounts[bookId] ?? 1;
}

/**
 * Minimum number of translated (non-blank) verse units a book must have before it can be auto-selected as training
 * data on a project's first draft. See {@link bookAppearsCompleteForTrainingAutoSelection}.
 */
const MIN_TRANSLATED_VERSES_TO_AUTO_SELECT_BOOK = 10;

/**
 * Whether a book appears complete enough to be auto-selected as training data on a project's first draft (i.e. when the
 * project has no previously saved training selection). The criteria are:
 *   1. more than {@link MIN_TRANSLATED_VERSES_TO_AUTO_SELECT_BOOK} translated (non-blank) verse units, and
 *   2. at least 99% of the book translated.
 * Verses expected in chapters that are missing from the project or have no verses yet count as untranslated (see
 * {@link bookVerseCounts}).
 *
 * Auto-selection is deliberately limited to books we can be highly confident are ready for use as training data because
 * selection is persisted and reused for later builds, so a wrong pick the user doesn't notice would impact future
 * drafts. Shared by the legacy draft-generation stepper and the new draft wizard so both flows stay in lockstep.
 */
export function bookAppearsCompleteForTrainingAutoSelection(bookProgress: BookProgress): boolean {
  const { translatedVerses, untranslatedVerses, totalVerses } = bookVerseCounts(bookProgress);
  return translatedVerses > MIN_TRANSLATED_VERSES_TO_AUTO_SELECT_BOOK && untranslatedVerses / totalVerses <= 0.01;
}

@Injectable({ providedIn: 'root' })
export class ProgressService {
  constructor(
    readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService
  ) {}

  // Alongside its age, every cache entry and in-flight request records the project's last-sync date string from
  // when it was fetched/started, so data from before the latest sync can be recognized as stale regardless of age.
  private projectProgressCache = new Map<
    string,
    { timestampMs: number; lastSyncDateString: string | undefined; progress: ProjectProgress }
  >();
  private requestCache = new Map<
    string,
    {
      startedAtMs: number;
      lastSyncDateString: string | undefined;
      promise: Promise<ProjectProgress>;
    }
  >();

  /**
   * `maxStalenessMs` is how old cached data may be and still be returned. Independent of age, data from before the
   * project's most recent successful sync never qualifies: entries are stamped with the project's last-sync date
   * string (`sync.dateLastSuccessfulSync`) and served only while that string is unchanged. Strings are compared for
   * equality, never parsed or compared against the clock, so server/client clock skew cannot break this. The age
   * window exists for what a last-sync date string can't see: progress drift from live editing in Scripture Forge
   * itself.
   */
  async getProgress(projectId: string, options: { maxStalenessMs: number }): Promise<ProjectProgress> {
    const projectDoc = await this.projectService.getProfile(projectId);
    const lastSyncDateString: string | undefined = projectDoc.data?.sync?.dateLastSuccessfulSync;
    // Compared for equality, not parsed and compared chronologically: dateLastSuccessfulSync is set by the server,
    // so a "newer than" comparison against Date.now() (client time) would be vulnerable to server/client clock
    // skew. Equality only asks "has this changed since the entry was stamped", which needs no shared clock.
    const qualifies = (timestampMs: number, dateString: string | undefined): boolean =>
      Date.now() - timestampMs < options.maxStalenessMs && dateString === lastSyncDateString;

    const cachedProgress = this.projectProgressCache.get(projectId);
    if (cachedProgress != null && qualifies(cachedProgress.timestampMs, cachedProgress.lastSyncDateString)) {
      return cachedProgress.progress;
    }
    // An in-flight request is a not-yet-settled cache entry: coalesce onto it only if it satisfies this caller's
    // freshness requirements. Sibling reads issued together share one request (same date string), while a request
    // started before the latest sync never qualifies.
    const existingRequest = this.requestCache.get(projectId);
    if (existingRequest != null && qualifies(existingRequest.startedAtMs, existingRequest.lastSyncDateString)) {
      return existingRequest.promise;
    }
    const requestTimestamp = Date.now();
    const requestPromise = this.projectService
      .getProjectProgress(projectId)
      .then(bookProgressList => {
        const sortedBookProgress = bookProgressList.sort(
          (a, b) => Canon.bookIdToNumber(a.bookId) - Canon.bookIdToNumber(b.bookId)
        );
        const progress = new ProjectProgress(sortedBookProgress);
        // A slower request that began earlier must not clobber fresher data already written by a later request.
        const cacheEntry = this.projectProgressCache.get(projectId);
        if (cacheEntry == null || cacheEntry.timestampMs <= requestTimestamp) {
          this.projectProgressCache.set(projectId, { timestampMs: requestTimestamp, lastSyncDateString, progress });
        }
        // Only clear the slot if it is still ours; a later forced refresh may have replaced this in-flight entry.
        if (this.requestCache.get(projectId)?.promise === requestPromise) {
          this.requestCache.delete(projectId);
        }
        return progress;
      })
      .catch(error => {
        if (this.requestCache.get(projectId)?.promise === requestPromise) {
          this.requestCache.delete(projectId);
        }
        throw error;
      });
    this.requestCache.set(projectId, { startedAtMs: requestTimestamp, lastSyncDateString, promise: requestPromise });
    return requestPromise;
  }
}
