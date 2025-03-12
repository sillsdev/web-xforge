import { CommonModule } from '@angular/common';
import { Component, DestroyRef, Input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Editorial, EditorOptions, EditorRef } from '@biblionexus-foundation/platform-editor';
import { Usj } from '@biblionexus-foundation/scripture-utilities';
import json0OtDiff from 'json0-ot-diff';
import { createRef, RefObject, type ComponentProps } from 'react';
import { Subscription } from 'rxjs';
import { RealtimeService } from 'xforge-common/realtime.service';
import { TextDocId } from '../../../core/models/text-doc';
import { TextDocumentDoc } from '../../../core/models/text-document-doc';
import { RenderReactDirective } from './render-react-directive.component';

@Component({
  selector: 'app-platform-editor',
  standalone: true,
  imports: [CommonModule, RenderReactDirective],
  styleUrls: ['./platform-editor.component.scss'],
  template: `<div [appRenderReact]="editorial" [props]="editorProps" (rendered)="onReactRendered()"></div>`
})
export class PlatformEditorComponent {
  constructor(
    private readonly realtimeService: RealtimeService,
    private destroyRef: DestroyRef
  ) {
    this.editorRef = createRef<EditorRef>();
    this.editorProps = this.createEditorProps();
  }

  private readonly _emptyUsj: Usj = { type: 'USJ', version: '3.1', content: [] };
  private _id: TextDocId | undefined;
  private _isReadOnly: boolean = false;
  private _isRightToLeft: boolean = false;
  private _textDocument: TextDocumentDoc | undefined;
  private _textDocumentChanges: Subscription | undefined;

  editorial = Editorial;
  editorRef: RefObject<EditorRef>;
  editorProps: ComponentProps<typeof Editorial>;

  @Input() set id(value: TextDocId | undefined) {
    this._id = value;
    this.subscribeToTextDocument(value);
  }

  get id(): TextDocId | undefined {
    return this._id;
  }

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

  @Input() set usj(value: Usj | undefined) {
    this.editorRef.current?.setUsj(value ?? this._emptyUsj);
  }

  get usj(): Usj | undefined {
    return this.editorRef.current?.getUsj();
  }

  onReactRendered(): void {
    this.subscribeToTextDocument(this._id);
  }

  private createEditorProps(): ComponentProps<typeof Editorial> {
    return {
      options: {
        defaultUsj: this._emptyUsj,
        isReadonly: this._isReadOnly,
        textDirection: this._isRightToLeft ? 'rtl' : 'ltr'
      } as EditorOptions,
      ref: this.editorRef,
      onUsjChange: this.onUsjChange.bind(this)
    };
  }

  private async onUsjChange(usj: Usj): Promise<void> {
    if (this._textDocument != null) {
      // Build the ops from a diff
      // NOTE: We do not use diff-patch-match, as that may result in
      // op conflicts when ops are submitted from multiple sources.
      // diff-patch-match mutates the string, but we want to replace it.
      const ops = json0OtDiff(this._textDocument.data, usj);
      await this._textDocument.submit(ops, 'Editor');
    }
  }

  private async subscribeToTextDocument(id: TextDocId | undefined): Promise<void> {
    if (id != null) {
      this._textDocumentChanges?.unsubscribe();
      this._textDocument = await this.realtimeService.subscribe<TextDocumentDoc>(
        TextDocumentDoc.COLLECTION,
        id.toString()
      );
      this.usj = this._textDocument.data;
      this._textDocumentChanges = this._textDocument.remoteChanges$
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          // TODO: Merge in the changes
          this.usj = this._textDocument?.data;
        });
    }
  }

  private updateEditorProps(): void {
    this.editorProps = this.createEditorProps();
  }
}
