import { Injectable } from '@angular/core';
import Quill, { Delta, Op, Range } from 'quill';
import { QuillLynxEditorAdapter } from './quill-services/quill-lynx-editor-adapter';

export type LynxableEditor = Quill; // Add future editor as union type

export interface LynxEditor {
  getEditor(): LynxableEditor;
  insertText(index: number, text: string, formats: any, source: any): void;
  deleteText(index: number, length: number, source: any): void;
  getLength(): number;
  formatText(index: number, length: number, formats: any, source: any): void;
  setContents(delta: any, source: any): void;
  setSelection(index: number, length: number, source: any): void;
  getScrollingContainer(): Element;
  getBounds(index: number, length: number): any;
  updateContents(delta: Delta | Op[], source: any): void;
  focus(): void;
  getRoot(): HTMLElement;
}

export interface LynxTextModelConverter {
  /**
   * Translates a range from the data model to the editor.
   * Useful when embeds that are present only in the editor model may affect
   * the insight ranges determined from the data model.
   * @param dataRange The range (index, length) in the data model.
   * @returns The corresponding range in the editor model, or the original range as a fallback.
   */
  dataRangeToEditorRange(dataRange: Range): Range;
  /**
   * Translates the data model delta to the editor model delta.
   * Useful when embeds that are present only in the editor model may affect
   * update ops from Lynx.
   * @param dataDelta The data model delta.
   * @returns The corresponding editor model delta.
   */
  dataDeltaToEditorDelta(dataDelta: Delta): Delta;
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
