import Quill, { RangeStatic } from 'quill';
import { TextComponent } from './text.component';

export interface DragAndDropOptions {
  textComponent: TextComponent;
}

/** Drag-and-drop module for Quill, for dropping only unformatted text into a usx-segment. Unit tests on the behaviour
 *  specification can be found in text.component.spec.ts.*/
export class DragAndDrop {
  /** Mostly arbitrary value to indicate that our quill is the origin of the drag data. */
  static readonly quillIsSourceToken: string = 'x-dragstart-in-quill';

  constructor(quill: Quill, options: DragAndDropOptions) {
    quill.container.addEventListener('dragstart', (event: Event) => {
      const dragEvent = event as DragEvent;
      // Write a custom note on the event. This will only end up being done if the drag started from in quill. In this
      // way, we can differentiate between drag-and-drops that have their origin as quill or from elsewhere, such as
      // elsewhere in the same web page window or from another window or application.
      dragEvent.dataTransfer?.setData(DragAndDrop.quillIsSourceToken, '');
    });

    quill.container.addEventListener('drop', (event: Event) => {
      const dragEvent = event as DragEvent;
      // Stop the browser from doing any drag-and-drop behaviour itself, such as inserting text with formatting.
      dragEvent.preventDefault();

      const [targetUsxSegmentElement, droppingIntoBlankSegment]: [Element | null, boolean] =
        this.discernTarget(dragEvent);
      if (targetUsxSegmentElement == null) {
        return;
      }

      if (dragEvent.dataTransfer == null) {
        console.warn(`Warning: DragEvent unexpectedly has null dataTransfer property.`);
        return;
      }

      // Determine where we should be placing the dropped text, using the location of the destination segment, and the
      // index within that segment.

      const dataSegmentAttribute: any = targetUsxSegmentElement.attributes['data-segment'];
      if (dataSegmentAttribute == null) {
        console.warn(
          'Warning: drag-and-drop to usx segment element with no segment ref attribute:',
          targetUsxSegmentElement
        );
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

      const insPosInSegment: number | undefined = this.getInsertionPositionInSegment(
        targetUsxSegmentElement,
        dragEvent.clientX,
        dragEvent.clientY
      );
      if (insPosInSegment == null) {
        return;
      }
      let insertionPositionInDocument: number = destinationSegmentRange.index + insPosInSegment;

      // Identify the selection range, if any. This will be a
      // selection that was already present before the drop, whether it is the text that was dragged, or a selection
      // not related to the drag.
      const originalSelection: RangeStatic | null = quill.getSelection();

      let newText: string = dragEvent.dataTransfer.getData('text/plain');
      // Replace newlines with a space.
      newText = newText.replace(/(?:\r?\n)+/g, ' ');

      let quillIsSource: boolean = dragEvent.dataTransfer.types.includes(DragAndDrop.quillIsSourceToken);
      let userIsHoldingCtrlKey: boolean = dragEvent.ctrlKey;
      if (originalSelection != null) {
        // There was a selection before the drop occurred.
        if (quillIsSource && !userIsHoldingCtrlKey) {
          // If the drag was started from within quill, then treat the selection as the origin data of the drag, and
          // delete the selection. Unless the user was holding the ctrl key to copy text instead of move it.
          quill.deleteText(originalSelection.index, originalSelection.length, 'user');
          // Adjust insertion position accordingly if preceding text was just deleted
          if (insertionPositionInDocument > originalSelection.index) {
            insertionPositionInDocument -= originalSelection.length;
          }
        }
        // Or if the drag was not started from within quill, or the user was holding the ctrl key, then don't delete
        // the selection.
      }

      // Behave like a user, to help editor event processing, by cutting the origin text first (if applicable),
      // putting the insertion point in at the target, and then inserting. Give an opportunity between each of these
      // for EditorComponent.onTargetUpdated() to run, so that thread anchors are updated even in an origin verse that
      // is dragged out of. Use of setTimeout() allows TextComponent.updated to emit and be received by subscribers
      // before we take further action here. Therefore, TextComponent.updated events are interleaved with our calls to
      // quill.

      setTimeout(() => {
        quill.setSelection(insertionPositionInDocument, 0);
        setTimeout(() => {
          quill.insertText(insertionPositionInDocument, newText, 'user');
          setTimeout(() => {
            // If we inserted into a blank segment, and let SF respond by removing the blank in between our quill
            // changes, then the position needs to move back by 1 to select the inserted text.
            const lengthOfBlank: number = 1;
            if (droppingIntoBlankSegment) {
              insertionPositionInDocument -= lengthOfBlank;
            }
            // Select the inserted text.
            quill.setSelection(insertionPositionInDocument, newText.length);
          }, 1);
        }, 1);
      }, 1);
    });
  }

  /** Return the usx-segment element that the user is trying to drop into (if possible), and whether the actual
   * target element being dropped into is a usx-blank. The actual element being dropped into may be
   * something other than a usx-segment, such as a display-text-anchor, in which case the usx segment element returned
   * will be the one containing the element or node being dropped into. */
  private discernTarget(dragEvent: DragEvent): [Element | null, boolean] {
    const targetElement: Element | null = dragEvent.target as Element | null;
    let droppingIntoBlankSegment: boolean = false;
    let targetUsxSegmentElement: Element | null = null;

    if (targetElement == null) {
      console.warn(`Warning: DragEvent unexpectedly has null target.`);
      return [targetUsxSegmentElement, droppingIntoBlankSegment];
    }
    let targetElementName: string = targetElement.localName;

    if (targetElementName === 'usx-segment') {
      targetUsxSegmentElement = targetElement;
      return [targetUsxSegmentElement, droppingIntoBlankSegment];
    }

    if (targetElementName === 'usx-blank') {
      droppingIntoBlankSegment = true;
    }

    let element: Element = targetElement;
    while (element.localName != 'usx-segment' && element.parentElement != null) {
      element = element.parentElement;
    }
    if (element == null || element.localName != 'usx-segment') {
      console.warn('Warning: DragEvent never found a needed usx-segment ancestor for drop target:', targetElement);
      return [null, droppingIntoBlankSegment];
    }
    targetUsxSegmentElement = element;
    return [targetUsxSegmentElement, droppingIntoBlankSegment];
  }

  /** Return the editor position in the segment where we want to insert text from a drop. */
  private getInsertionPositionInSegment(
    targetUsxSegmentElement: Element,
    targetX: number,
    targetY: number
  ): number | undefined {
    // Determine character index of drop location in destination segment, using a browser-specific method.

    let startPositionInTargetNode: number = 0;
    let nodeDroppedInto: Node | undefined;
    if (document.caretRangeFromPoint !== undefined) {
      // Chromium/Chrome, Edge, and Safari browsers
      const range: Range = document.caretRangeFromPoint(targetX, targetY);
      startPositionInTargetNode = range.startOffset;
      nodeDroppedInto = range.startContainer;
    } else if (document.caretPositionFromPoint !== undefined) {
      // Firefox browser
      const range: CaretPosition | null = document.caretPositionFromPoint(targetX, targetY);
      if (range == null) {
        console.warn('Warning: drag-and-drop inferred a null caret position for insertion');
        return;
      }
      startPositionInTargetNode = range.offset;
      nodeDroppedInto = range.offsetNode;
    } else {
      console.warn(`Warning: Could not determine insertion position for drag-and-drop.`);
      return;
    }
    if (nodeDroppedInto == null) {
      console.warn('Warning: Could not get the node that the text was dropped into.');
      return;
    }

    if (nodeDroppedInto.nodeName.toLowerCase() === 'usx-blank') {
      // If we are dropping onto a usx-blank, specify position 1 to mean the end of the usx-blank element, rather
      // than using a browser-determined index into the usx-blank.
      startPositionInTargetNode = 1;
    }

    const startPositionInSegment: number = this.determineEditorLengthOfNodesUpToPosition(
      targetUsxSegmentElement,
      nodeDroppedInto,
      startPositionInTargetNode
    );
    return startPositionInSegment;
  }

  /** Determine the editor length for `targetUsxSegmentElement`, up thru position `positionInTargetNode` in
   * `nodeDroppedInto`. */
  private determineEditorLengthOfNodesUpToPosition(
    targetUsxSegmentElement: Element,
    nodeDroppedInto: Node,
    positionInTargetNode: number
  ): number {
    return positionInTargetNode + this.determineLengthBeforeTerminationNode(targetUsxSegmentElement, nodeDroppedInto);
  }

  /**
   * Determine the editor length for `node` up until a contained `terminationChildNode`. Length is
   * determined from text nodes and some elements.
   */
  private determineLengthBeforeTerminationNode(node: Node, terminationChildNode: Node): number {
    // Using preorder traversal and stops traversing when the terminationNode is reached.
    if (node === terminationChildNode) {
      return 0;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue == null) {
        // Based on the API docs, text nodes should not have a null value. So this should never happen.
        return 0;
      }
      return node.nodeValue.length;
      // Text nodes will not have children to further process.
    }

    const elementsToLookInside: string[] = ['usx-segment', 'display-text-anchor', 'usx-char'];
    if (elementsToLookInside.includes(node.nodeName.toLowerCase())) {
      let lengthOfDescendants: number = 0;
      for (let i = 0; i < node.childNodes.length; i++) {
        let childNode: Node = node.childNodes[i];
        lengthOfDescendants += this.determineLengthBeforeTerminationNode(childNode, terminationChildNode);
        if (childNode.contains(terminationChildNode)) {
          break;
        }
      }
      return lengthOfDescendants;
    }

    const lengthOfAnythingElse = 1;
    const elementsKnownToBeLengthOne: string[] = ['display-note', 'usx-figure', 'usx-note'];
    if (!elementsKnownToBeLengthOne.includes(node.nodeName.toLowerCase())) {
      // Also return 1 for anything else. But note it in the console until it too is incorporated.
      console.warn(`Warning: Drag-and-drop is assuming length 1 for node ${node.nodeName.toLowerCase()}`);
    }
    return lengthOfAnythingElse;
  }
}
