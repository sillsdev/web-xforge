import Quill, { RangeStatic } from 'quill';
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

      let targetElement: Element | null = dragEvent.target as Element | null;
      if (targetElement == null) {
        console.warn(`Warning: DragEvent unexpectedly has null target.`);
        return;
      }
      let targetElementName: string = targetElement.localName;

      let droppingInBlankSegment: boolean = false;
      if (targetElementName === 'usx-blank') {
        droppingInBlankSegment = true;
        targetElement = targetElement.parentElement as Element | null;
        if (targetElement == null) {
          console.warn(`Warning: DragEvent usx-blank target parent is unexpectedly null. Target:`, targetElement);
          return;
        }
        targetElementName = targetElement.localName;
      }

      if (targetElementName !== 'usx-segment') {
        // We need to be able to know where to insert the dropped text, such as from the drop target being a usx-segment
        // element. Give up.
        console.warn('Warning: DragEvent to invalid target:', targetElement);
        return;
      }
      if (dragEvent.dataTransfer == null) {
        console.warn(`Warning: DragEvent unexpectedly has null dataTransfer property.`);
        return;
      }

      // Determine where we should be placing the dropped text, using the location of the destination segment, and the
      // index within that segment.

      const dataSegmentAttribute: any = targetElement.attributes['data-segment'];
      if (dataSegmentAttribute == null) {
        console.warn('Warning: drag-and-drop to target with no segment ref attribute:', targetElement);
        return;
      }
      const destinationSegmentRef: string = dataSegmentAttribute.value;
      const destinationSegmentRange: RangeStatic | undefined =
        options.textComponent.getSegmentRange(destinationSegmentRef);
      if (destinationSegmentRange == null) {
        console.warn(
          'Warning: No defined range for drag-and-drop destination segment. Invalid segment specification? Destination segment ref:',
          destinationSegmentRef
        );

        return;
      }

      // Determine character index of drop location in destination segment, using a browser-specific method.
      let startPositionInSegment: number = 0;
      let startPositionInTextNode: number = 0;
      let nodeDroppedInto: Node | undefined;
      if (droppingInBlankSegment) {
        // If we are dropping into an empty segment, use the position at the end of the segment rather than using a
        // browser-determined index into the segment.
        // Use the position at the end of the segment, rather than at the beginning, so that it is after the blank and
        // any other embeds.
        startPositionInSegment = destinationSegmentRange.length;
      } else if (document.caretRangeFromPoint !== undefined) {
        // Chromium/Chrome, Edge, and Safari browsers
        const range: Range = document.caretRangeFromPoint(dragEvent.clientX, dragEvent.clientY);
        startPositionInTextNode = range.startOffset;
        nodeDroppedInto = range.startContainer;
      } else if (document.caretPositionFromPoint !== undefined) {
        // Firefox browser
        const range: CaretPosition | null = document.caretPositionFromPoint(dragEvent.clientX, dragEvent.clientY);
        if (range == null) {
          console.warn('Warning: drag-and-drop inferred a null caret position for insertion. Target:', targetElement);
          return;
        }
        startPositionInTextNode = range.offset;
        nodeDroppedInto = range.offsetNode;
      } else {
        console.warn(`Warning: Could not determine insertion position for drag-and-drop. Target:`, targetElement);
        return;
      }

      if (!droppingInBlankSegment) {
        if (nodeDroppedInto == null) {
          console.warn('Warning: Could not get the node that the text was dropped into.');
          return;
        }

        let node: Node = nodeDroppedInto;
        const textNodeType = 3;
        // Add up the length of text and embeds that are previous nodes in the usx-segment
        while (node.previousSibling != null) {
          node = node.previousSibling;
          if (node.nodeType === textNodeType && node.nodeValue != null) {
            startPositionInSegment += node.nodeValue.length;
          } else if (node.nodeType !== textNodeType) {
            startPositionInSegment++;
          }
        }
        startPositionInSegment += startPositionInTextNode;
      }

      const insertionPositionInDocument: number = destinationSegmentRange.index + startPositionInSegment;
      let newText: string = dragEvent.dataTransfer.getData('text/plain');
      // Replace newlines with a space.
      newText = newText.replace(/(?:\r?\n)+/g, ' ');
      quill.insertText(insertionPositionInDocument, newText, 'user');

      // Identify the selection range, if any, now that we updated the document with an insert. This will be a
      // selection that was already present before the drop, whether it is the text that was dragged, or a selection
      // not related to the drag.
      const originalSelection: RangeStatic | null = quill.getSelection();

      // Select the inserted text.
      quill.setSelection(insertionPositionInDocument, newText.length);

      if (originalSelection != null) {
        // There was a selection before the drop occurred.
        if (dragEvent.dataTransfer.types.includes(DragAndDrop.quillIsSourceToken) && !dragEvent.ctrlKey) {
          // If the drag was started from within quill, then treat the selection as the source data of the drag, and
          // delete the selection. Unless the user was holding the ctrl key to copy text instead of move it.
          quill.deleteText(originalSelection.index, originalSelection.length, 'user');
        }
        // Or if the drag was not started from within quill, or the user was holding the ctrl key, then don't delete
        // the selection.
      }
    });
  }
}
