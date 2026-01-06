import { Injectable } from '@angular/core';
import { NoticeService } from 'xforge-common/notice.service';
import { SFProjectService } from '../../core/sf-project.service';

/**
 * The expected number of verses per book, calculated from the libpalaso versification files.
 * Used for TextProgress compatibility.
 */
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
  REV: 405
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
  const translatedSegments = bookProgress.verseSegments - bookProgress.blankVerseSegments;
  const expectedNumberOfVerses = verseCounts[bookProgress.bookId] ?? 0;
  if (expectedNumberOfVerses !== 0 && bookProgress.verseSegments < expectedNumberOfVerses * 0.1) {
    return translatedSegments / expectedNumberOfVerses;
  } else {
    return bookProgress.verseSegments === 0 ? 0 : translatedSegments / bookProgress.verseSegments;
  }
}

@Injectable({ providedIn: 'root' })
export class ProgressService {
  constructor(
    readonly noticeService: NoticeService,
    // private readonly activatedProject: ActivatedProjectService,
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
      .then(booksProgress => {
        const progress = new ProjectProgress(booksProgress);
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
