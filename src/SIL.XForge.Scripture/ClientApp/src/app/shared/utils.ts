import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { DeltaOperation } from 'rich-text';
import { SelectableProject } from '../core/paratext.service';

// Regular expression for getting the verse from a segment ref
export const VERSE_FROM_SEGMENT_REF_REGEX = /verse_\d+_(\d+-?\d*)/;
// Regular expression for the verse segment ref of scripture content
export const VERSE_REGEX = /verse_[0-9]+_[0-9]+/;

export function combineVerseRefStrs(startStr?: string, endStr?: string): VerseRef | undefined {
  if (!startStr) {
    // no start ref
    return undefined;
  }

  const start = VerseRef.tryParse(startStr);
  if (!start.success) {
    // invalid start ref
    return undefined;
  }

  if (!endStr) {
    // no end ref
    return start.verseRef;
  }

  const end = VerseRef.tryParse(endStr);
  if (!end.success || start.verseRef.BBBCCC !== end.verseRef.BBBCCC) {
    // invalid end ref
    return undefined;
  }

  if (start.verseRef.equals(end.verseRef)) {
    // start and end refs are the same
    return start.verseRef;
  }

  // range
  const rangeStr = `${startStr}-${end.verseRef.verse}`;
  const range = VerseRef.tryParse(rangeStr);
  if (!range.success) {
    return undefined;
  }
  return range.verseRef;
}

/**
 * Returns the base verse of the segment ref. e.g. 'verse_1_5'
 * @return The segment ref of the first segment in the verse, or undefined if the segment does not belong to a verse.
 */
export function getBaseVerse(segmentRef: string): string | undefined {
  const matchArray: RegExpExecArray | null = VERSE_REGEX.exec(segmentRef);
  return matchArray == null ? undefined : matchArray[0];
}

export function getVerseRefFromSegmentRef(bookNum: number, segmentRef: string): VerseRef | undefined {
  const baseRef: string | undefined = getBaseVerse(segmentRef);
  if (baseRef == null) {
    return;
  }
  const parts = baseRef.split('_');
  return new VerseRef(bookNum, parts[1], parts[2]);
}

export function verseSlug(verse: VerseRef) {
  return 'verse_' + verse.chapterNum + '_' + (verse.verse == null ? verse.verseNum : verse.verse);
}

export function verseRefFromMouseEvent(event: MouseEvent, bookNum: number): VerseRef | undefined {
  const clickSegment = attributeFromMouseEvent(event, 'USX-SEGMENT', 'data-segment');
  if (clickSegment == null) {
    return;
  }
  const segmentParts = clickSegment.split('_', 3);
  return new VerseRef(bookNum, segmentParts[1], segmentParts[2]);
}

export function threadIdFromMouseEvent(event: MouseEvent): string | undefined {
  return attributeFromMouseEvent(event, 'DISPLAY-NOTE', 'data-thread-id');
}

export function attributeFromMouseEvent(event: MouseEvent, nodeName: string, attribute: string): string | undefined {
  // Target is actually a EventTarget but if we treat it as any then we can improve null checks
  let target = event.target as any;
  if (target == null) {
    return;
  }
  if (target?.offsetParent?.nodeName === nodeName) {
    target = target.offsetParent;
  }
  if (target?.parentNode?.nodeName === nodeName) {
    target = target.parentNode;
  }
  if (target?.nodeName === nodeName) {
    return target?.attributes[attribute].value;
  }
  return;
}

export function projectLabel(project: SelectableProject | undefined): string {
  if (project == null || (!project.shortName && !project.name)) {
    return '';
  }

  if (!project.shortName) {
    return project.name;
  }
  if (!project.name) {
    return project.shortName;
  }
  return project.shortName + ' - ' + project.name;
}

/**
 * Checks whether a text doc's ops are corrupted. If this function returns false that does not mean the ops are
 * definitely not corrupted, only that they have passed a basic check. It's essentially a linter that runs through
 * several rules to see if any of them are violated.
 * @param ops An array of ops to check.
 */
export function isBadDelta(ops: DeltaOperation[]): boolean {
  const chapterInsertsCount = ops.filter(op => op.insert?.chapter != null).length;
  const containsBadOp = ops.some(
    op =>
      // insert must be defined for any op, and can't be nullish
      op.insert == null ||
      // insert needs to be a string, or an object
      ['object', 'string'].includes(typeof op.insert) === false ||
      // insert.verse, if it exists, should be an object, not a boolean like we've seen in the past
      (typeof op.insert === 'object' &&
        'verse' in op.insert &&
        (op.insert.verse == null || typeof op.insert.verse !== 'object')) ||
      // the segment identifier should not have null or undefined in it, like we've seen in the past
      (typeof op.attributes?.segment === 'string' && /(?:undefined|null)/.test(op.attributes.segment))
  );
  return chapterInsertsCount > 1 || containsBadOp;
}

export function compareProjectsForSorting(a: { shortName: string }, b: { shortName: string }): 1 | -1 {
  return a.shortName.toLowerCase() < b.shortName.toLowerCase() ? -1 : 1;
}

export function formatFontSizeToRems(fontSize: number | undefined): string | undefined {
  // Paratext allows a font size between 8 and 32. 12pt font is equivalent to 1rem
  return fontSize == null ? undefined : `${fontSize / 12}rem`;
}
