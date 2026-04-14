import Quill, { Range } from 'quill';
import { StringMap } from 'rich-text';
import { TextComponent } from './text.component';

/**
 * "Select All" module for Quill, which converts browser menu
 * initiated "select all" requests to Quill selection-change events.
 */
export class SelectAll {
  constructor(quill: Quill, options: StringMap) {
    // Get the text component
    const textComponent: TextComponent = options.textComponent;

    // Tracks the last Quill selection to avoid repetition/looping
    let lastRange: Range | null = quill.getSelection();

    // Monitor the browser's selectionchange event from the document
    document.addEventListener('selectionchange', () => {
      // Ignore if the request is from another text box such as Add/Edit Answer, Biblical Terms, or Update Your Name
      const sel: Selection | null = document.getSelection();
      if (!sel || sel.rangeCount === 0 || !quill.root.contains(sel.getRangeAt(0).startContainer)) {
        lastRange = null;
        return;
      }

      // Only emit to Quill (and the onSelectionChanged handler in TextComponent) if the selection has actually changed
      const quillRange: Range = quill.getSelection(true);
      if (!lastRange || quillRange.index !== lastRange.index || quillRange.length !== lastRange.length) {
        quill.emitter.emit('selection-change', quillRange, lastRange, 'user');
        lastRange = quillRange;
      }
    });

    // Do not allow selection to move beyond the segment
    let updatingSelection = false;
    quill.on('selection-change', (range, _oldRange, _source) => {
      // Prevent infinite loops
      if (updatingSelection) return;

      // No range = lost focus
      if (!range) return; // lost focus

      // If there is no text selected, we do not need to modify the selection
      const text = quill.getText(range.index, range.length);
      if (text.length === 0) return;

      // If the selection is valid with in the segment, we do not need to modify it
      if (textComponent.isValidSelectionForCurrentSegment(range)) return;

      updatingSelection = true;

      // Do not allow selecting further than the current segment
      const length =
        (textComponent.segment?.range.index ?? 0) + (textComponent.segment?.range.length ?? 0) - range.index;
      quill.setSelection(range.index, length, 'silent');

      updatingSelection = false;
    });
  }
}
