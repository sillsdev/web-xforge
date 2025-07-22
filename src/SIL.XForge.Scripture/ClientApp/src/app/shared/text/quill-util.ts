import Quill, { Range } from 'quill';
import { DeltaOperation, StringMap } from 'rich-text';

/**
 * Gets the attributes at the given position in the editor.
 * @param editor The Quill editor.
 * @param editorPosition The position in the editor.
 * @returns A map of attributes at the given position.
 */
export function getAttributesAtPosition(editor: Quill, editorPosition: number): StringMap {
  // The format of the insertion point may only contain the block level formatting,
  // the format classes and other information we get from the character following the insertion point
  const insertionFormat: StringMap = editor.getFormat(editorPosition);
  const characterFormat: StringMap = editor.getFormat(editorPosition, 1);

  if (characterFormat['segment'] != null) {
    for (const key of Object.keys(characterFormat)) {
      // we ignore text anchor formatting because we cannot depend on the character format to tell us if it is needed
      if (key !== 'text-anchor') {
        insertionFormat[key] = characterFormat[key];
      }
    }
  }

  return insertionFormat;
}

/**
 * Gets the retain count from the given Delta operation.
 * @param op The delta op.
 * @returns The retain count if the op is a 'retain' operation, otherwise undefined.
 * @throws Error if the 'retain' operation is invalid.
 */
export function getRetainCount(op: DeltaOperation): number | undefined {
  if (op?.retain != null) {
    if (typeof op.retain === 'number') {
      return op.retain;
    }

    // The type definition allows it, but we shouldn't encounter an object 'retain'
    throw new Error(`Invalid 'retain' operation`);
  }

  return undefined;
}

/**
 * Compares two objects with a range based on their range index and length,
 * with the most recent first (shortest range if  tied).
 * @returns {number} negative if a is more recent, positive if b is more recent, 0 if they are the same
 */
export function rangeComparer(a: { range: Range }, b: { range: Range }): number {
  const indexDifference = a.range.index - b.range.index;

  if (indexDifference !== 0) {
    return indexDifference;
  }

  return a.range.length - b.range.length;
}
