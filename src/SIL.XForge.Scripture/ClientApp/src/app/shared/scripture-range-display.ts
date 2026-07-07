import { Canon } from '@sillsdev/scripture';
import { I18nService } from 'xforge-common/i18n.service';
import { expectedBookChapters } from './progress-service/progress.service';
import { VerboseScriptureRange } from './scripture-range';

/**
 * One run of consecutive book numbers. A run of 3 or more books becomes a `range` group with a `start` and `end`
 * book number. A run of only 1 or 2 books becomes that many `single` groups instead, since a 2-book range (e.g.
 * "Genesis - Exodus") reads no better than just listing both books by name.
 */
export type BookNumberGroup = { kind: 'single'; bookNumber: number } | { kind: 'range'; start: number; end: number };

/** Splits sorted book numbers into consecutive runs. Returns one {@link BookNumberGroup} per run. */
export function groupContiguousBookNumbers(bookNumbers: number[]): BookNumberGroup[] {
  const groups: BookNumberGroup[] = [];
  let start: number | null = null;
  let end: number | null = null;
  const flush = (): void => {
    if (start == null || end == null) return;
    if (end - start + 1 >= 3) {
      groups.push({ kind: 'range', start, end });
    } else {
      for (let bookNumber = start; bookNumber <= end; bookNumber++) {
        groups.push({ kind: 'single', bookNumber });
      }
    }
  };
  for (const bookNumber of bookNumbers) {
    if (start == null || end == null) {
      start = bookNumber;
      end = bookNumber;
    } else if (bookNumber === end + 1) {
      end = bookNumber;
    } else {
      flush();
      start = bookNumber;
      end = bookNumber;
    }
  }
  flush();
  return groups;
}

/**
 * A contiguous run of full books (rendered as a book range), or a single book that is only partly covered
 * (rendered with its chapter range). Partial books are never absorbed into a range.
 */
export type BookDisplaySegment =
  | { kind: 'range'; bookNumbers: number[] }
  | { kind: 'partial'; bookId: string; chapterRange: string };

/**
 * Sorts books canonically and groups them for display: consecutive full books (null chapterRange) merge into one
 * `range` segment; each partial book becomes its own `partial` segment, splitting the run of full books around it.
 */
export function segmentBooksForDisplay(
  books: { bookNumber: number; chapterRange: string | null }[]
): BookDisplaySegment[] {
  const segments: BookDisplaySegment[] = [];
  let pendingFullBooks: number[] = [];
  const flushFullBooks = (): void => {
    if (pendingFullBooks.length > 0) {
      segments.push({ kind: 'range', bookNumbers: pendingFullBooks });
      pendingFullBooks = [];
    }
  };

  for (const book of [...books].sort((a, b) => a.bookNumber - b.bookNumber)) {
    if (book.chapterRange != null) {
      flushFullBooks();
      segments.push({
        kind: 'partial',
        bookId: Canon.bookNumberToId(book.bookNumber),
        chapterRange: book.chapterRange
      });
    } else {
      pendingFullBooks.push(book.bookNumber);
    }
  }
  flushFullBooks();
  return segments;
}

/**
 * Returns one localized string with all segments joined into a conjunction list, e.g. "Genesis, Exodus 1-10, and
 * Leviticus".
 */
export function formatBookDisplaySegments(segments: BookDisplaySegment[], i18n: I18nService): string {
  const labels = segments.flatMap(segment =>
    segment.kind === 'range'
      ? i18n.localizeBookRangeLabels(segment.bookNumbers)
      : // Parenthesize only a multi-part chapter range, so "Genesis 1-3, 7" doesn't read as separate list items.
        [
          i18n.localizeBookWithChapters(segment.bookId, segment.chapterRange, {
            grouped: segment.chapterRange.includes(',')
          })
        ]
  );
  return i18n.enumerateList(labels);
}

/**
 * Formats a scripture range string (e.g. "GEN1-3;EXO") for display, keeping chapter detail:
 * - a partly-covered book renders with its chapters: "Genesis 1-3"
 * - a full book renders by name, and adjacent full books collapse into "Genesis - Leviticus"
 *   (pass `collapseFullBookRuns: false` to list each full book by name instead)
 *
 * A book counts as full when it names no chapters, or when its chapters reach the canonical count
 * (`expectedBookChapters`). Caveat: a non-standard versification can make that count off by one at the end of a
 * book (same limitation as the draft preview buttons). Unknown book ids are skipped.
 */
export function formatScriptureRangeWithChapters(
  range: VerboseScriptureRange,
  i18n: I18nService,
  { collapseFullBookRuns = true }: { collapseFullBookRuns?: boolean } = {}
): string {
  const books = booksWithChapterRanges(range);
  const segments = collapseFullBookRuns
    ? segmentBooksForDisplay(books)
    : [...books].sort((a, b) => a.bookNumber - b.bookNumber).flatMap(book => segmentBooksForDisplay([book]));
  return formatBookDisplaySegments(segments, i18n);
}

/**
 * Compact, non-localized form of a scripture range for admin pages, e.g. "GEN-LEV; NUM 1-3, 7". Applies the same
 * full-book rules as {@link formatScriptureRangeWithChapters}: a book whose chapters reach the canonical count
 * renders as just its ID, and contiguous full books collapse into an ID range.
 */
export function formatScriptureRangeCompact(range: VerboseScriptureRange): string {
  return segmentBooksForDisplay(booksWithChapterRanges(range))
    .flatMap(segment =>
      segment.kind === 'range'
        ? groupContiguousBookNumbers(segment.bookNumbers).map(group =>
            group.kind === 'single'
              ? Canon.bookNumberToId(group.bookNumber)
              : `${Canon.bookNumberToId(group.start)}-${Canon.bookNumberToId(group.end)}`
          )
        : [`${segment.bookId} ${segment.chapterRange}`]
    )
    .join('; ');
}

/**
 * Compact display of raw scripture-range tokens (e.g. `["GEN", "EXO1-3"]`), tolerating tokens that don't parse
 * cleanly as a range. Book ids can come from legacy/free-form event-metric payloads, so a parse failure falls back
 * to the raw tokens joined with "; " instead of throwing.
 */
export function formatScriptureRangeTokensCompact(tokens: string[]): string {
  try {
    const formatted = formatScriptureRangeCompact(new VerboseScriptureRange(tokens.join(';')));
    if (formatted !== '' || tokens.length === 0) return formatted;
  } catch {}
  return tokens.join('; ');
}

/**
 * The books of a range with each book's chapter range for display, or null for a full book (one that names no
 * chapters, or whose chapters reach the canonical count from `expectedBookChapters`). Unknown book ids are skipped.
 */
function booksWithChapterRanges(range: VerboseScriptureRange): { bookNumber: number; chapterRange: string | null }[] {
  const books: { bookNumber: number; chapterRange: string | null }[] = [];
  for (const [bookId, chapters] of range.books) {
    const bookNumber = Canon.bookIdToNumber(bookId);
    if (bookNumber <= 0) continue;
    const isPartial = chapters.count() > 0 && chapters.count() < expectedBookChapters(bookId);
    books.push({ bookNumber, chapterRange: isPartial ? chapters.toStringForDisplay() : null });
  }
  return books;
}
