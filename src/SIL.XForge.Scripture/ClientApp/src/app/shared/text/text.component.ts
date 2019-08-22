import { Component, EventEmitter, Input, OnDestroy, Output, ViewEncapsulation } from '@angular/core';
import isEqual from 'lodash/isEqual';
import merge from 'lodash/merge';
import Quill, { DeltaStatic, RangeStatic, Sources } from 'quill';
import { fromEvent } from 'rxjs';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { TextDocId } from '../../core/models/text-doc-id';
import { SFProjectService } from '../../core/sf-project.service';
import { registerScripture } from './quill-scripture';
import { Segment } from './segment';
import { TextViewModel } from './text-view-model';

const EDITORS = new Set<Quill>();

function onNativeSelectionChanged(): void {
  // workaround for bug where Quill allows a selection inside of an embed
  const sel = window.document.getSelection();
  if (sel.rangeCount === 0 || !sel.isCollapsed) {
    return;
  }
  const text = sel.getRangeAt(0).commonAncestorContainer.textContent;
  if (text === '\ufeff') {
    for (const editor of EDITORS) {
      if (editor.hasFocus()) {
        editor.setSelection(editor.getSelection(), 'silent');
        break;
      }
    }
  }
}

registerScripture();
window.document.addEventListener('selectionchange', onNativeSelectionChanged);

export interface TextUpdatedEvent {
  delta?: DeltaStatic;
  prevSegment?: Segment;
  segment: Segment;
}

/** View of an editable text document. Used for displaying Scripture. */
@Component({
  selector: 'app-text',
  templateUrl: './text.component.html',
  styleUrls: ['./text.component.scss', './usx-styles.scss'],
  encapsulation: ViewEncapsulation.None
})
export class TextComponent extends SubscriptionDisposable implements OnDestroy {
  @Input() isReadOnly: boolean = true;
  @Output() updated = new EventEmitter<TextUpdatedEvent>(true);
  @Output() segmentRefChange = new EventEmitter<string>();
  @Output() loaded = new EventEmitter(true);

  private _editorStyles: any = { fontSize: '1rem' };
  private readonly DEFAULT_MODULES: any = {
    toolbar: false,
    keyboard: {
      bindings: {
        disableBackspace: {
          key: 'backspace',
          altKey: null,
          ctrlKey: null,
          metaKey: null,
          shiftKey: null,
          handler: (range: RangeStatic) => this.isBackspaceAllowed(range)
        },
        disableDelete: {
          key: 'delete',
          handler: (range: RangeStatic) => this.isDeleteAllowed(range)
        },
        disableEnter: {
          key: 'enter',
          shiftKey: null,
          handler: () => false
        }
      }
    },
    history: {
      userOnly: true
    }
  };
  private _id?: TextDocId;
  private _modules: any = this.DEFAULT_MODULES;
  private _editor?: Quill;
  private viewModel?: TextViewModel;
  private _segment?: Segment;
  private initialTextFetched: boolean = false;
  private initialSegmentRef?: string;
  private initialSegmentChecksum?: number;
  private initialSegmentFocus?: boolean;
  private _highlightSegment: boolean = false;
  private highlightMarker: HTMLElement;
  private highlightMarkerTop: number;
  private highlightMarkerHeight: number;

  constructor(private readonly projectService: SFProjectService) {
    super();
  }

  get id(): TextDocId {
    return this._id;
  }

  @Input()
  set id(value: TextDocId) {
    if (!isEqual(this._id, value)) {
      this._id = value;
      this._segment = undefined;
      this.initialSegmentRef = undefined;
      this.initialSegmentChecksum = undefined;
      this.initialSegmentFocus = undefined;
      this.initialTextFetched = false;
      if (this.editor != null) {
        this.highlightMarker.style.visibility = 'hidden';
        this.bindQuill();
      }
    }
  }

  get modules(): any {
    return this._modules;
  }

  @Input()
  set modules(value: any) {
    this._modules = merge(value, this.DEFAULT_MODULES);
  }

  get highlightSegment(): boolean {
    return this._highlightSegment;
  }

  @Input()
  set highlightSegment(value: boolean) {
    if (this._highlightSegment !== value) {
      this._highlightSegment = value;
      if (this._segment != null) {
        this.toggleHighlight(value);
      }
    }
  }

  get segmentRef(): string {
    if (this._segment == null) {
      return this.initialSegmentRef == null ? '' : this.initialSegmentRef;
    }
    return this._segment.ref;
  }

  @Input()
  set segmentRef(value: string) {
    if (value !== this.segmentRef) {
      this.setSegment(value);
    }
  }

  get hasFocus(): boolean {
    return this._editor == null ? false : this._editor.hasFocus();
  }

