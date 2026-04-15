import { DestroyRef } from '@angular/core';
import Quill, { Range } from 'quill';
import { StringMap } from 'rich-text';
import { fromEvent } from 'rxjs';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { TextComponent } from './text.component';

/**
 * "Select All" module for Quill, which converts browser menu
 * initiated "select all" requests to Quill selection-change events.
 */
export class SelectAll {
  constructor(quill: Quill, options: StringMap) {
    // Get the text component
    const textComponent: TextComponent = options.textComponent;
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

        // Only emit to Quill (and the onSelectionChanged handler in TextComponent) if the selection has actually changed
        const quillRange: Range = quill.getSelection(true);
        if (quillRange == null) return;
        if (lastRange == null || quillRange.index !== lastRange.index || quillRange.length !== lastRange.length) {
          quill.emitter.emit('selection-change', quillRange, lastRange, 'user');
          lastRange = quillRange;
        }
      });

    // Do not allow selection to move beyond the segment
    let updatingSelection = false;
    quill.on('selection-change', (range, _oldRange, _source) => {
      // Prevent infinite loops
      if (updatingSelection) return;

      // No range or segment = lost focus
      if (!range) return; // lost focus
      if (textComponent.segment == null) return;

      // If there is no text selected, we do not need to modify the selection
      const text: string = quill.getText(range.index, range.length);
      if (text.length === 0) return;

      // If the selection is valid with in the segment, we do not need to modify it
      if (textComponent.isValidSelectionForCurrentSegment(range)) return;

      // Do not allow selecting before or further than the current segment
      const newRange: Range | null = textComponent.conformToValidSelectionForCurrentSegment(range);
      if (newRange == null) return;

      updatingSelection = true;
      quill.setSelection(newRange.index, newRange.length, 'silent');
      updatingSelection = false;
    });
  }
}
