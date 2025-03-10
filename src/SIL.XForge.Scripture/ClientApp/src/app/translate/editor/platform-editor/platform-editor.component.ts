import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Editorial, EditorOptions, EditorRef } from '@biblionexus-foundation/platform-editor';
import { Usj } from '@biblionexus-foundation/scripture-utilities';
import { createRef, RefObject, type ComponentProps } from 'react';
import { RenderReactDirective } from './render-react-directive.component';

@Component({
  selector: 'app-platform-editor',
  standalone: true,
  imports: [CommonModule, RenderReactDirective],
  styleUrls: ['./platform-editor.component.scss'],
  template: `<div [appRenderReact]="editorial" [props]="editorProps"></div>`
})
export class PlatformEditorComponent {
  private readonly _emptyUsj: Usj = { type: 'USJ', version: '3.1', content: [] };
  private _isReadOnly: boolean = false;
  private _isRightToLeft: boolean = false;

  @Input() set isReadOnly(value: boolean) {
    this._isReadOnly = value;
    this.updateEditorProps();
  }

  get isReadOnly(): boolean {
    return this._isReadOnly;
  }

  @Input() set isRightToLeft(value: boolean) {
    this._isRightToLeft = value;
    this.updateEditorProps();
  }

  get isRightToLeft(): boolean {
    return this._isRightToLeft;
  }

  editorial = Editorial;
  editorRef: RefObject<EditorRef> = createRef<EditorRef>();
  editorProps: ComponentProps<typeof Editorial> = this.createEditorProps();
  setUsj(value?: Usj): void {
    this.editorRef.current?.setUsj(value ?? this._emptyUsj);
  }

  private createEditorProps(): ComponentProps<typeof Editorial> {
    return {
      options: {
        defaultUsj: this._emptyUsj,
        isReadonly: this._isReadOnly,
        textDirection: this._isRightToLeft ? 'rtl' : 'ltr'
      } as EditorOptions,
      ref: this.editorRef
    };
  }

  private updateEditorProps(): void {
    this.editorProps = this.createEditorProps();
  }
}