  get editor(): Quill {
    return this._editor;
  }

  get segment(): Segment {
    return this._segment;
  }

  get segmentText(): string {
    return this._segment == null ? '' : this._segment.text;
  }

  get segmentChecksum(): number {
    return this._segment == null ? 0 : this._segment.checksum;
  }

  get editorStyles(): object {
    return this._editorStyles;
  }

  @Input()
  set editorStyles(styles: object) {
    this._editorStyles = styles;
    this.applyEditorStyles();
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.viewModel != null) {
      this.viewModel.unbind();
    }
    EDITORS.delete(this._editor);
  }

  onEditorCreated(editor: Quill): void {
    this._editor = editor;
    this.highlightMarker = this._editor.addContainer('highlight-marker');
    this.subscribe(fromEvent(this._editor.root, 'scroll'), () => this.updateHighlightMarkerVisibility());
    this.subscribe(fromEvent(window, 'resize'), () => this.setHighlightMarkerPosition());
    this.viewModel = new TextViewModel(this._editor);
    if (this.id != null) {
      this.bindQuill();
    }
    EDITORS.add(this._editor);
  }

  focus(): void {
    if (this.editor != null) {
      this.editor.focus();
    }
  }

  blur(): void {
    if (this.editor != null) {
      this.editor.blur();
    }
  }

  setSegment(segmentRef: string, checksum?: number, focus: boolean = false): boolean {
    if (!this.initialTextFetched) {
      this.initialSegmentRef = segmentRef;
      this.initialSegmentChecksum = checksum;
      this.initialSegmentFocus = focus;
      return true;
    }
    const prevSegment = this.segment;
    if (this.tryChangeSegment(segmentRef, checksum, focus)) {
      this.updated.emit({ prevSegment, segment: this._segment });
      return true;
    }
    return false;
  }

  getSegmentRange(ref: string): RangeStatic {
    return this.viewModel.getSegmentRange(ref);
  }

  getSegmentText(ref: string): string {
    const range = this.viewModel.getSegmentRange(ref);
    return range == null ? '' : this._editor.getText(range.index, range.length);
  }

  onContentChanged(delta: DeltaStatic, source: Sources): void {
    this.viewModel.update(delta, source);
    if (this.viewModel.isEmpty) {
      this.setPlaceholderText('Book does not exist');
    }
    // skip updating when only formatting changes occurred
    if (delta.ops.some(op => op.insert != null || op.delete != null)) {
      this.update(delta);
    }
  }

  onSelectionChanged(): void {
    this.update();
  }

  private applyEditorStyles() {
    if (this._editor != null) {
      const container = this._editor.container as HTMLElement;
      for (const style in this.editorStyles) {
        if (style in container.style) {
          container.style[style] = this.editorStyles[style];
        }
      }
    }
  }

  private async bindQuill(): Promise<void> {
    this.viewModel.unbind();
    if (this._id == null || this._editor == null) {
      return;
    }
    this.setPlaceholderText('Loading...');
    const textDoc = await this.projectService.getText(this._id);
    this.viewModel.bind(textDoc);

    this.loaded.emit();
    this.applyEditorStyles();
  }

  private isBackspaceAllowed(range: RangeStatic): boolean {
    if (range.length > 0) {
      const text = this._editor.getText(range.index, range.length);
      return text !== '';
    }

    return range.index !== this._segment.range.index;
  }

  private isDeleteAllowed(range: RangeStatic): boolean {
    if (range.length > 0) {
      const text = this._editor.getText(range.index, range.length);
      return text !== '';
    }

    return range.index !== this._segment.range.index + this._segment.range.length;
  }

  private update(delta?: DeltaStatic): void {
    let segmentRef: string;
    let checksum: number;
    let focus: boolean;
    if (delta != null && !this.initialTextFetched) {
      segmentRef = this.initialSegmentRef;
      checksum = this.initialSegmentChecksum;
      focus = this.initialSegmentFocus;
      this.initialSegmentRef = undefined;
      this.initialSegmentChecksum = undefined;
      this.initialSegmentFocus = undefined;

      this.initialTextFetched = true;
    }

    if (segmentRef == null) {
      // get currently selected segment ref
      const selection = this._editor.getSelection();
      if (selection != null) {
        segmentRef = this.viewModel.getSegmentRef(selection);
      }
    }

    const prevSegment = this._segment;
    if (segmentRef != null) {
      // update/switch current segment
      if (!this.tryChangeSegment(segmentRef, checksum, focus) && this._segment != null) {
        // the selection has not changed to a different segment, so update existing segment
        this.updateSegment();
        if (this._highlightSegment) {
          // ensure that the currently selected segment is highlighted
          if (!this.viewModel.isHighlighted(this._segment)) {
            this.viewModel.toggleHighlight(this._segment, this._id.textType);
          }
        }
      }
      this.setHighlightMarkerPosition();
    }

    Promise.resolve().then(() => this.adjustSelection());
    this.updated.emit({ delta, prevSegment, segment: this._segment });
  }

  private tryChangeSegment(segmentRef: string, checksum?: number, focus: boolean = false): boolean {
    if (this._segment != null && this._id.bookId === this._segment.bookId && segmentRef === this._segment.ref) {
      // the selection has not changed to a different segment
      return false;
    }

    if (!this.viewModel.hasSegmentRange(segmentRef)) {
      if (this._segment != null && this.highlightSegment) {
        this.toggleHighlight(false);
      }
      this._segment = undefined;
      this.segmentRefChange.emit();
      return true;
    }

    if (focus) {
      const selection = this._editor.getSelection();
      const selectedSegmentRef = selection == null ? null : this.viewModel.getSegmentRef(selection);
      if (selectedSegmentRef !== segmentRef) {
        const range = this.viewModel.getSegmentRange(segmentRef);
        Promise.resolve().then(() => this._editor.setSelection(range.index + range.length, 0, 'user'));
      }
    }

    if (this._segment != null && this.highlightSegment) {
      this.toggleHighlight(false);
    }
    this._segment = new Segment(this._id.bookId, segmentRef);
    if (checksum != null) {
      this._segment.initialChecksum = checksum;
    }
    this.updateSegment();
    this.segmentRefChange.emit(this.segmentRef);
    if (this.highlightSegment) {
      this.toggleHighlight(true);
    }
    return true;
  }

  private updateSegment(): void {
    const range = this.viewModel.getSegmentRange(this._segment.ref);
    const text = this._editor.getText(range.index, range.length);
    this._segment.update(text, range);
  }

  private adjustSelection(): void {
    if (!this._editor.hasFocus() || this._segment == null) {
      return;
    }
    const sel = this._editor.getSelection();
    if (sel == null) {
      return;
    }
    let newSel: RangeStatic;
    if (this._segment.text === '') {
      // always select at the beginning if blank
      newSel = { index: this._segment.range.index, length: 0 };
    } else {
      // ensure that selection does not extend across segments
      const newStart = Math.max(sel.index, this._segment.range.index);
      const oldEnd = sel.index + sel.length;
      const segEnd = this._segment.range.index + this._segment.range.length;
      const newEnd = Math.min(oldEnd, segEnd);
      newSel = { index: newStart, length: Math.max(0, newEnd - newStart) };
    }
    if (sel.index !== newSel.index || sel.length !== newSel.length) {
      this._editor.setSelection(newSel, 'user');
    }
  }

  private toggleHighlight(value: boolean): void {
    this.viewModel.toggleHighlight(this._segment, value ? this._id.textType : false);

    if (this._id.textType === 'target') {
      if (value) {
        this.highlightMarker.style.visibility = '';
      } else {
        this.highlightMarker.style.visibility = 'hidden';
      }
    }
  }

  private setHighlightMarkerPosition(): void {
    if (this._segment == null) {
      return;
    }
    const range = this._segment.range;
    const bounds = this._editor.getBounds(range.index, range.length);
    this.highlightMarkerTop = bounds.top + this.editor.root.scrollTop;
    this.highlightMarkerHeight = bounds.height;
    this.highlightMarker.style.top = this.highlightMarkerTop + 'px';
    this.updateHighlightMarkerVisibility();
  }

  private updateHighlightMarkerVisibility(): void {
    const marginTop = -this._editor.root.scrollTop;
    const offsetTop = marginTop + this.highlightMarkerTop;
    const offsetBottom = offsetTop + this.highlightMarkerHeight;
    if (offsetTop < 0) {
      this.highlightMarker.style.marginTop = -this.highlightMarkerTop + 'px';
      const height = this.highlightMarkerHeight + offsetTop;
      this.highlightMarker.style.height = Math.max(height, 0) + 'px';
    } else if (offsetBottom > this._editor.scrollingContainer.clientHeight) {
      this.highlightMarker.style.marginTop = marginTop + 'px';
      const height = this._editor.scrollingContainer.clientHeight - offsetTop;
      this.highlightMarker.style.height = Math.max(height, 0) + 'px';
    } else {
      this.highlightMarker.style.marginTop = marginTop + 'px';
      this.highlightMarker.style.height = this.highlightMarkerHeight + 'px';
    }
  }

  private setPlaceholderText(text: string): void {
    const editorElem = this._editor.container.getElementsByClassName('ql-editor')[0];
    editorElem.setAttribute('data-placeholder', text);
  }
}
