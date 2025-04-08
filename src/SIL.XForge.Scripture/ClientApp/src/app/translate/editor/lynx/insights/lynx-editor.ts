import { Injectable } from '@angular/core';
import Quill, { Delta, EmitterSource, Op } from 'quill';
import { QuillLynxEditorAdapter } from './quill-services/quill-lynx-editor-adapter';

export type LynxableEditor = Quill; // Add future editor as union type

export interface LynxEditor {
  getEditor(): LynxableEditor;
  insertText(index: number, text: string, formats?: any): void;
  deleteText(index: number, length: number): void;
  getLength(): number;
  formatText(index: number, length: number, formats: any): void;
  setContents(delta: any, source: EmitterSource): void;
  setSelection(index: number, length: number, source: EmitterSource): void;
  getScrollingContainer(): Element;
  getBounds(index: number, length: number): any;
  updateContents(delta: Delta | Op[]): void;
  focus(): void;
  getRoot(): HTMLElement;
}

@Injectable({ providedIn: 'root' })
export class LynxEditorAdapterFactory {
  getAdapter(editor: LynxableEditor): LynxEditor {
    if (editor instanceof Quill) {
      return new QuillLynxEditorAdapter(editor);
    }
    throw new Error('Unsupported editor type');
  }
}

@Injectable({ providedIn: 'root' })
export class TestLynxEditorAdapterFactory extends LynxEditorAdapterFactory {
  getAdapter(mockEditor: any): LynxEditor {
    return mockEditor;
  }
}
