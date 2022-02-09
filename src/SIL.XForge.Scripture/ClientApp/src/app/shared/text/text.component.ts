import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild
} from '@angular/core';
import { TranslocoService } from '@ngneat/transloco';
import isEqual from 'lodash-es/isEqual';
import merge from 'lodash-es/merge';
import Quill, { DeltaStatic, RangeStatic, Sources } from 'quill';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { fromEvent } from 'rxjs';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { getBrowserEngine } from 'xforge-common/utils';
import { TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { registerScripture } from './quill-scripture';
import { Segment } from './segment';
import { TextViewModel } from './text-view-model';

const EDITORS = new Set<Quill>();

function onNativeSelectionChanged(): void {
  // workaround for bug where Quill allows a selection inside of an embed
  const sel = window.document.getSelection();
  if (sel == null || sel.rangeCount === 0 || !sel.isCollapsed) {
    return;
  }
  const text = sel.getRangeAt(0).commonAncestorContainer.textContent;
  if (text === '\ufeff') {
    for (const editor of EDITORS) {
      if (editor.hasFocus()) {
        const editorSel = editor.getSelection();
        if (editorSel != null) {
          editor.setSelection(editorSel, 'silent');
        }
        break;
      }
    }
  }
}

const USX_FORMATS = registerScripture();
window.document.addEventListener('selectionchange', onNativeSelectionChanged);

export interface TextUpdatedEvent {
  delta?: DeltaStatic;
  prevSegment?: Segment;
  segment?: Segment;
}

/** View of an editable text document. Used for displaying Scripture. */
@Component({
  selector: 'app-text',
  templateUrl: './text.component.html'
})
export class TextComponent extends SubscriptionDisposable implements AfterViewInit, OnDestroy {
  @ViewChild('quillEditor', { static: true, read: ElementRef }) quill!: ElementRef;
  @Input() isReadOnly: boolean = true;
  @Input() markInvalid: boolean = false;
  @Input() multiSegmentSelection = false;
  @Input() subscribeToUpdates = true;
  @Output() updated = new EventEmitter<TextUpdatedEvent>(true);
  @Output() segmentRefChange = new EventEmitter<string>();
  @Output() loaded = new EventEmitter(true);
  lang: string = '';
  // only use USX formats and not default Quill formats
  readonly allowedFormats: string[] = USX_FORMATS;
  // allow for different CSS based on the browser engine
  readonly browserEngine: string = getBrowserEngine();

  private _editorStyles: any = { fontSize: '1rem' };
  private readonly DEFAULT_MODULES: any = {
    toolbar: false,
    keyboard: {
      bindings: {
        // disable default tab keyboard shortcuts in Quill
        tab: null,
        'remove tab': null,
        'embed left': null,
        'embed left shift': null,
        'embed right': null,
        'embed right shift': null,

        'disable backspace': {
          key: 'backspace',
          altKey: null,
          ctrlKey: null,
          metaKey: null,
          shiftKey: null,
          handler: (range: RangeStatic) => this.isBackspaceAllowed(range)
        },
        'disable delete': {
          key: 'delete',
          handler: (range: RangeStatic) => this.isDeleteAllowed(range)
        },
        'disable enter': {
          key: 'enter',
          shiftKey: null,
          handler: () => false
        },
        'move next, tab': {
          key: 'tab',
          shiftKey: false,
          handler: () => {
            if (this.isRtl && this.isSelectionAtSegmentEnd) {
              this.moveNextSegment(false);
              return false;
            }
            this.moveNextSegment();
            return false;
          }
        },
        'move prev, tab': {
          key: 'tab',
          shiftKey: true,
          handler: () => this.movePrevSegment()
        },
        'move next, segment end, right arrow': {
          key: 'right',
          handler: () => {
            if (this.isLtr && this.isSelectionAtSegmentEnd) {
              this.moveNextSegment(false);
              return false;
            } else if (this.isRtl && this.isSelectionAtSegmentStart) {
              this.movePrevSegment(true);
              return false;
            }
            return true;
          }
        },
        'move next, segment end, left arrow': {
          key: 'left',
          handler: () => {
            if (this.isRtl && this.isSelectionAtSegmentEnd) {
              this.moveNextSegment(false);
              return false;
            } else if (this.isLtr && this.isSelectionAtSegmentStart) {
              this.movePrevSegment(true);
            }
            return true;
          }
        },
        redo: {
          key: 'Y',
          shortKey: true,
          handler: () => {
            if (this.editor != null) {
              this.editor.history.redo();
            }
          }
        }
      }
    },
    history: {
      userOnly: true
    },
    dragAndDrop: { textComponent: this }
  };
  private _id?: TextDocId;
  private _isRightToLeft: boolean = false;
  private _modules: any = this.DEFAULT_MODULES;
  private _editor?: Quill;
  private viewModel = new TextViewModel();
  private _segment?: Segment;
  private initialTextFetched: boolean = false;
  private initialSegmentRef?: string;
  private initialSegmentChecksum?: number;
  private initialSegmentFocus?: boolean;
  private _highlightSegment: boolean = false;
  private highlightMarker?: HTMLElement;
  private highlightMarkerTop: number = 0;
  private highlightMarkerHeight: number = 0;
  private _placeholder?: string;
  private displayMessage: string = '';

  constructor(
    private readonly projectService: SFProjectService,
    private readonly transloco: TranslocoService,
    private readonly pwaService: PwaService,
    private readonly changeDetector: ChangeDetectorRef
  ) {
    super();
  }

  get placeholder() {
    if (this._id == null && this._placeholder != null) {
      return this._placeholder;
    }
    return this.displayMessage;
  }

  @Input() set placeholder(value: string) {
    this._placeholder = value;
  }

  get id(): TextDocId | undefined {
    return this._id;
  }

  @Input()
  set id(value: TextDocId | undefined) {
    if (!isEqual(this._id, value)) {
      this._id = value;
      this.initialSegmentRef = undefined;
      this.initialSegmentChecksum = undefined;
      this.initialSegmentFocus = undefined;
      this.initialTextFetched = false;
      if (this.editor != null) {
        if (this.highlightMarker != null) {
          this.highlightMarker.style.visibility = 'hidden';
        }
        this.bindQuill();
      }
      this.setLangFromText();
    }
  }

  @Input() set isRightToLeft(value: boolean) {
    this._isRightToLeft = value;
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
      if (value) {
        this.highlight();
      } else {
        this.clearHighlight();
      }
    }
  }

  get selectionDiagnostic(): string {
    const selection: RangeStatic | undefined | null = this.editor?.getSelection();
    if (selection == null) {
      return '';
    }
    return `pos ${selection.index}, len ${selection.length}`;
  }

  get quillSelectionOpsDiagnostic(): string {
    const selection: RangeStatic | undefined | null = this.editor?.getSelection();
    if (selection == null) {
      return '';
    }
    const segmentRef: string = this.segmentRef;
    if (segmentRef === '') {
      return '';
    }
    return JSON.stringify(this.editor?.getContents(selection?.index, selection?.length), null, 2);
  }

  get quillSegmentOpsDiagnostic(): string {
    const selection: RangeStatic | undefined | null = this.editor?.getSelection();
    if (selection == null) {
      return '';
    }
    const segmentRef: string = this.segmentRef;
    if (segmentRef === '') {
      return '';
    }
    return JSON.stringify(this.getSegmentContents(segmentRef), null, 2);
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

  get editor(): Quill | undefined {
    return this._editor;
  }

  get segment(): Segment | undefined {
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

  get isLtr(): boolean {
    return !this._isRightToLeft && this.contentShowing;
  }

  get isRtl(): boolean {
    return this._isRightToLeft && this.contentShowing;
  }

  get isSelectionAtSegmentEnd(): boolean {
    return this.isSelectionAtSegmentPosition(true);
  }

  get isSelectionAtSegmentStart(): boolean {
    return this.isSelectionAtSegmentPosition(false);
  }

  get readOnlyEnabled(): boolean {
    return this.isReadOnly || this.viewModel.isEmpty;
  }

  get textDirection(): 'ltr' | 'rtl' | 'auto' {
    if (this.contentShowing) {
      return this.isRtl ? 'rtl' : 'ltr';
    }
    return 'auto';
  }

  private get contentShowing(): boolean {
    return this.id != null && this.viewModel.isLoaded && !this.viewModel.isEmpty;
  }

  ngAfterViewInit(): void {
    this.subscribe(this.pwaService.onlineStatus, isOnline => {
      this.updatePlaceholderText(isOnline);
      this.changeDetector.detectChanges();
    });
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.viewModel != null) {
      this.viewModel.unbind();
    }
    if (this._editor != null) {
      EDITORS.delete(this._editor);
    }
  }

  onEditorCreated(editor: Quill): void {
    this._editor = editor;
    this.highlightMarker = this._editor.addContainer('highlight-marker');
    if (this.highlightMarker != null) {
      this.highlightMarker.style.visibility = 'hidden';
    }
    this.subscribe(fromEvent(this._editor.root, 'scroll'), () => this.updateHighlightMarkerVisibility());
    this.subscribe(fromEvent(window, 'resize'), () => this.setHighlightMarkerPosition());
    this.viewModel.editor = editor;
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

  setSegment(segmentRef: string, checksum?: number, focus: boolean = false, end: boolean = true): boolean {
    if (!this.initialTextFetched) {
      this.initialSegmentRef = segmentRef;
      this.initialSegmentChecksum = checksum;
      this.initialSegmentFocus = focus;
      return true;
    }
    const prevSegment = this.segment;
    if (this.tryChangeSegment(segmentRef, checksum, focus, end)) {
      this.updated.emit({ prevSegment, segment: this._segment });
      return true;
    }
    return false;
  }

  getSegmentRange(ref: string): RangeStatic | undefined {
    return this.viewModel.getSegmentRange(ref);
  }

  getRelatedSegmentRefs(ref: string): string[] {
    return this.viewModel.getRelatedSegmentRefs(ref);
  }

  getSegmentText(ref: string): string {
    return this.viewModel.getSegmentText(ref);
  }

  hasSegmentRange(ref: string): boolean {
    return this.viewModel.hasSegmentRange(ref);
  }

  getVerseSegments(verseRef?: VerseRef): string[] {
    return this.viewModel.getVerseSegments(verseRef);
  }

  /** Respond to text changes in the quill editor. */
  onContentChanged(delta: DeltaStatic, source: string): void {
    this.viewModel.update(delta, source as Sources);
    this.updatePlaceholderText();
    // skip updating when only formatting changes occurred
    if (delta.ops != null && delta.ops.some(op => op.insert != null || op.delete != null)) {
      this.update(delta);
    }
  }

  onSelectionChanged(): void {
    this.update();
  }

  clearHighlight(): void {
    this.highlight([]);
  }

  highlight(segmentRefs?: string[]): void {
    if (this._id == null) {
      return;
    }
    if (segmentRefs == null && this._segment != null) {
      segmentRefs = [this._segment.ref];
    }
    if (segmentRefs != null) {
      // this changes the underlying HTML, which can mess up some Quill events, so defer this call
      Promise.resolve(segmentRefs).then(refs => {
        this.viewModel.highlight(refs);
        if (!this.readOnlyEnabled) {
          this.viewModel.updateUsfmDescription();
        }
      });
    }

    if (!this.isReadOnly && this._id.textType === 'target' && this.highlightMarker != null) {
      if (segmentRefs != null && segmentRefs.length > 0) {
        this.highlightMarker.style.visibility = '';
      } else {
        this.highlightMarker.style.visibility = 'hidden';
      }
    }
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
    if (this._id == null) {
      return;
    }
    if (this.pwaService.isOnline) {
      this.displayMessage = this.transloco.translate('text.loading');
    } else {
      this.displayMessage = this.transloco.translate('text.not_available_offline');
    }
    const textDoc = await this.projectService.getText(this._id);
    this.viewModel.bind(textDoc, this.subscribeToUpdates);
    this.updatePlaceholderText();

    this.loaded.emit();
    this.applyEditorStyles();
  }

  private isSelectionAtSegmentPosition(end: boolean): boolean {
    if (this.editor == null || this.segment == null) {
      return false;
    }
    const selection = this.editor.getSelection();
    if (selection == null) {
      return false;
    }

    // if the segment is blank, then we are always at the end
    if (this.segment.text === '') {
      return true;
    }

    const selectionEndIndex = selection.index + (end ? selection.length : 0);
    const segmentEndIndex = this.segment.range.index + (end ? this.segment.range.length : 0);
    return selectionEndIndex === segmentEndIndex;
  }

  private isBackspaceAllowed(range: RangeStatic): boolean {
    if (this._editor == null) {
      return false;
    }

    if (range.length > 0) {
      const text = this._editor.getText(range.index, range.length);
      return text !== '';
    }
    const text = this._editor.getText(range.index - 1, 1);
    const isTextDeletion: boolean = text != null && text.length > 0;

    return isTextDeletion && this._segment != null && range.index !== this._segment.range.index;
  }

  private isDeleteAllowed(range: RangeStatic): boolean {
    if (this._editor == null) {
      return false;
    }

    if (range.length > 0) {
      const text = this._editor.getText(range.index, range.length);
      return text !== '';
    }
    const text = this._editor.getText(range.index, 1);
    const isTextDeletion: boolean = text != null && text.length > 0;

    return (
      isTextDeletion && this._segment != null && range.index !== this._segment.range.index + this._segment.range.length
    );
  }

  private moveNextSegment(end: boolean = true): void {
    if (this._segment == null) {
      return;
    }
    const nextRef = this.viewModel.getNextSegmentRef(this._segment.ref);
    if (nextRef != null) {
      this.setSegment(nextRef, undefined, true, end);
    }
  }

  private movePrevSegment(end: boolean = true): void {
    if (this._segment == null) {
      return;
    }
    const prevRef = this.viewModel.getPrevSegmentRef(this._segment.ref);
    if (prevRef != null) {
      this.setSegment(prevRef, undefined, true, end);
    }
  }

  private update(delta?: DeltaStatic): void {
    let segmentRef: string | undefined;
    let checksum: number | undefined;
    let focus: boolean | undefined;
    if (delta != null && !this.initialTextFetched) {
      segmentRef = this.initialSegmentRef;
      checksum = this.initialSegmentChecksum;
      focus = this.initialSegmentFocus;
      this.initialSegmentRef = undefined;
      this.initialSegmentChecksum = undefined;
      this.initialSegmentFocus = undefined;

      this.initialTextFetched = true;
    }

    if (this._editor != null && segmentRef == null) {
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
          this.highlight();
        }
      }
      this.setHighlightMarkerPosition();
    }

    Promise.resolve().then(() => this.adjustSelection());
    this.updated.emit({ delta, prevSegment, segment: this._segment });
  }

  private tryChangeSegment(
    segmentRef: string,
    checksum?: number,
    focus: boolean = false,
    end: boolean = true
  ): boolean {
    if (this._id == null || this._editor == null) {
      return false;
    }

    if (this._segment != null && this._id.bookNum === this._segment.bookNum && segmentRef === this._segment.ref) {
      if (focus) {
        this._editor.focus();
      }
      // the selection has not changed to a different segment
      return false;
    }

    if (!this.viewModel.hasSegmentRange(segmentRef)) {
      const verseParts: string[] = segmentRef.split('_');
      const verseRef: VerseRef = new VerseRef(this.id?.bookNum, verseParts[1], verseParts[2]);
      const correspondingSegments: string[] = this.getVerseSegments(verseRef);
      if (correspondingSegments.length === 0) {
        if (this._segment != null && this.highlightSegment) {
          this.clearHighlight();
        }
        this._segment = undefined;
        this.segmentRefChange.emit();
        return true;
      }
      segmentRef = correspondingSegments[0];
    }

    if (focus) {
      const selection = this._editor.getSelection();
      const selectedSegmentRef = selection == null ? null : this.viewModel.getSegmentRef(selection);
      if (selectedSegmentRef !== segmentRef) {
        const range = this.viewModel.getSegmentRange(segmentRef);
        if (range != null) {
          // setTimeout seems necessary to ensure that the editor is focused
          setTimeout(() => {
            if (this._editor != null) {
              this._editor.setSelection(end ? range.index + range.length : range.index, 0, 'user');
            }
          });
        }
      }
    }

    this._segment = new Segment(this._id.bookNum, this._id.chapterNum, segmentRef);
    if (checksum != null) {
      this._segment.initialChecksum = checksum;
    }
    this.updateSegment();
    this.segmentRefChange.emit(this.segmentRef);
    if (this.highlightSegment) {
      this.highlight();
    }
    return true;
  }

  private updateSegment(): void {
    if (this._segment == null) {
      return;
    }
    const range = this.viewModel.getSegmentRange(this._segment.ref);
    if (range != null) {
      const text = this.viewModel.getSegmentText(this._segment.ref);
      this._segment.update(text, range);
    }
  }

  private adjustSelection(): void {
    if (this._editor == null || this._segment == null) {
      return;
    }
    const sel = this._editor.getSelection();
    if (sel == null) {
      return;
    }
    let newSel: RangeStatic | undefined;
    if (this._segment.text === '') {
      // always select at the end of blank so the cursor is inside the segment and not between the segment and verse
      newSel = { index: this._segment.range.index + 1, length: 0 };
    } else if (!this.multiSegmentSelection) {
      // selections outside of the text chooser dialog are not permitted to extend across segments
      const newStart = Math.max(sel.index, this._segment.range.index);
      const oldEnd = sel.index + sel.length;
      const segEnd = this._segment.range.index + this._segment.range.length;
      const newEnd = Math.min(oldEnd, segEnd);
      newSel = { index: newStart, length: Math.max(0, newEnd - newStart) };
    }
    if (newSel != null && (sel.index !== newSel.index || sel.length !== newSel.length)) {
      this._editor.setSelection(newSel, 'user');
    }
  }

  private setHighlightMarkerPosition(): void {
    if (this._editor == null || this.highlightMarker == null || this._segment == null) {
      return;
    }
    const range = this._segment.range;
    const bounds = this._editor.getBounds(range.index, range.length);
    this.highlightMarkerTop = bounds.top + this._editor.root.scrollTop;
    this.highlightMarkerHeight = bounds.height;
    this.highlightMarker.style.top = this.highlightMarkerTop + 'px';
    this.updateHighlightMarkerVisibility();
  }

  private updateHighlightMarkerVisibility(): void {
    if (this._editor == null || this.highlightMarker == null) {
      return;
    }

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

  private updatePlaceholderText(forceAndConnected?: boolean): void {
    if (!this.viewModel.isLoaded) {
      this.displayMessage = this.pwaService.isOnline
        ? this.transloco.translate('text.book_does_not_exist')
        : this.transloco.translate('text.not_available_offline');
    } else if (this.viewModel.isEmpty) {
      this.displayMessage = this.transloco.translate('text.book_is_empty');
    } else {
      if (forceAndConnected == null) {
        return;
      }
      this.displayMessage = forceAndConnected
        ? this.transloco.translate('text.loading')
        : this.transloco.translate('text.not_available_offline');
    }
  }

  private async setLangFromText() {
    if (this.id == null) {
      return;
    }

    const project = (await this.projectService.get(this.id.projectId)).data;
    if (project == null) {
      return;
    }

    this.lang = project.writingSystem.tag;
  }
}
