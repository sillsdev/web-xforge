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
}

/** A book's translation-progress counts broken down per chapter, for features that need chapter-level detail. */
export interface BookProgressWithChapterProgress extends BookProgress {
  chapters: ChapterProgress[];
  /**
   * The number of verses the project's versification expects in the whole book. Unlike `verses` this also covers
   * chapters that do not exist in the project and so have no entry in `chapters`.
   */
  expectedVerses: number;
}

/** A single chapter's translation-progress counts, in the same verse units as {@link BookProgress}. */
export interface ChapterProgress {
  chapterNumber: number;
  verses: number;
  blankVerses: number;
  /** The number of verses the project's versification expects in this chapter, or zero if it does not have it. */
  expectedVerses: number;
}

export class ProjectProgress {
  verses = this.books.reduce((acc, book) => acc + book.verses, 0);
  blankVerses = this.books.reduce((acc, book) => acc + book.blankVerses, 0);
  translatedVerses = this.verses - this.blankVerses;
  ratio = this.verses === 0 ? 0 : this.translatedVerses / this.verses;

  constructor(readonly books: BookProgress[]) {}
}

/** Project-wide translation progress whose per-book data carries chapter-level detail (see {@link BookProgressWithChapterProgress}). */
export class ProjectProgressWithChapterProgress extends ProjectProgress {
  constructor(readonly books: BookProgressWithChapterProgress[]) {
    super(books);
  }
}

/**
 * The fraction of a book that is translated, treating chapters that do not exist in the project as untranslated.
 * Chapters that are present are measured in their own verse units, so verse ranges do not distort the ratio; the
 * missing chapters contribute the verses the versification expects of them. A book with only a few complete
 * chapters therefore reports low progress instead of 100%.
 */
export function bookProgressRatio(bookProgress: BookProgressWithChapterProgress): number {
  const translatedVerses = bookProgress.verses - bookProgress.blankVerses;
  const expectedVersesInPresentChapters = bookProgress.chapters.reduce(
    (sum, chapter) => sum + chapter.expectedVerses,
    0
  );
  const expectedVersesInMissingChapters = Math.max(0, bookProgress.expectedVerses - expectedVersesInPresentChapters);
  const totalVerses = bookProgress.verses + expectedVersesInMissingChapters;
  return totalVerses === 0 ? 0 : translatedVerses / totalVerses;
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
 *   2. at least 99% of the book translated, or no more than 3 blank verse units.
 *
 * Auto-selection is intentionally high-conviction: the selection is persisted and reused for later builds, so a wrong
 * pick would silently degrade future drafts. This favors only books that look essentially fully translated. Shared by
 * the legacy draft-generation stepper and the new draft wizard so both flows stay in lockstep.
 */
export function bookAppearsCompleteForTrainingAutoSelection(bookProgress: BookProgress): boolean {
  const translatedVerses = bookProgress.verses - bookProgress.blankVerses;
  return (
    translatedVerses > MIN_TRANSLATED_VERSES_TO_AUTO_SELECT_BOOK &&
    (bookProgress.blankVerses / bookProgress.verses <= 0.01 || bookProgress.blankVerses <= 3)
  );
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
    { timestampMs: number; lastSyncDateString: string | undefined; progress: ProjectProgressWithChapterProgress }
  >();
  private requestCache = new Map<
    string,
    {
      startedAtMs: number;
      lastSyncDateString: string | undefined;
      promise: Promise<ProjectProgressWithChapterProgress>;
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
  async getProgressWithChapterProgress(
    projectId: string,
    options: { maxStalenessMs: number }
  ): Promise<ProjectProgressWithChapterProgress> {
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
        const progress = new ProjectProgressWithChapterProgress(sortedBookProgress);
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

  async getProgress(projectId: string, options: { maxStalenessMs: number }): Promise<ProjectProgress> {
    return await this.getProgressWithChapterProgress(projectId, options);
  }
}
