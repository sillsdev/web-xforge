import Quill, { Delta, EmitterSource } from 'quill';
import { DeltaOperation } from 'rich-text';
import { LynxEditor } from '../lynx-editor';

export class QuillLynxEditorAdapter implements LynxEditor {
  private editor: Quill;

  constructor(editor: Quill) {
    this.editor = editor;
  }

  getEditor(): Quill {
    return this.editor;
  }

  insertText(index: number, text: string, formats: Record<string, unknown>, source: EmitterSource): void {
    this.editor.insertText(index, text, formats, source);
  }

  deleteText(index: number, length: number, source: EmitterSource): void {
    this.editor.deleteText(index, length, source);
  }

  getLength(): number {
    return this.editor.getLength();
  }

  formatText(index: number, length: number, formats: Record<string, unknown>, source: EmitterSource): void {
    this.editor.formatText(index, length, formats, source);
  }

  setContents(delta: any, source: EmitterSource): void {
    this.editor.setContents(delta, source);
  }

  setSelection(index: number, length: number, source: EmitterSource): void {
    this.editor.setSelection(index, length, source);
  }

  getScrollingContainer(): Element {
    return this.editor.root; // TODO: is there a way to get scrolling container in Quill v2?
  }

  getBounds(index: number, length: number): any {
    return this.editor.getBounds(index, length);
  }

  updateContents(delta: Delta | DeltaOperation[], source: EmitterSource): void {
    this.editor.updateContents(delta, source);
  }

  focus(): void {
    this.editor.focus();
  }

  getRoot(): HTMLElement {
    return this.editor.root;
  }
}
