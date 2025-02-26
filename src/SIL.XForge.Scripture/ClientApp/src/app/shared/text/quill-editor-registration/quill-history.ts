import { cloneDeep } from 'lodash-es';
import { Scope } from 'parchment';
import Quill, { Delta, Range } from 'quill';
import QuillScrollBlot from 'quill/blots/scroll';
import QuillHistory, { StackItem } from 'quill/modules/history';
import { DeltaOperation } from 'rich-text';
import { getRetainCount } from '../quill-util';

type HistoryStackType = 'undo' | 'redo';

export class FixSelectionHistory extends QuillHistory {
  /**
   * Performs undo/redo. Override this method so that we can fix the selection logic. This method was copied from
   * the Quill history module.
   *
   * @param {HistoryStackType} source The source stack type.
   * @param {HistoryStackType} dest The destination stack type.
   */
  change(source: HistoryStackType, dest: HistoryStackType): void {
    if (this.stack[source].length === 0) {
      return;
    }
    const stackItem: StackItem = this.stack[source].pop()!;
    if (stackItem == null) {
      return;
    }
    const base = this.quill.getContents();
    const inverseDelta = stackItem.delta.invert(base);
    this.stack[dest].push({
      delta: inverseDelta,
      range: transformRange(stackItem.range, inverseDelta)
    });
    this.lastRecorded = 0;
    this.ignoreChange = true;
    // during undo/redo, segments can be incorrectly highlighted, so explicitly remove incorrect highlighting
    this.quill.updateContents(removeObsoleteSegmentAttrs(stackItem.delta), Quill.sources.USER);
    this.ignoreChange = false;
    const index = getLastChangeIndex(this.quill.scroll, stackItem.delta);
    this.quill.setSelection(index);
  }
}

/**
 * Transforms a range based on a delta. This function was copied from the Quill history module.
 */
export function transformRange(range: Range | null, delta: Delta): Range | null {
  if (!range) {
    return range;
  }

  const start: number = delta.transformPosition(range.index);
  const end: number = delta.transformPosition(range.index + range.length);

  return {
    index: start,
    length: end - start
  };
}

/**
 * Updates delta to remove segment highlights from segments that are not explicitly highlighted
 * and strips away formatting from embeds, excluding blanks.
 */
export function removeObsoleteSegmentAttrs(delta: Delta): Delta {
  const updatedDelta = new Delta();
  if (delta.ops != null) {
    for (const op of delta.ops) {
      const modelOp: DeltaOperation = cloneDeep(op);
      const attrs = modelOp.attributes;
      if (attrs != null && attrs['segment'] != null) {
        if (attrs['highlight-segment'] == null) {
          attrs['highlight-segment'] = false;
        }
        if (attrs['commenter-selection'] != null) {
          // if this delta is applied to a verse that is not the current selection, this attribute
          // should be null so when the selection changes, the verse will be correctly selected
          attrs['commenter-selection'] = null;
        }
      }
      if (typeof modelOp.insert === 'object') {
        // clear the formatting attributes on embeds to prevent dom elements from being corrupted,
        // excluding blanks, since empty segments do not have texts with formatting to reference
        if (modelOp.insert.blank == null) {
          modelOp.attributes = undefined;
        }
      }
      (updatedDelta as any).push(modelOp);
    }
  }
  return updatedDelta.chop();
}

/**
 * Finds the index where the last insert/delete occurs in the delta. This function has been modified from the
 * original in the Quill history module.  Trailing inserted embeds ops are not counted when determining the last edit.
 *
 * @param {QuillScrollBlot} scroll The Quill scroll.
 * @param {Delta} delta The undo/redo delta.
 * @returns {number} The index where the last insert/delete occurs.
 */
export function getLastChangeIndex(scroll: QuillScrollBlot, delta: Delta): number {
  if (delta.ops == null) {
    return 0;
  }
  // Skip trailing inserted embed ops when determining last edit
  let changeIndex = 0;
  let curIndex = 0;
  for (const op of delta.ops) {
    if (op.insert != null) {
      if (typeof op.insert === 'string') {
        curIndex += op.insert.length;
        changeIndex = curIndex;
      } else {
        curIndex++; // Won't be assigned to 'changeIndex' if it is a trailing embed op
      }
    } else if (op.retain != null) {
      const retainCount: number = getRetainCount(op)!;
      curIndex += retainCount;
      changeIndex = curIndex;
    }
  }
  if (endsWithNewlineChange(scroll, delta)) {
    changeIndex -= 1;
  }
  return changeIndex;
}

/**
 * Checks if the delta ends with a newline insert. This function was copied from the Quill history module.
 */
export function endsWithNewlineChange(scroll: QuillScrollBlot, delta: Delta): boolean {
  const lastOp = delta.ops?.[delta.ops.length - 1];
  if (lastOp == null) {
    return false;
  }
  if (lastOp.insert != null) {
    return typeof lastOp.insert === 'string' && lastOp.insert.endsWith('\n');
  }
  if (lastOp.attributes != null) {
    return Object.keys(lastOp.attributes).some(attr => {
      return scroll.query(attr, Scope.BLOCK) != null;
    });
  }
  return false;
}
