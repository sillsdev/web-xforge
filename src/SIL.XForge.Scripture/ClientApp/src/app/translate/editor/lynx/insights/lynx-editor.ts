import Quill, { EmitterSource } from 'quill';

export type LynxableEditor = Quill; // Add future editor as union type

export class LynxEditor {
  readonly editor: LynxableEditor;

  constructor(editor: LynxableEditor) {
    this.editor = editor;
  }

  insertText(index: number, text: string, formats?: any): void {
    switch (true) {
      case this.isQuill(this.editor):
        this.editor.insertText(index, text, formats);
        break;
      default:
        throw new Error('Unsupported editor type');
    }
  }

  deleteText(index: number, length: number): void {
    switch (true) {
      case this.isQuill(this.editor):
        this.editor.deleteText(index, length);
        break;
      default:
        throw new Error('Unsupported editor type');
    }
  }

  getLength(): number {
    switch (true) {
      case this.isQuill(this.editor):
        return this.editor.getLength();
      default:
        throw new Error('Unsupported editor type');
    }
  }

  formatText(index: number, length: number, formats: any): void {
    switch (true) {
      case this.isQuill(this.editor):
        this.editor.formatText(index, length, formats);
        break;
      default:
        throw new Error('Unsupported editor type');
    }
  }

  setContents(delta: any, source: EmitterSource): void {
    switch (true) {
      case this.isQuill(this.editor):
        this.editor.setContents(delta, source);
        break;
      default:
        throw new Error('Unsupported editor type');
    }
  }

  setSelection(index: number, length: number, source: EmitterSource): void {
    switch (true) {
      case this.isQuill(this.editor):
        this.editor.setSelection(index, length, source);
        break;
      default:
        throw new Error('Unsupported editor type');
    }
  }

  getScrollingContainer(): Element {
    switch (true) {
      case this.isQuill(this.editor):
        return this.editor.root; // TODO: is there a way to get scrolling container in Quill v2?
      default:
        throw new Error('Unsupported editor type');
    }
  }

  getBounds(index: number, length: number): any {
    switch (true) {
      case this.isQuill(this.editor):
        return this.editor.getBounds(index, length);
      default:
        throw new Error('Unsupported editor type');
    }
  }

  get root(): HTMLElement {
    switch (true) {
      case this.isQuill(this.editor):
        return this.editor.root;
      default:
        throw new Error('Unsupported editor type');
    }
  }

  private isQuill(editor: LynxableEditor): editor is Quill {
    return editor instanceof Quill;
  }
}
