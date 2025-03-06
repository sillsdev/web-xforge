import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { Editorial, EditorOptions, EditorRef } from '@biblionexus-foundation/platform-editor';
import { Usj } from '@biblionexus-foundation/scripture-utilities';
import { createRef, RefObject, type ComponentProps } from 'react';
import { RenderReactDirective } from './render-react-directive.component';

@Component({
  selector: 'app-platform-editor',
  standalone: true,
  imports: [CommonModule, RenderReactDirective],
  template: `<div [appRenderReact]="editorial" [props]="editorProps"></div>`
})
export class PlatformEditorComponent {
  editorial = Editorial;
  editorRef: RefObject<EditorRef> = createRef<EditorRef>();
  editorProps: ComponentProps<typeof Editorial> = {
    options: {
      defaultUsj: '{}',
      isReadonly: true
    } as EditorOptions,
    ref: this.editorRef
  };

  setUsj(value?: Usj): void {
    this.editorRef.current?.setUsj(value ?? ({} as Usj));
  }
}
