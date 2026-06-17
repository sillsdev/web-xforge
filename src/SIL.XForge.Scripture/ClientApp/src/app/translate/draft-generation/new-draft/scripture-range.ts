import { difference, intersection, union } from '../../../../xforge-common/util/set-util';

/** Represents a potentially non-contiguous range of chapters, such as 1-3,7,10-12 */
export class ChapterSet {
  static chapterRangeSeparator = ',';
  static chapterRangeStartEndSeparator = '-';

  /**
   * Code point of the digit "zero" for each decimal-digit script we accept from a keyboard. Each Unicode decimal-digit
   * block is the ten consecutive code points 0-9, so a digit's value is its offset from the block's zero. Fullwidth
   * digits are folded to ASCII by NFKC normalization, so they need no entry here. Extend this list to accept more
   * scripts; an unrecognized digit script simply fails validation (a clear "invalid range" error, never silent).
   */
  private static readonly digitBlockZeros = [
    0x0660, // Arabic-Indic (Arabic)
    0x06f0, // Extended Arabic-Indic (Persian, Urdu)
    0x0966, // Devanagari (Hindi, Nepali, ...)
    0x09e6, // Bengali (Bangla, Assamese)
    0x0e50 // Thai
  ];

  /** Non-Latin comma characters whose key on a native keyboard layout serves as the list separator. */
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
   * Parses chapter input typed by a user, accepting the looser styles a real keyboard produces rather than only the
   * exact serialized form. Tolerated: surrounding/inner whitespace ("1 - 5", "1-5, 8"); the wide variants of the
   * digits, comma, and hyphen that East Asian (Chinese/Japanese/Korean) input methods produce — Unicode calls these
   * "fullwidth" forms, e.g. "１" for the digit one; the comma keys of non-Latin layouts (ideographic "、", Arabic
   * "،"); and the digits of non-Latin keyboards (Arabic-Indic, Persian, Devanagari, Bengali, Thai — see
   * digitBlockZeros); plus empty tokens from trailing/doubled commas. Everything is normalized to the ASCII form and
   * handed to the strict constructor, so genuinely malformed input (non-digits, "1-3-5", start > end, a space inside
   * a number) is still rejected with a clear error rather than silently accepted. Use this for user input; use the
   * constructor for serialized ranges.
   */
  static fromUserInput(input: string): ChapterSet {
    // NFKC normalization rewrites "compatibility" characters to their plain equivalents. Most relevant here: the wide
    // "fullwidth" digits/comma/hyphen produced by East Asian input methods, and a non-breaking space, all become
    // ordinary ASCII.
    let normalized = input.normalize('NFKC');

    // Accept comma keys from non-Latin layouts as the list separator.
    for (const variant of ChapterSet.commaVariants) {
      normalized = normalized.split(variant).join(ChapterSet.chapterRangeSeparator);
    }

    // Map decimal digits from non-Latin keyboards to ASCII so they validate and parse. An unrecognized digit script
    // is left as-is and rejected by validation below.
    normalized = normalized.replace(/\p{Nd}/gu, ch => {
      const cp = ch.codePointAt(0)!;
      if (cp >= 0x30 && cp <= 0x39) return ch; // already ASCII
      for (const zero of ChapterSet.digitBlockZeros) {
        if (cp >= zero && cp <= zero + 9) return String(cp - zero);
      }
      return ch;
    });

    // Tokenize leniently: trim each token, drop whitespace around the hyphen, and drop empty tokens left by a
    // trailing or doubled comma. Whitespace *inside* a number is preserved so it fails validation (it is ambiguous).
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
