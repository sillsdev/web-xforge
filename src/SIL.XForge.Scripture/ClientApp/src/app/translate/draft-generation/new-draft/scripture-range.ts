import { difference, intersection, union } from '../../../../xforge-common/util/set-util';

/** Represents a potentially non-contiguous range of chapters, such as 1-3,7,10-12 */
export class ChapterSet {
  static chapterRangeSeparator = ',';
  static chapterRangeStartEndSeparator = '-';

  chapters = new Set<number>();

  constructor(range: string | number[]) {
    if (typeof range === 'string') {
      if (range === '') return;
      const ranges = range.split(ChapterSet.chapterRangeSeparator);
      for (const range of ranges) {
        const parts = range.split(ChapterSet.chapterRangeStartEndSeparator);
        // A token is either a single chapter ("5") or a start-end pair ("1-3"). More than one separator (e.g.
        // "1-3-5") is malformed and must be rejected rather than silently truncated to the first two parts.
        if (parts.length > 2) {
          throw new Error(`Invalid chapter range: ${range}`);
        }
        const [startString, endString] = parts;
        if (!(/^\d+$/.test(startString) && (endString == null || /^\d+$/.test(endString)))) {
          throw new Error(`Invalid chapter range: ${range}`);
        }
        const start = parseInt(startString, 10);
        const end = endString == null ? start : parseInt(endString, 10);
        if (start > end) {
          throw new Error(`Start chapter must be less than or equal to end chapter: ${range}`);
        }
        for (let i = start; i <= end; i++) {
          this.chapters.add(i);
        }
      }
    } else {
      for (const chapter of range) {
        this.chapters.add(chapter);
      }
    }
  }

  clone(): ChapterSet {
    return new ChapterSet([...this.chapters]);
  }

  toString(): string {
    const sortedChapters = [...this.chapters].sort((a, b) => a - b);
    const ranges: string[] = [];
    let rangeStart: number | null = null;
    let previousChapter: number | null = null;
    for (const chapter of sortedChapters) {
      if (rangeStart == null) {
        rangeStart = chapter;
      } else if (previousChapter != null && chapter !== previousChapter + 1) {
        ranges.push(
          rangeStart === previousChapter
            ? `${rangeStart}`
            : `${rangeStart}${ChapterSet.chapterRangeStartEndSeparator}${previousChapter}`
        );
        rangeStart = chapter;
      }
      previousChapter = chapter;
    }
    if (rangeStart != null && previousChapter != null) {
      ranges.push(
        rangeStart === previousChapter
          ? `${rangeStart}`
          : `${rangeStart}${ChapterSet.chapterRangeStartEndSeparator}${previousChapter}`
      );
    }
    return ranges.join(ChapterSet.chapterRangeSeparator);
  }

  count(): number {
    return this.chapters.size;
  }

  intersection(other: ChapterSet): ChapterSet {
    const result = new ChapterSet([]);
    result.chapters = intersection(this.chapters, other.chapters);
    return result;
  }

  union(other: ChapterSet): ChapterSet {
    const result = new ChapterSet([]);
    result.chapters = union(this.chapters, other.chapters);
    return result;
  }

  difference(other: ChapterSet): ChapterSet {
    const result = new ChapterSet([]);
    result.chapters = difference(this.chapters, other.chapters);
    return result;
  }
}

/**
 * Represents a scripture range, which is a set of books, each with a range of chapters. Verbose, because the
 * chapters are explicitly listed and never just implied
 */
export class VerboseScriptureRange {
  static bookSeparator = ';';

  books: Map<string, ChapterSet> = new Map();

  constructor(range: string) {
    if (range === '') return;
    const books = range.split(VerboseScriptureRange.bookSeparator);
    for (const book of books) {
      const bookId = book.slice(0, 3);
      const chapterRange = book.slice(3);
      this.books.set(bookId, new ChapterSet(chapterRange));
    }
  }

  clone(): VerboseScriptureRange {
    const result = new VerboseScriptureRange('');
    for (const [bookId, chapters] of this.books) {
      result.books.set(bookId, chapters.clone());
    }
    return result;
  }

  toString(): string {
    return Array.from(this.books.entries())
      .map(([bookId, chapters]) => bookId + chapters.toString())
      .join(VerboseScriptureRange.bookSeparator);
  }

  intersection(other: VerboseScriptureRange): VerboseScriptureRange {
    const result = new VerboseScriptureRange('');
    for (const [bookId, chapters] of this.books) {
      const otherChapters = other.books.get(bookId);
      if (otherChapters != null) {
        const resultChapters = chapters.intersection(otherChapters);
        result.books.set(bookId, resultChapters);
      }
    }
    result.removeEmptyBooks();
    return result;
  }

  union(other: VerboseScriptureRange): VerboseScriptureRange {
    const result = new VerboseScriptureRange('');
    for (const [bookId, chapters] of this.books) {
      const otherChapters = other.books.get(bookId);
      if (otherChapters != null) {
        const resultChapters = chapters.union(otherChapters);
        result.books.set(bookId, resultChapters);
      } else {
        result.books.set(bookId, chapters);
      }
    }
    for (const [bookId, chapters] of other.books) {
      if (!result.books.has(bookId)) {
        result.books.set(bookId, chapters);
      }
    }
    result.removeEmptyBooks();
    return result;
  }

  difference(other: VerboseScriptureRange): VerboseScriptureRange {
    const result = new VerboseScriptureRange('');
    for (const [bookId, chapters] of this.books) {
      const otherChapters = other.books.get(bookId);
      if (otherChapters != null) {
        const resultChapters = chapters.difference(otherChapters);
        result.books.set(bookId, resultChapters);
      } else {
        result.books.set(bookId, chapters);
      }
    }
    result.removeEmptyBooks();
    return result;
  }

  private removeEmptyBooks(): void {
    for (const [bookId, chapters] of this.books) {
      if (chapters.count() === 0) this.books.delete(bookId);
    }
  }
}
