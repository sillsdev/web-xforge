import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { SelectableProject } from '../core/paratext.service';

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

export type ProjectLabelFn = (project: SelectableProject) => string;
export function projectLabel(project: SelectableProject): string {
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
