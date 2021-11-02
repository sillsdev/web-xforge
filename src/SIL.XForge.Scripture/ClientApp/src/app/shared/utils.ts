import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { SelectableProject } from '../core/paratext.service';

// Regular expression for getting the verse from a segment ref
export const VERSE_FROM_SEGMENT_REF_REGEX = /verse_[0-9]+_([0-9]+)[-/]*/;
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

export function verseSlug(verse: VerseRef) {
  if (verse.verse != null) {
    return 'verse_' + verse.chapterNum + '_' + verse.verse;
  }
  return 'verse_' + verse.chapterNum + '_' + verse.verseNum;
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

function attributeFromMouseEvent(event: MouseEvent, nodeName: string, attribute: string): string | undefined {
  let target = event.target;
  if (target == null) {
    return;
  }
  if (target['offsetParent']['nodeName'] === nodeName) {
    target = target['offsetParent'] as EventTarget;
  }
  if (target['nodeName'] === nodeName) {
    return target['attributes'][attribute].value;
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
