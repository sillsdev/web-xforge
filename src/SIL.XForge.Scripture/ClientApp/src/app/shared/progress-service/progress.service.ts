import { Injectable } from '@angular/core';
import { Canon } from '@sillsdev/scripture';
import { NoticeService } from 'xforge-common/notice.service';
import { SFProjectService } from '../../core/sf-project.service';

/** The expected number of verses per book, calculated from the libpalaso versification files. */
const verseCounts: Record<string, number> = {
  GEN: 1533,
  EXO: 1213,
  LEV: 859,
  NUM: 1289,
  DEU: 959,
  JOS: 658,
  JDG: 618,
  RUT: 85,
  '1SA': 811,
  '2SA': 695,
  '1KI': 817,
  '2KI': 719,
  '1CH': 943,
  '2CH': 822,
  EZR: 280,
  NEH: 405,
  EST: 167,
  JOB: 1070,
  PSA: 2527,
  PRO: 915,
  ECC: 222,
  SNG: 117,
  ISA: 1291,
  JER: 1364,
  LAM: 154,
  EZK: 1273,
  DAN: 357,
  HOS: 197,
  JOL: 73,
  AMO: 146,
  OBA: 21,
  JON: 48,
  MIC: 105,
  NAM: 47,
  HAB: 56,
  ZEP: 53,
  HAG: 38,
  ZEC: 211,
  MAL: 55,
  MAT: 1071,
  MRK: 678,
  LUK: 1151,
  JHN: 879,
  ACT: 1006,
  ROM: 433,
  '1CO': 437,
  '2CO': 256,
  GAL: 149,
  EPH: 155,
  PHP: 104,
  COL: 95,
  '1TH': 89,
  '2TH': 47,
  '1TI': 113,
  '2TI': 83,
  TIT: 46,
  PHM: 25,
  HEB: 303,
  JAS: 108,
  '1PE': 105,
  '2PE': 61,
  '1JN': 105,
  '2JN': 13,
  '3JN': 15,
  JUD: 25,
  REV: 405,
  TOB: 248,
  JDT: 340,
  ESG: 267,
  WIS: 435,
  SIR: 1401,
  BAR: 141,
  LJE: 72,
  S3Y: 67,
  SUS: 64,
  BEL: 42,
  '1MA': 924,
  '2MA': 555,
  '3MA': 228,
  '4MA': 482,
  '1ES': 434,
  '2ES': 944,
  MAN: 15,
  PS2: 7,
  ODA: 275,
  PSS: 293,
  JSA: 658,
  JDB: 618,
  TBS: 248,
  SST: 64,
  DNT: 424,
  BLT: 42,
  '3ES': 434,
  EZA: 715,
  '5EZ': 88,
  '6EZ': 141,
  DAG: 424,
  PS3: 49,
  '2BA': 613,
  LBA: 82,
  JUB: 1217,
  ENO: 1563,
  '1MQ': 756,
  '2MQ': 396,
  '3MQ': 208,
  REP: 160,
  '4BA': 184,
  LAO: 20
};

/** The expected number of chapters per book, based primarily on the eng.vrs versification files. */
const chapterCounts: Record<string, number> = {
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

  /** The total number of verse segments in this book. */
  verseSegments: number;

  /** The number of blank verse segments in this book. */
  blankVerseSegments: number;
}

export class ProjectProgress {
  verseSegments = this.books.reduce((acc, book) => acc + book.verseSegments, 0);
  blankVerseSegments = this.books.reduce((acc, book) => acc + book.blankVerseSegments, 0);
  translatedVerseSegments = this.verseSegments - this.blankVerseSegments;
  ratio = this.verseSegments === 0 ? 0 : this.translatedVerseSegments / this.verseSegments;

  constructor(readonly books: BookProgress[]) {}
}

/**
 * Given a BookProgress object that indicates the total number of verse segments and number of blank verse segments,
 * determines what the actual likely progress ratio is, based on the number of verses in the book.
 *
 * For most books, this will be the same as the ratio of translated segments to total segments, but if a book has very
 * few segments but many expected verses (total segments < 10% of expected verses), it's unlikely the book actually
 * combines verses so much that it's produced this ratio, and more likely the book is just missing most verses. In this
 * case the function will return the ratio of translated segments to expected verses, which will provide a very rough
 * approximation (since it assumes a 1:1 ratio of segments to verses).
 */
export function estimatedActualBookProgress(bookProgress: BookProgress): number {
  const MAX_PLAUSIBLE_AVERAGE_VERSES_PER_SEGMENT = 10;
  const translatedSegments = bookProgress.verseSegments - bookProgress.blankVerseSegments;
  const expectedNumberOfVerses = verseCounts[bookProgress.bookId] ?? 0;
  if (
    expectedNumberOfVerses !== 0 &&
    bookProgress.verseSegments * MAX_PLAUSIBLE_AVERAGE_VERSES_PER_SEGMENT < expectedNumberOfVerses
  ) {
    return translatedSegments / expectedNumberOfVerses;
  } else {
    return bookProgress.verseSegments === 0 ? 0 : translatedSegments / bookProgress.verseSegments;
  }
}

/** Returns the expected number of chapters for a given bookId. */
export function expectedBookChapters(bookId: string): number {
  return chapterCounts[bookId] ?? 1;
}

@Injectable({ providedIn: 'root' })
export class ProgressService {
  constructor(
    readonly noticeService: NoticeService,
    private readonly projectService: SFProjectService
  ) {}

  private projectProgressCache = new Map<string, { timestampMs: number; progress: ProjectProgress }>();
  private requestCache = new Map<string, Promise<ProjectProgress>>();

  async getProgress(projectId: string, options: { maxStalenessMs: number }): Promise<ProjectProgress> {
    const cachedProgress = this.projectProgressCache.get(projectId);
    if (cachedProgress != null && Date.now() - cachedProgress.timestampMs < options.maxStalenessMs) {
      return cachedProgress.progress;
    }
    const existingRequest = this.requestCache.get(projectId);
    if (existingRequest) {
      return existingRequest;
    }
    const requestTimestamp = Date.now();
    const requestPromise = this.projectService
      .getProjectProgress(projectId)
      .then(bookProgressList => {
        const sortedBookProgress = bookProgressList.sort((a, b) =>
          Canon.bookIdToNumber(a.bookId) < Canon.bookIdToNumber(b.bookId) ? -1 : 1
        );
        const progress = new ProjectProgress(sortedBookProgress);
        this.projectProgressCache.set(projectId, { timestampMs: requestTimestamp, progress });
        this.requestCache.delete(projectId);
        return progress;
      })
      .catch(error => {
        this.requestCache.delete(projectId);
        throw error;
      });
    this.requestCache.set(projectId, requestPromise);
    return requestPromise;
  }
}
