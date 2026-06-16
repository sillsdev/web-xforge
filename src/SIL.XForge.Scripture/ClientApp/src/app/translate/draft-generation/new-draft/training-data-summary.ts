import { Canon } from '@sillsdev/scripture';
import { I18nService } from 'xforge-common/i18n.service';
import { ChapterSet, VerboseScriptureRange } from './scripture-range';

/**
 * A contiguous run of fully-used training books (rendered as a book range), or a single book that is only partly
 * used as training data (rendered with its chapter range). Partial books are never absorbed into a range.
 */
export type TrainingBookSegment =
  | { kind: 'range'; bookNumbers: number[] }
  | { kind: 'partial'; bookId: string; chapterRange: string };

const EMPTY_CHAPTER_SET = new ChapterSet('');

/** Adds a space after each comma so "1-3,7" reads as "1-3, 7". */
function formatChapterRange(range: string): string {
  return range.replace(/,/g, ', ');
}

/**
 * Splits a list of training book numbers into display segments.
 *
 * A book counts as "full" (name only) when its training selection covers the whole book — every chapter that is
 * either available for training *or* being drafted. Adjacent full books are grouped into a single `range` segment.
 * A book whose selection is only part of the book is a `partial` segment carrying its chapter range, and it breaks
 * any surrounding range (so a partial book in the middle of otherwise-full books is never collapsed into a range).
 *
 * Including the drafted chapters in the "whole book" baseline means a partially-drafted book always shows its
 * training chapter range: if you draft the latter two-thirds of a book and train on the complete first third, the
 * book is not fully used as training data, so its chapter range is shown.
 */
export function segmentTrainingBooks(
  bookNumbers: number[],
  selectedTargetTraining: VerboseScriptureRange,
  availableTargetTraining: VerboseScriptureRange,
  selectedDrafting: VerboseScriptureRange
): TrainingBookSegment[] {
  const segments: TrainingBookSegment[] = [];
  let pendingFullBooks: number[] = [];
  const flushFullBooks = (): void => {
    if (pendingFullBooks.length > 0) {
      segments.push({ kind: 'range', bookNumbers: pendingFullBooks });
      pendingFullBooks = [];
    }
  };

  for (const bookNumber of [...bookNumbers].sort((a, b) => a - b)) {
    const bookId = Canon.bookNumberToId(bookNumber);
    const selected = selectedTargetTraining.books.get(bookId);
    const available = availableTargetTraining.books.get(bookId) ?? EMPTY_CHAPTER_SET;
    const drafted = selectedDrafting.books.get(bookId) ?? EMPTY_CHAPTER_SET;
    const wholeBook = available.union(drafted);
    const isPartial = selected != null && wholeBook.difference(selected).count() > 0;
    if (isPartial) {
      flushFullBooks();
      segments.push({ kind: 'partial', bookId, chapterRange: formatChapterRange(selected!.toString()) });
    } else {
      pendingFullBooks.push(bookNumber);
    }
  }
  flushFullBooks();
  return segments;
}

/**
 * Localized, conjunction-joined training-book list for the summary table — e.g.
 * "Genesis, Exodus (1-10), and Leviticus". Full books collapse into ranges; partial books show their chapters.
 */
export function formatTrainingBooksSummary(
  bookNumbers: number[],
  selectedTargetTraining: VerboseScriptureRange,
  availableTargetTraining: VerboseScriptureRange,
  selectedDrafting: VerboseScriptureRange,
  i18n: I18nService
): string {
  const labels = segmentTrainingBooks(
    bookNumbers,
    selectedTargetTraining,
    availableTargetTraining,
    selectedDrafting
  ).map(segment =>
    segment.kind === 'range'
      ? i18n.formatAndLocalizeBookRange(segment.bookNumbers)
      : `${i18n.localizeBook(segment.bookId)} (${segment.chapterRange})`
  );
  return i18n.enumerateList(labels);
}
