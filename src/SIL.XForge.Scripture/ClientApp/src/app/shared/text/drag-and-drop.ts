import Quill from 'quill';

/** Drag-and-drop module for Quill, preventing drag-and-drop. Unit test(s) can be found in text.component.spec.ts.*/
export class DragAndDrop {
  constructor(quill: Quill) {
    quill.container.addEventListener('drop', (event: Event) => {
      const dragEvent = event as DragEvent;
      // Stop the browser from doing any drag-and-drop behaviour itself, such as inserting text with formatting.
      dragEvent.preventDefault();
    });
  }
}
