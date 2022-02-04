import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { DeltaOperation } from 'rich-text';
import { SelectableProject } from '../core/paratext.service';

// Regular expression for getting the verse from a segment ref
export const VERSE_FROM_SEGMENT_REF_REGEX = /verse_\d+_(\d+-?\d*)/;

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

export function verseSlug(verse: VerseRef): string {
  return 'verse_' + verse.chapterNum + '_' + (verse.verse == null ? verse.verseNum : verse.verse);
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
export function containsInvalidOp(ops: DeltaOperation[]): boolean {
  return ops.some(
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
}
