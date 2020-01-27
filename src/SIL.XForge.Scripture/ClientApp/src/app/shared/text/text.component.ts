import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { translate } from '@ngneat/transloco';
import isEqual from 'lodash/isEqual';
import merge from 'lodash/merge';
import Quill, { DeltaStatic, RangeStatic, Sources } from 'quill';
import { fromEvent } from 'rxjs';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
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

registerScripture();
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
export class TextComponent extends SubscriptionDisposable implements OnDestroy {
  @ViewChild('quillEditor', { static: true, read: ElementRef }) quill!: ElementRef;
  @Input() isReadOnly: boolean = true;
  @Input() placeholder = translate('text.loading');
  @Input() markInvalid: boolean = false;
  @Input() multiSegmentSelection = false;
  @Output() updated = new EventEmitter<TextUpdatedEvent>(true);
  @Output() segmentRefChange = new EventEmitter<string>();
  @Output() loaded = new EventEmitter(true);
  lang: string = '';

  private direction: string | null = null;
  private _editorStyles: any = { fontSize: '1rem' };
  private readonly DEFAULT_MODULES: any = {
    toolbar: false,
    keyboard: {
      bindings: {
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
          handler: () => this.moveNextSegment()
        },
        'move prev, tab': {
          key: 'tab',
          shiftKey: true,
          handler: () => this.movePrevSegment()
        },
        'move next, segment end, right arrow': {
          key: 'right',
          handler: () => {
            if (this.isSelectionAtSegmentEnd) {
              this.moveNextSegment(false);
              return false;
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
    }
  };
  private _id?: TextDocId;
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

  constructor(private readonly projectService: SFProjectService) {
    super();
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
    return this.direction === 'ltr';
  }

  get isRtl(): boolean {
    return this.direction === 'rtl';
  }

  get isSelectionAtSegmentEnd(): boolean {
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

    const selectionEndIndex = selection.index + selection.length;
    const segmentEndIndex = this.segment.range.index + this.segment.range.length;
    return selectionEndIndex === segmentEndIndex;
  }

  get readOnlyEnabled(): boolean {
    return this.isReadOnly || (this.viewModel != null && this.viewModel.isEmpty);
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

  onContentChanged(delta: DeltaStatic, source: Sources): void {
    this.viewModel.update(delta, source);
    this.updatePlaceholderText();
    // skip updating when only formatting changes occurred
    if (delta.ops != null && delta.ops.some(op => op.insert != null || op.delete != null)) {
      this.update(delta);
      // Update direction logic for the text
      Promise.resolve().then(() => {
        this.setDirection();
      });
    }
  }

  onSelectionChanged(): void {
    this.update();
  }

  toggleHighlight(value: boolean, range?: RangeStatic): void {
    if (this._id == null) {
      return;
    }
    if (range == null && this._segment != null) {
      range = this._segment.range;
    }
    if (range == null) {
      return;
    }
    this.viewModel.toggleHighlight(range, value);

    if (!this.isReadOnly && this._id.textType === 'target' && this.highlightMarker != null) {
      if (value) {
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
    this.placeholder = translate('text.loading');
    const textDoc = await this.projectService.getText(this._id);
    this.viewModel.bind(textDoc);
    this.updatePlaceholderText();

    this.loaded.emit();
    this.applyEditorStyles();
    // Get the computed direction the browser decided to use for quill for the current text
    this.setDirection();
  }

  private isBackspaceAllowed(range: RangeStatic): boolean {
    if (this._editor == null) {
      return false;
    }

    if (range.length > 0) {
      const text = this._editor.getText(range.index, range.length);
      return text !== '';
    }

    return this._segment != null && range.index !== this._segment.range.index;
  }

  private isDeleteAllowed(range: RangeStatic): boolean {
    if (this._editor == null) {
      return false;
    }

    if (range.length > 0) {
      const text = this._editor.getText(range.index, range.length);
      return text !== '';
    }

    return this._segment != null && range.index !== this._segment.range.index + this._segment.range.length;
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

  /**
   * Not all browsers appear to be consistent with how child elements determine the value of dir="auto" i.e. paragraphs
   * with child segments both having dir="auto" set.
   * To get around this we apply dir="auto" to both paragraphs (when available) and segments. We then query
   * each paragraph/segment and then specifically set the paragraph to what the direction of the first segment that
   * contains text i.e. is not blank. For chapters we use the same direction value as the paragraph that follows it.
   */
  private setDirection() {
    // As the browser is automatically applying ltr/rtl we need to ask it which one it is using
    // This value can then be used for other purposes i.e. CSS styles
    if (this.editor !== undefined) {
      this.direction = window.getComputedStyle(this.quill.nativeElement).direction;
      // Set the browser calculated direction on the segments so we can action elsewhere i.e. CSS
      let segments: NodeListOf<Element> = this.quill.nativeElement.querySelectorAll('usx-segment');
      for (const segment of Array.from(segments)) {
        let dir = window.getComputedStyle(segment).direction;
        if (dir === null) {
          continue;
        }
        const segmentRef = segment.getAttribute('data-segment');
        if (segmentRef === null) {
          continue;
        }
        const range = this.viewModel.getSegmentRange(segmentRef);
        if (range === undefined) {
          continue;
        }
        const blanks = segment.querySelectorAll('usx-blank');
        // Set the direction back to auto for blank segments so the browser can work it out when something is added
        // or pasted in through the Translate app
        if (blanks.length > 0) {
          dir = 'auto';
        }
        segment.setAttribute('dir', dir);
      }
      // Loop through the paragraphs to see what direction it should be set to based off the first valid segment
      const paragraphs: NodeListOf<Element> = this.quill.nativeElement.querySelectorAll('usx-para,.ql-editor > p');
      for (const paragraph of Array.from(paragraphs)) {
        let paraDir = 'auto';
        // Locate the first segment that isn't blank to see what direction the paragraph should be set to
        segments = paragraph.querySelectorAll('usx-segment');
        for (const segment of Array.from(segments)) {
          const dir = window.getComputedStyle(segment).direction;
          if (dir === null) {
            continue;
          }
          const blanks = segment.querySelectorAll('usx-blank');
          // Only use the segment direction if this isn't a blank segment
          if (blanks.length === 0) {
            paraDir = dir;
            break;
          }
        }
        // Set the paragraph dir
        paragraph.setAttribute('dir', paraDir);
      }
      // Chapters need its direction set from the paragraph that follows
      const chapters: NodeListOf<Element> = this.quill.nativeElement.querySelectorAll('usx-chapter');
      for (const chapter of Array.from(chapters)) {
        const sibling = chapter.nextElementSibling;
        if (sibling === null) {
          continue;
        }
        const dir = window.getComputedStyle(sibling).direction;
        if (dir === null) {
          continue;
        }
        chapter.setAttribute('dir', dir);
      }
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
        if (this._highlightSegment && this._id != null) {
          // ensure that the currently selected segment is highlighted
          if (!this.viewModel.isHighlighted(this._segment)) {
            this.viewModel.toggleHighlight(this._segment.range, true);
          }
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

    if (this._segment != null && this.highlightSegment) {
      this.toggleHighlight(false);
    }
    this._segment = new Segment(this._id.bookNum, this._id.chapterNum, segmentRef);
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
      // always select at the beginning if blank
      newSel = { index: this._segment.range.index, length: 0 };
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

  private updatePlaceholderText(): void {
    if (!this.viewModel.isLoaded) {
      this.placeholder = translate('text.book_does_not_exist');
    } else if (this.viewModel.isEmpty) {
      this.placeholder = translate('text.book_is_empty');
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
