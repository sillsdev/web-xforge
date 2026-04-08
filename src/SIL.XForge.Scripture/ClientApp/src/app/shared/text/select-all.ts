import Quill, { Range } from 'quill';

/**
 * "Select All" module for Quill, which converts browser menu
 * initiated "select all" requests to Quill selection-change events.
 */
export class SelectAll {
  constructor(quill: Quill) {
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
  }
}
