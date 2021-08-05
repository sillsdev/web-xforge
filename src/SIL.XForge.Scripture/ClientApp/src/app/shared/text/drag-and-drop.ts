import Quill, { RangeStatic } from 'quill';
import { Delta } from 'rich-text';
import { TextComponent } from './text.component';

export interface DragAndDropOptions {
  textComponent: TextComponent;
}

/** Drag-and-drop module for Quill, for dropping only unformatted text into a usx-segment. Unit tests on the behaviour
 *  specification can be found in text.component.spec.ts.*/
export class DragAndDrop {
  /** Mostly arbitrary value to indicate that our quill is the source of the drag data. */
  static readonly quillIsSourceToken: string = 'x-dragstart-in-quill';

  constructor(quill: Quill, options: DragAndDropOptions) {
    quill.container.addEventListener('dragstart', (event: Event) => {
      const dragEvent = event as DragEvent;
      // Write a custom note on the event. This will only end up being done if the drag started from in quill. In this
      // way, we can differentiate between drag-and-drops that have their source as quill or from elsewhere, such as
      // elsewhere in the same web page window or from another window or application.
      dragEvent.dataTransfer?.setData(DragAndDrop.quillIsSourceToken, '');
    });

    quill.container.addEventListener('drop', (event: Event) => {
      const dragEvent = event as DragEvent;
      // Stop the browser from doing any drag-and-drop behaviour itself, such as inserting text with formatting.
      dragEvent.preventDefault();

      if ((dragEvent.target as Element)?.localName !== 'usx-segment') {
        // We need to be able to know where to insert the dropped text, such as from the drop target being a usx-segment
        // element.
        return;
      }
      if (dragEvent.dataTransfer == null) {
        console.warn(`Warning: DragEvent unexpectedly has null dataTransfer property.`);
        return;
      }

      // Determine where we should be placing the dropped text, using the location of the destination segment, and the
      // index within that segment.

      const destinationSegmentRef: string = (dragEvent.target as Element).attributes['data-segment'].value;
      const destinationSegmentRange: RangeStatic | undefined =
        options.textComponent.getSegmentRange(destinationSegmentRef);
      if (destinationSegmentRange == null) {
        console.warn('Warning: drag-and-drop destination segment had an undefined range.');
        return;
      }

      // Determine character index of drop location in destination segment, using a browser-specific method.
      let startPositionInSegment: number = 0;
      if (document.caretRangeFromPoint !== undefined) {
        // Chromium/Chrome, Edge, and Safari browsers
        const range: Range = document.caretRangeFromPoint(dragEvent.clientX, dragEvent.clientY);
        startPositionInSegment = range.startOffset;
      } else if (document.caretPositionFromPoint !== undefined) {
        // Firefox browser
        const range: CaretPosition | null = document.caretPositionFromPoint(dragEvent.clientX, dragEvent.clientY);
        if (range == null) {
          console.warn('Warning: drag-and-drop inferred a null caret position for insertion.');
          return;
        }
        startPositionInSegment = range.offset;
      } else {
        console.warn(`Warning: Could not determine insertion position for drag-and-drop.`);
        return;
      }

      const startingPositionInDocument: number = destinationSegmentRange.index + startPositionInSegment;

      const insertionDelta = new Delta();
      insertionDelta.retain(startingPositionInDocument);
      let newText: string = dragEvent.dataTransfer.getData('text/plain');
      // Omit newline characters
      newText = newText.replace(/(?:\r?\n)+/g, ' ');
      insertionDelta.insert(newText);
      quill.updateContents(insertionDelta, 'user');

      // Identify the selection range, if any, now that we updated the document with an insert. This will be a
      // selection that was already present before the drop, whether it is the text that was dragged, or a selection
      // not related to the drag.
      const originalSelection: RangeStatic | null = quill.getSelection();

      // Select the inserted text.
      quill.setSelection(startingPositionInDocument, newText.length);

      if (originalSelection != null) {
        // There was a selection before the drop occurred.
        const removalDelta = new Delta();
        removalDelta.retain(originalSelection.index);
        if (dragEvent.dataTransfer.types.includes(DragAndDrop.quillIsSourceToken) && !dragEvent.ctrlKey) {
          // If the drag was started from within quill, then treat the selection as the source data of the drag, and
          // delete the selection. Unless the user was holding the ctrl key to copy text instead of move it.
          removalDelta.delete(originalSelection.length);
          quill.updateContents(removalDelta, 'user');
        }
        // Or if the drag was not started from within quill, or the user was holding the ctrl key, then don't delete
        // the selection.
      }
    });
  }
}
