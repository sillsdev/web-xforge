import { Injectable } from '@angular/core';
import Quill from 'quill';
import { LynxableEditor, LynxEditor } from './lynx-editor';
import { QuillLynxEditorAdapter } from './quill-services/quill-lynx-editor-adapter';

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
