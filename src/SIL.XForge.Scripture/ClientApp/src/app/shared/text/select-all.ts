import { DestroyRef } from '@angular/core';
import Quill, { Range } from 'quill';
import { StringMap } from 'rich-text';
import { fromEvent } from 'rxjs';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';

/**
 * "Select All" module for Quill, which converts browser menu
 * initiated "select all" requests to Quill selection-change events.
 */
export class SelectAll {
  constructor(quill: Quill, options: StringMap) {
    const destroyRef: DestroyRef = options.destroyRef;

    // Tracks the last Quill selection to avoid repetition/looping
    let lastRange: Range | null = quill.getSelection();

    // Monitor the browser's selectionchange event from the document
    fromEvent<Event>(document, 'selectionchange')
      .pipe(quietTakeUntilDestroyed(destroyRef))
      .subscribe(() => {
        // Ignore if the request is from another text box such as Add/Edit Answer, Biblical Terms, or Update Your Name;
        // Or if it is from a readonly editor
        const sel: Selection | null = document.getSelection();
        if (
          !sel ||
          sel.rangeCount === 0 ||
          !quill.root.contains(sel.getRangeAt(0).startContainer) ||
          !quill.isEnabled()
        ) {
          lastRange = null;
          return;
        }

        // Only emit to Quill (and the onSelectionChanged handler in TextComponent) if the selection has actually changed.
        // Do not pass focus=true: Quill's focus() scrolls to its last known range, which is stale while the mouse button
        // is down, so clicking a verse would scroll the editor back to the previously selected segment.
        const quillRange: Range | null = quill.getSelection();
        if (quillRange == null) return;
        if (lastRange == null || quillRange.index !== lastRange.index || quillRange.length !== lastRange.length) {
          quill.emitter.emit('selection-change', quillRange, lastRange, 'user');
          lastRange = quillRange;
        }
      });
  }
}
