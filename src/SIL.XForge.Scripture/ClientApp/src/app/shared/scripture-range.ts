import { difference, intersection, union } from 'xforge-common/util/set-util';

/** Represents a potentially non-contiguous range of chapters, such as 1-3,7,10-12 */
export class ChapterSet {
  static readonly chapterRangeSeparator = ',';
  static readonly chapterRangeStartEndSeparator = '-';

  /**
   * Code point of the digit "zero" for each non-Latin decimal digit script. Within each block the ten code points
   * 0-9 are consecutive, so a digit's value is its offset from the block's zero. Extend to accept more scripts.
   */
  private static readonly digitBlockZeros = [
    0x0660, // Arabic-Indic (Arabic)
    0x06f0, // Extended Arabic-Indic (Persian, Urdu)
    0x0966, // Devanagari (Hindi, Nepali, ...)
    0x09e6, // Bengali (Bangla, Assamese)
    0x0e50 // Thai
  ];

  /** Non-Latin comma keys accepted as the list separator. */
  private static readonly commaVariants = ['、', '،']; // ideographic comma, Arabic comma

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

  /**
   * Parses chapter input from a user, tolerating styles a real keyboard produces: surrounding whitespace, fullwidth
   * digits/comma/hyphen (East Asian input methods), non-Latin commas (see {@link commaVariants}), and non-Latin digits
   * (see {@link digitBlockZeros}). Malformed input is still rejected. Use the constructor for serialized ranges.
   */
  static fromUserInput(input: string): ChapterSet {
    // NFKC normalization folds fullwidth digits/comma/hyphen and non-breaking spaces to ASCII.
    let normalized = input.normalize('NFKC');

    // Accept comma keys from non-Latin layouts as the list separator.
    for (const variant of ChapterSet.commaVariants) {
      normalized = normalized.split(variant).join(ChapterSet.chapterRangeSeparator);
    }

    // Map non-Latin decimal digits to ASCII; leave unrecognized scripts as-is for validation to reject.
    normalized = normalized.replace(/\p{Nd}/gu, ch => {
      const cp = ch.codePointAt(0)!;
      if (cp >= 0x30 && cp <= 0x39) return ch; // already ASCII
      for (const zero of ChapterSet.digitBlockZeros) {
        if (cp >= zero && cp <= zero + 9) return String(cp - zero);
      }
      return ch;
    });

    // Trim tokens, drop whitespace around the hyphen, and drop empty tokens from trailing/doubled commas.
    normalized = normalized
      .split(ChapterSet.chapterRangeSeparator)
      .map(token => token.trim().replace(/\s*-\s*/g, ChapterSet.chapterRangeStartEndSeparator))
      .filter(token => token.length > 0)
      .join(ChapterSet.chapterRangeSeparator);

    return new ChapterSet(normalized);
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

  /** Like {@link toString}, but with a space after each separator for readability ("1-3, 7" vs "1-3,7"). */
  toStringForDisplay(): string {
    return this.toString().replaceAll(ChapterSet.chapterRangeSeparator, `${ChapterSet.chapterRangeSeparator} `);
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
 * Represents a scripture range: a set of books, each with an explicit set of chapters. It is "verbose" because the
 * chapters are always enumerated and never merely implied. An empty {@link ChapterSet} for a book means that no
 * chapters are selected, not that all of them are.
 *
 * Because of this, the type has no way to represent a whole book whose chapter count is unknown. The canonical
 * scripture range string used by the backend treats a token that names only a book (such as "GEN" with no chapters) as
 * "all chapters of that book", but there is no equivalent here. Parsing such a token yields a book mapped to an empty
 * ChapterSet, which means no chapters, so {@link union} and {@link difference} will drop it via
 * {@link removeEmptyBooks}. Feeding a canonical range that names only a book into this type and expecting the whole
 * book to survive a set operation is therefore a misuse: the book silently vanishes.
 *
 * The deeper limitation is that set operations involving a whole book are ill-defined without external information.
 * For example, given a range of just "GEN" (the whole book), what does difference(GEN1-3) leave? We cannot know which
 * chapters of Genesis remain, because that depends on how many chapters Genesis has, and that varies by project. This
 * type does not carry that information, so the operation cannot be computed correctly here. Only ranges whose chapters
 * are fully enumerated are safe operands for {@link union} and {@link difference}.
 */
export class VerboseScriptureRange {
  static bookSeparator = ';';

  books: Map<string, ChapterSet> = new Map();

  constructor(range: string = '') {
    if (range === '') return;
    const books = range.split(VerboseScriptureRange.bookSeparator);
    for (const book of books) {
      const bookId = book.slice(0, 3);
      const chapterRange = book.slice(3);
      this.books.set(bookId, new ChapterSet(chapterRange));
    }
  }

  /**
   * Combines canonical scripture-range strings into one range, preserving whole books (a chapter-less token such as
   * "GEN") instead of dropping them the way {@link union} does. Use this, not union, when merging canonical ranges
   * that may name whole books.
   */
  static fromCombinedRanges(rangeStrings: string[]): VerboseScriptureRange {
    const combined = new VerboseScriptureRange();
    for (const rangeString of rangeStrings) {
      for (const [bookId, chapters] of new VerboseScriptureRange(rangeString).books) {
        const existing = combined.books.get(bookId);
        combined.books.set(bookId, existing != null ? existing.union(chapters) : chapters.clone());
      }
    }
    return combined;
  }

  clone(): VerboseScriptureRange {
    const result = new VerboseScriptureRange();
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

  union(other: VerboseScriptureRange): VerboseScriptureRange {
    const result = new VerboseScriptureRange();
    for (const [bookId, chapters] of this.books) {
      const otherChapters = other.books.get(bookId);
      if (otherChapters != null) {
        const resultChapters = chapters.union(otherChapters);
        result.books.set(bookId, resultChapters);
      } else {
        // Clone so the result owns its ChapterSets and doesn't alias the operands.
        result.books.set(bookId, chapters.clone());
      }
    }
    for (const [bookId, chapters] of other.books) {
      if (!result.books.has(bookId)) {
        result.books.set(bookId, chapters.clone());
      }
    }
    result.removeEmptyBooks();
    return result;
  }

  difference(other: VerboseScriptureRange): VerboseScriptureRange {
    const result = new VerboseScriptureRange();
    for (const [bookId, chapters] of this.books) {
      const otherChapters = other.books.get(bookId);
      if (otherChapters != null) {
        const resultChapters = chapters.difference(otherChapters);
        result.books.set(bookId, resultChapters);
      } else {
        // Clone so the result owns its ChapterSets and doesn't alias the operands.
        result.books.set(bookId, chapters.clone());
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
