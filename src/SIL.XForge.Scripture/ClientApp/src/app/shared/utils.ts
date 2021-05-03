import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';

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

export function verseRefFromMouseEvent(event: MouseEvent, bookNum: number): VerseRef | undefined {
  let target = event.target;
  if (target == null) {
    return;
  }
  if (target['offsetParent']['nodeName'] === 'USX-SEGMENT') {
    target = target['offsetParent'] as EventTarget;
  }
  if (target['nodeName'] === 'USX-SEGMENT') {
    const clickSegment = target['attributes']['data-segment'].value;
    const segmentParts = clickSegment.split('_', 3);
    return new VerseRef(bookNum, segmentParts[1], segmentParts[2]);
  }
  return;
}
