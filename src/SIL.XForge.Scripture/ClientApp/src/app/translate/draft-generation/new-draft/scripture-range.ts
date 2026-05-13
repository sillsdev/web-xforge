/** Represents a potentially non-contiguous range of chapters, such as 1-3,7,10-12 */
export class ChapterSet {
  static chapterRangeSeparator = ',';
  static chapterRangeStartEndSeparator = '-';

  chapters = new Set<number>();

  constructor(range: string | number[]) {
    if (typeof range === 'string') {
      const ranges = range.split(ChapterSet.chapterRangeSeparator);
      for (const range of ranges) {
        const [startString, endString] = range.split(ChapterSet.chapterRangeStartEndSeparator);
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
    result.chapters = this.chapters.intersection(other.chapters);
    return result;
  }

  union(other: ChapterSet): ChapterSet {
    const result = new ChapterSet([]);
    result.chapters = this.chapters.union(other.chapters);
    return result;
  }

  difference(other: ChapterSet): ChapterSet {
    const result = new ChapterSet([]);
    result.chapters = this.chapters.difference(other.chapters);
    return result;
  }
}

/** Represents a book in a scripture range, optionally with a range of chapters */
export class ScriptureRangeBook {
  constructor(
    readonly bookId: string,
    range: string | number[]
  ) {
    this.chapters = new ChapterSet(range);
  }

  chapters: ChapterSet;

  toString(): string {
    return this.bookId + this.chapters.toString();
  }
}

/**
 * Represents a scripture range, which is a set of books, each with a range of chapters. Verbose, because the
 * chapters are explicitly listed and never just implied
 */
export class VerboseScriptureRange {
  static bookSeparator = ';';

  books: ScriptureRangeBook[] = [];

  constructor(range: string | ScriptureRangeBook[]) {
    if (typeof range === 'string') {
      const books = range.split(VerboseScriptureRange.bookSeparator);
      for (const book of books) {
        const bookId = book.slice(0, 3);
        const chapterRange = book.slice(3);
        this.books.push(new ScriptureRangeBook(bookId, chapterRange));
      }
    } else {
      this.books = range;
    }
  }

  toString(): string {
    return this.books.map(book => book.toString()).join(VerboseScriptureRange.bookSeparator);
  }

  intersection(other: VerboseScriptureRange): VerboseScriptureRange {
    const result = new VerboseScriptureRange([]);
    const otherBooksById = new Map(other.books.map(book => [book.bookId, book]));
    for (const book of this.books) {
      const otherBook = otherBooksById.get(book.bookId);
      if (otherBook != null) {
        const resultBook = new ScriptureRangeBook(book.bookId, [
          ...otherBook.chapters.intersection(book.chapters).chapters
        ]);
        result.books.push(resultBook);
      }
    }
    return result;
  }

  union(other: VerboseScriptureRange): VerboseScriptureRange {
    const result = new VerboseScriptureRange([]);
    const otherBooksById = new Map(other.books.map(book => [book.bookId, book]));
    for (const book of this.books) {
      const otherBook = otherBooksById.get(book.bookId);
      const resultBook = new ScriptureRangeBook(book.bookId, [
        ...book.chapters.union(otherBook?.chapters ?? new ChapterSet([])).chapters
      ]);
      result.books.push(resultBook);
    }
    for (const otherBook of other.books) {
      if (!result.books.some(book => book.bookId === otherBook.bookId)) {
        result.books.push(otherBook);
      }
    }
    return result;
  }

  difference(other: VerboseScriptureRange): VerboseScriptureRange {
    const result = new VerboseScriptureRange([]);
    const otherBooksById = new Map(other.books.map(book => [book.bookId, book]));
    for (const book of this.books) {
      const otherBook = otherBooksById.get(book.bookId);
      if (otherBook != null) {
        const resultBook = new ScriptureRangeBook(book.bookId, []);

        // If this book has no chapter range, treat it as including all chapters, so the difference is all chapters
        // except the other book's chapter range. If both have chapter ranges, take the difference of the chapter sets.
        if (book.chapters == null && otherBook.chapters != null) {
          const allChapters = new ChapterSet([]);
          for (let i = 1; i <= 150; i++) {
            allChapters.chapters.add(i);
          }
          resultBook.chapters = allChapters.difference(otherBook.chapters);
        } else if (book.chapters != null && otherBook.chapters != null) {
          resultBook.chapters = book.chapters.difference(otherBook.chapters);
        } else {
          resultBook.chapters = book.chapters;
        }
        result.books.push(resultBook);
      } else {
        result.books.push(book);
      }
    }
    return result;
  }
}
