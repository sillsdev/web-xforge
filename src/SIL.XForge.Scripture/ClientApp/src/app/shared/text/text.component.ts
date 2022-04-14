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
import { cloneDeep } from 'lodash-es';
import isEqual from 'lodash-es/isEqual';
import merge from 'lodash-es/merge';
import Quill, { DeltaOperation, DeltaStatic, RangeStatic, Sources } from 'quill';
import QuillCursors from 'quill-cursors';
import { AuthType, getAuthType } from 'realtime-server/lib/esm/common/models/user';
import { TextAnchor } from 'realtime-server/lib/esm/scriptureforge/models/text-anchor';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { fromEvent } from 'rxjs';
import { LocalPresence } from 'sharedb/lib/sharedb';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { UserDoc } from 'xforge-common/models/user-doc';
import { UserService } from 'xforge-common/user.service';
import { getBrowserEngine } from 'xforge-common/utils';
import { Delta, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { NoteThreadIcon } from '../../core/models/note-thread-doc';
import { VERSE_REGEX } from '../utils';
import { registerScripture } from './quill-scripture';
import { Segment } from './segment';
import { EditorRange, EmbedPosition, PresenceData, RemotePresences, TextViewModel } from './text-view-model';

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
  affectedEmbeds?: EditedVerseEmbeds[];
  isLocalUpdate?: boolean;
}

/**
 * Info to annotate and draw attention to a verse using a distinguishing mark, such as a community checking question or
 * a note.
 */
export interface FeaturedVerseRefInfo {
  verseRef: VerseRef;
  id: string;
  textAnchor?: TextAnchor;
  icon: NoteThreadIcon;
  preview?: string;
  highlight?: boolean;
}

/** Represents information about embeds in a verse prior to a change being applied. */
export interface EditedVerseEmbeds {
  embeds: Map<string, EmbedPosition>;
  verseRange: RangeStatic;
}

/** View of an editable text document. Used for displaying Scripture. */
@Component({
  selector: 'app-text',
  templateUrl: './text.component.html'
})
export class TextComponent extends SubscriptionDisposable implements AfterViewInit, OnDestroy {
  @ViewChild('quillEditor', { static: true, read: ElementRef }) quill!: ElementRef;
  @Input() markInvalid: boolean = false;
  @Input() multiSegmentSelection = false;
  @Input() subscribeToUpdates = true;
  @Output() updated = new EventEmitter<TextUpdatedEvent>(true);
  @Output() segmentRefChange = new EventEmitter<string>();
  @Output() loaded = new EventEmitter(true);
  @Output() focused = new EventEmitter<boolean>(true);
  @Output() presenceChange = new EventEmitter<RemotePresences | undefined>(true);
  lang: string = '';
  // only use USX formats and not default Quill formats
  readonly allowedFormats: string[] = USX_FORMATS;
  // allow for different CSS based on the browser engine
  readonly browserEngine: string = getBrowserEngine();

  private _isReadOnly: boolean = true;
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
    cursors: true,
    history: {
      userOnly: true
    },
    dragAndDrop: { textComponent: this }
  };
  private _id?: TextDocId;
  private _isRightToLeft: boolean = false;
  private _modules: any = this.DEFAULT_MODULES;
  private _editor?: Quill;
  private viewModel = new TextViewModel(this.presenceChange);
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
    private readonly changeDetector: ChangeDetectorRef,
    private readonly projectService: SFProjectService,
    private readonly pwaService: PwaService,
    private readonly transloco: TranslocoService,
    private readonly userService: UserService
  ) {
    super();
  }

  @Input() set isReadOnly(value: boolean) {
    this._isReadOnly = value;
    this.viewModel.enablePresenceReceive = this.isPresenceEnabled;
  }

  get areOpsCorrupted(): boolean {
    return this.viewModel.areOpsCorrupted;
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
  @Input() set id(value: TextDocId | undefined) {
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
  @Input() set modules(value: any) {
    this._modules = merge(value, this.DEFAULT_MODULES);
  }

  get highlightSegment(): boolean {
    return this._highlightSegment;
  }
  @Input() set highlightSegment(value: boolean) {
    if (this._highlightSegment !== value) {
      this._highlightSegment = value;
      if (value) {
        this.highlight();
      } else {
        this.clearHighlight();
      }
    }
  }

  get segmentRef(): string {
    if (this._segment == null) {
      return this.initialSegmentRef == null ? '' : this.initialSegmentRef;
    }
    return this._segment.ref;
  }
  @Input() set segmentRef(value: string) {
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
  @Input() set editorStyles(styles: object) {
    for (const style of Object.keys(styles)) {
      this._editorStyles[style] = styles[style];
    }
    this.applyEditorStyles();
  }

  @Input() set fontSize(size: string | undefined) {
    this.editorStyles = { fontSize: size };
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
    return this._isReadOnly || this.viewModel.isEmpty;
  }

  get textDirection(): 'ltr' | 'rtl' | 'auto' {
    if (this.contentShowing) {
      return this.isRtl ? 'rtl' : 'ltr';
    }
    return 'auto';
  }

  get embeddedElements(): Readonly<Map<string, EmbedPosition>> {
    return this.viewModel.embeddedElements;
  }

  get embeddedPositions(): number[] {
    return this.viewModel.embeddedPositions;
  }

  get localPresence(): LocalPresence<PresenceData> | undefined {
    return this.viewModel.localPresence;
  }

  private get isPresenceEnabled(): boolean {
    return !this._isReadOnly && this.pwaService.isOnline;
  }

  private get contentShowing(): boolean {
    return this.id != null && this.viewModel.isLoaded && !this.viewModel.isEmpty;
  }

  ngAfterViewInit(): void {
    this.subscribe(this.pwaService.onlineStatus, isOnline => {
      this.updatePlaceholderText(isOnline);
      this.changeDetector.detectChanges();
      if (!isOnline && this._editor != null) {
        const cursors: QuillCursors = this._editor.getModule('cursors');
        cursors.clearCursors();
      }
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

  getSegmentContents(ref: string): DeltaStatic | undefined {
    return this.viewModel.getSegmentContents(ref);
  }

  hasSegmentRange(ref: string): boolean {
    return this.viewModel.hasSegmentRange(ref);
  }

  getVerseSegments(verseRef?: VerseRef): string[] {
    return this.viewModel.getVerseSegments(verseRef);
  }

  getSegmentElement(segment: string): Element | null {
    return this.editor == null ? null : this.editor.container.querySelector(`usx-segment[data-segment="${segment}"]`);
  }

  toggleFeaturedVerseRefs(
    value: boolean,
    featureVerseRefs: VerseRef[],
    featureName: 'question' | 'note-thread'
  ): string[] {
    if (this.editor == null || this.id == null) {
      return [];
    }
    const segments: string[] = [];
    const verseFeatureCount = new Map<string, number>();
    const chapterFeaturedVerseRefs: VerseRef[] = featureVerseRefs.filter(fvr => fvr.chapterNum === this.id!.chapterNum);
    for (const verseRef of chapterFeaturedVerseRefs) {
      const featuredVerseSegments: string[] = this.viewModel.getVerseSegments(verseRef);
      if (featuredVerseSegments.length === 0) {
        continue;
      }
      const featureStartSegmentRef: string = featuredVerseSegments[0];
      const count: number = verseFeatureCount.get(featureStartSegmentRef) ?? 0;
      verseFeatureCount.set(featureStartSegmentRef, count + 1);
      for (const segment of featuredVerseSegments) {
        if (!segments.includes(segment)) {
          segments.push(segment);
        }
      }
    }

    // Format the featured verse refs
    for (const segment of segments) {
      const range = this.getSegmentRange(segment);
      const element = this.getSegmentElement(segment);
      if (range == null || element == null) {
        continue;
      }
      const formatSegment: string = `${featureName}-segment`;
      const formats: any = { [formatSegment]: value };
      const count = verseFeatureCount.get(segment);

      if (featureName === 'question' && count != null) {
        const formatCount: string = `${featureName}-count`;
        formats[formatCount] = value ? count : false;
      }
      this.editor.formatText(range.index, range.length, formats, 'api');
    }
    return segments;
  }

  /**
   * Embeds an element, with the specified format, into the editor, at an editor position that corresponds to
   * the beginning of textAnchor.
   */
  embedElementInline(
    verseRef: VerseRef,
    id: string,
    textAnchor: TextAnchor,
    formatName: string,
    format: any
  ): string | undefined {
    if (this.editor == null) {
      return;
    }

    // A single verse can be associated with multiple segments (e.g verse_1_1, verse_1_1/p_1)
    const verseSegments: string[] = this.viewModel.getVerseSegments(verseRef);
    if (verseSegments.length === 0) {
      return;
    }
    let editorPosOfSegmentToModify: RangeStatic | undefined = this.getSegmentRange(verseSegments[0]);
    let startTextPosInVerse: number = textAnchor.start;
    if (Array.from(this.viewModel.embeddedElements.keys()).includes(id)) {
      return;
    }

    let embedSegmentRef: string = verseSegments[0];
    const nextSegmentMarkerLength = 1;
    const blankSegmentLength = 1;
    for (const vs of verseSegments) {
      const editorPosOfSomeSegment: RangeStatic | undefined = this.getSegmentRange(vs);
      if (editorPosOfSomeSegment == null) {
        break;
      }
      const skipBlankSegment: boolean = this.isSegmentBlank(vs) && textAnchor.length > 0;
      if (skipBlankSegment) {
        startTextPosInVerse -= blankSegmentLength + nextSegmentMarkerLength;
        continue;
      }

      const segmentTextLength: number =
        editorPosOfSomeSegment.length -
        this.getEmbedCountInRange(editorPosOfSomeSegment.index, editorPosOfSomeSegment.length);
      // Does the textAnchor begin in this segment?
      if (segmentTextLength >= startTextPosInVerse) {
        editorPosOfSegmentToModify = editorPosOfSomeSegment;
        embedSegmentRef = vs;
        break;
      } else {
        // The embed starts in a later segment. Subtract the text-only length of this segment from the start index.
        startTextPosInVerse -= segmentTextLength + nextSegmentMarkerLength;
        continue;
      }
    }

    if (editorPosOfSegmentToModify == null) {
      return;
    }

    const editorRange: EditorRange = this.viewModel.getEditorContentRange(
      editorPosOfSegmentToModify.index,
      startTextPosInVerse
    );
    const embedInsertPos: number =
      editorRange.startEditorPosition + editorRange.editorLength + editorRange.trailingEmbedCount;
    const insertFormat = this.editor.getFormat(embedInsertPos);

    this.editor.insertEmbed(embedInsertPos, formatName, format, 'api');
    const textAnchorRange = this.viewModel.getEditorContentRange(embedInsertPos, textAnchor.length);
    const formatLength: number = textAnchorRange.editorLength;
    insertFormat['text-anchor'] = 'true';
    this.editor.formatText(embedInsertPos, formatLength, insertFormat, 'api');
    this.updateSegment();
    return embedSegmentRef;
  }

  formatEmbed(embedId: string, embedName: string, format: any) {
    const ep: EmbedPosition | undefined = this.embeddedElements.get(embedId);
    if (ep != null && this.editor != null) {
      this.editor.formatText(ep.position, 1, embedName, format, 'api');
    }
  }

  /** Respond to text changes in the quill editor. */
  onContentChanged(delta: DeltaStatic, source: string): void {
    if ((source as Sources) === 'user') {
      // this.deleteDuplicateNoteIcons(delta);
    }
    const segmentsBeforeDelta: IterableIterator<[string, RangeStatic]> = this.viewModel.segments;
    const embedsBeforeDelta: Readonly<Map<string, EmbedPosition>> = cloneDeep(this.embeddedElements);
    this.viewModel.update(delta, source as Sources);
    this.updatePlaceholderText();
    // skip updating when only formatting changes occurred
    if (delta.ops != null && delta.ops.some(op => op.insert != null || op.delete != null)) {
      const isUserEdit: boolean = source === 'user';
      this.update(delta, segmentsBeforeDelta, embedsBeforeDelta, isUserEdit);
    }
    if ((source as Sources) === 'user') {
      Promise.resolve().then(() => this.removeDuplicateEmbeddedElements());
    }
  }

  async onSelectionChanged(range: RangeStatic | null, source: string): Promise<void> {
    this.update();

    // We only need to send presence updates if the user moves the cursor themselves. Cursor updates as a result of text
    // changes will automatically be handled by the remote client.
    if ((source as Sources) !== 'user') return;
    // Clear the cursor on blurring.
    if (range == null) {
      this.viewModel.localPresence?.submit(null as unknown as PresenceData);
      return;
    }
    if (!this.isPresenceEnabled) return;

    // In this particular instance, we can send extra information on the presence object. This ability will vary
    // depending on type.
    const currentUserDoc: UserDoc = await this.userService.getCurrentUser();
    // If the avatar src is empty ('') then it generates one with the same background and cursor color
    // Do this for email/password accounts
    const authType: AuthType = getAuthType(currentUserDoc.data?.authId ?? '');
    const avatarUrl: string = authType === AuthType.Account ? '' : currentUserDoc.data?.avatarUrl ?? '';
    const presenceData: PresenceData = {
      viewer: {
        displayName: currentUserDoc.data?.displayName || this.transloco.translate('editor.anonymous'),
        avatarUrl,
        cursorColor: this.viewModel.cursorColor
      },
      range
    };
    this.viewModel.localPresence?.submit(presenceData, error => {
      if (error) throw error;
    });
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

    if (!this._isReadOnly && this._id.textType === 'target' && this.highlightMarker != null) {
      if (segmentRefs != null && segmentRefs.length > 0) {
        this.highlightMarker.style.visibility = '';
      } else {
        this.highlightMarker.style.visibility = 'hidden';
      }
    }
  }

  /**
   * Remove embedded elements that are not part of the text data. This may be necessary to preserve the cursor
   * location when switching between texts.
   */
  removeEmbeddedElements(): void {
    if (this.editor == null) {
      return;
    }
    let previousEmbedIndex = -1;
    const deleteDelta = new Delta();
    for (const embedIndex of this.viewModel.embeddedPositions) {
      const lengthBetweenEmbeds: number = embedIndex - (previousEmbedIndex + 1);
      if (lengthBetweenEmbeds > 0) {
        // retain elements other than notes between the previous and current embed
        deleteDelta.retain(lengthBetweenEmbeds);
      }
      deleteDelta.delete(1);
      previousEmbedIndex = embedIndex;
    }
    deleteDelta.chop();
    if (deleteDelta.ops != null && deleteDelta.ops.length > 0) {
      this.editor.updateContents(deleteDelta, 'api');
    }
  }

  removeEmbeddedElement(embedId: string, source: Sources): void {
    if (this.editor == null) {
      return;
    }

    console.log('removing embed: ' + embedId);
    console.log(this._editor!.getContents());
    const position: EmbedPosition | undefined = this.embeddedElements.get(embedId);
    console.log('position: ' + position);
    if (position != null) {
      const deltaOps: DeltaOperation[] = [{ retain: position.position }, { delete: 1 }];
      this.editor.updateContents(new Delta(deltaOps), source);
    }
  }

  removeDuplicateEmbeddedElements(): void {
    if (this.editor == null) {
      return;
    }

    const elementsWithDuplicates: EmbedPosition[] = Array.from(this.embeddedElements.values())
      .filter(e => e.duplicatePosition != null)
      .sort((a, b) => a.duplicatePosition! - b.duplicatePosition!);
    const clearDuplicateOps: DeltaOperation[] = [];
    let curIndex = 0;
    for (const element of elementsWithDuplicates) {
      // The space between is the length to retain between the last delete and the current delete positions
      const spaceLength: number = element.duplicatePosition! - curIndex;
      if (spaceLength > 0) {
        clearDuplicateOps.push({ retain: spaceLength });
        curIndex += spaceLength;
      }
      clearDuplicateOps.push({ delete: 1 });
      curIndex++;
    }
    console.log('delete delta for duplicates');
    console.log(clearDuplicateOps);
    const removedDuplicateDelta = new Delta(clearDuplicateOps);
    this.editor.updateContents(removedDuplicateDelta, 'api');
    console.log('duplicates removed');
  }

  isSegmentBlank(ref: string): boolean {
    const segmentDelta: DeltaStatic | undefined = this.getSegmentContents(ref);
    if (segmentDelta?.ops == null) {
      return false;
    }
    for (const op of segmentDelta.ops) {
      if (op.insert != null && op.insert.blank != null) {
        return true;
      }
    }
    return false;
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

  private update(
    delta?: DeltaStatic,
    segmentsBeforeDelta?: IterableIterator<[string, RangeStatic]>,
    embedsBeforeDelta?: Readonly<Map<string, EmbedPosition>>,
    isUserEdit?: boolean
  ): void {
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
      if (
        this.segment != null &&
        this.segment.text === '' &&
        delta?.ops != null &&
        delta.ops.length > 2 &&
        delta.ops[0].retain != null &&
        delta.ops[1].insert != null &&
        delta.ops[1].insert['note-thread-embed'] != null
      ) {
        // Embedding notes into quill makes quill emit deltas when it registers that content has changed
        // but quill incorrectly interprets the change when the selection is within the updated segment.
        // Content coming after the selection gets moved before the selection. This moves the selection back.
        const curSegmentRange: RangeStatic = this.segment.range;
        const insertionPoint: number = delta.ops[0].retain;
        const segmentEndPoint: number = curSegmentRange.index + curSegmentRange.length - 1;
        if (insertionPoint >= curSegmentRange.index && insertionPoint <= segmentEndPoint) {
          this._editor.setSelection(segmentEndPoint);
        }
      }
      // get currently selected segment ref
      const selection = this._editor.getSelection();
      if (selection != null) {
        segmentRef = this.viewModel.getSegmentRef(selection);
      }
    }

    const prevSegment = this._segment;
    // let oldVerseEmbedsToUpdate: Map<string, number> | undefined;
    if (segmentRef != null) {
      // update/switch current segment
      if (!this.tryChangeSegment(segmentRef, checksum, focus) && this._segment != null) {
        // the selection has not changed to a different segment, so update existing segment
        // const oldVerseEmbeds: Map<string, number> = clone(this._segment.embeddedElements);
        this.updateSegment();
        // oldVerseEmbedsToUpdate = oldVerseEmbeds;
        if (this._highlightSegment) {
          // ensure that the currently selected segment is highlighted
          this.highlight();
        }
      }
      this.setHighlightMarkerPosition();
    }

    Promise.resolve().then(() => this.adjustSelection());
    const affectedEmbeds: EditedVerseEmbeds[] = !!isUserEdit
      ? this.getEmbedsByEditPosition(delta, segmentsBeforeDelta, embedsBeforeDelta)
      : [];
    this.updated.emit({
      delta,
      prevSegment,
      segment: this._segment,
      affectedEmbeds,
      isLocalUpdate: isUserEdit
    });
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

  /** Gets the embeds affected by the position of each text edit in the delta. */
  private getEmbedsByEditPosition(
    delta?: DeltaStatic,
    segmentsBeforeDelta?: IterableIterator<[string, RangeStatic]>,
    embedsBeforeDelta?: Readonly<Map<string, EmbedPosition>>
  ): EditedVerseEmbeds[] {
    if (delta?.ops == null || segmentsBeforeDelta == null || embedsBeforeDelta == null) {
      return [];
    }

    let curIndex = 0;
    const editPositions: number[] = [];
    for (const op of delta.ops) {
      if (op.insert != null) {
        editPositions.push(curIndex);
      } else if (op.delete != null) {
        editPositions.push(curIndex);
        curIndex += op.delete;
      } else {
        // increase the current index by the value in the retain
        curIndex += op.retain == null ? 0 : op.retain;
      }
    }

    const embedsByEditedVerse: EditedVerseEmbeds[] = [];
    let verseEdited = false;
    let currentVerse: string = '';
    let currentVerseRange: RangeStatic = { index: 0, length: 0 };
    let embedsByVerse = new Map<string, EmbedPosition>();
    for (const [segment, range] of segmentsBeforeDelta) {
      const baseVerse: string = this.getBaseVerse(segment);
      if (currentVerse === '') {
        currentVerse = baseVerse;
        currentVerseRange = range;
      }
      if (currentVerse !== baseVerse) {
        if (verseEdited) {
          embedsByEditedVerse.push({
            embeds: embedsByVerse,
            verseRange: currentVerseRange
          });
        }
        embedsByVerse = new Map<string, EmbedPosition>();
        currentVerse = baseVerse;
        currentVerseRange = range;
        verseEdited = false;
      } else {
        currentVerseRange.length += range.length;
      }

      const editPositionsWithinRange: number[] = editPositions.filter(
        pos => pos >= range.index && pos <= range.index + range.length
      );
      if (editPositionsWithinRange.length > 0 && !verseEdited) {
        // only include verses where an edit has occurred
        verseEdited = true;
      }

      for (const [embedId, embedPosition] of embedsBeforeDelta.entries()) {
        if (embedPosition.position >= range.index && embedPosition.position < range.index + range.length) {
          embedsByVerse.set(embedId, embedPosition);
        }
      }
    }

    // set the embeds for the final verse
    if (verseEdited) {
      embedsByEditedVerse.push({
        embeds: embedsByVerse,
        verseRange: currentVerseRange
      });
    }
    return embedsByEditedVerse;
  }

  private updateSegment(): void {
    if (this._segment == null) {
      return;
    }

    const baseVerse: string = this.getBaseVerse(this._segment.ref);
    const startSegmentRange: RangeStatic | undefined = this.viewModel.getSegmentRange(baseVerse);
    const segmentRange: RangeStatic | undefined = this.viewModel.getSegmentRange(this._segment.ref);
    if (segmentRange == null) {
      return;
    }

    const endIndex: number = this.getVerseEndIndex(baseVerse) ?? segmentRange.index + segmentRange.length;
    const startIndex: number = startSegmentRange?.index ?? segmentRange.index;
    const text = this.viewModel.getSegmentText(this._segment.ref);
    const verseEmbeddedElements: Map<string, EmbedPosition> = new Map<string, EmbedPosition>();
    for (const [threadId, embedPosition] of this.embeddedElements.entries()) {
      if (embedPosition.position >= startIndex && embedPosition.position < endIndex) {
        verseEmbeddedElements.set(threadId, embedPosition);
      }
    }
    this._segment.update(text, segmentRange, verseEmbeddedElements);
  }

  private getVerseEndIndex(baseRef: string): number | undefined {
    // Look for the related segments of the base verse, and use the final related verse to determine the end index
    const relatedRefs: string[] = this.viewModel.getRelatedSegmentRefs(baseRef);
    const rangeLast: RangeStatic | undefined = this.viewModel.getSegmentRange(relatedRefs[relatedRefs.length - 1]);
    return rangeLast == null ? undefined : rangeLast.index + rangeLast.length;
  }

  private getBaseVerse(segmentRef: string): string {
    const matchArray: RegExpExecArray | null = VERSE_REGEX.exec(segmentRef);
    return matchArray == null ? segmentRef : matchArray[0];
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
      newSel = { index: this._segment.range.index + this._segment.range.length, length: 0 };
    } else if (!this.multiSegmentSelection) {
      // selections outside of the text chooser dialog are not permitted to extend across segments
      let newStart = Math.max(sel.index, this._segment.range.index);
      const oldEnd = sel.index + sel.length;
      const segEnd = this._segment.range.index + this._segment.range.length;
      const newEnd = Math.min(oldEnd, segEnd);

      const embedIndices: number[] = this.viewModel.embeddedPositions.sort();
      if (newStart === this._segment.range.index || embedIndices.includes(newStart - 1)) {
        // if the selection is before an embed at the start of the segment or
        // the selection is between embeds, move the selection behind it
        while (embedIndices.includes(newStart)) {
          newStart++;
        }
      }

      // while (embedIndices.includes(newStart - 1)) {
      //   newStart--;
      // }
      newSel = { index: newStart, length: Math.max(0, newEnd - newStart) };
    }
    if (newSel != null && (sel.index !== newSel.index || sel.length !== newSel.length)) {
      this._editor.setSelection(newSel, 'user');
    }
  }

  /** Returns the number of embedded elements that are located at or after editorStartPos, through length of editor
   * positions to check.
   */
  private getEmbedCountInRange(editorStartPos: number, length: number): number {
    const embedPositions: number[] = this.viewModel.embeddedPositions;
    return embedPositions.filter((pos: number) => pos >= editorStartPos && pos < editorStartPos + length).length;
  }

  /**
   * Notes that get inserted by the delta are removed from the editor to clean up duplicates.
   * i.e. The user triggers an undo after deleting a note.
   */
  private deleteDuplicateNoteIcons(delta: DeltaStatic): void {
    if (this.editor == null || delta.ops == null) {
      return;
    }
    /*
    // Delta for the removal of notes that were re-created
    let notesDeletionDelta: DeltaStatic | undefined;
    const productiveOps = this.trimUnproductiveOps(delta);
    if (productiveOps.ops == null) {
      return;
    }
    for (const op of productiveOps.ops) {
      if (op.insert != null && op.insert['note-thread-embed'] != null) {
        const embedId: string = op.insert['note-thread-embed']['threadid'];
        const deletePosition = this.embeddedElements.get(embedId);
        if (deletePosition != null) {
          const noteDeleteOps: DeltaOperation[] = [{ retain: deletePosition.position }, { delete: 1 }];
          const noteDeleteOpDelta = new Delta(noteDeleteOps);
          notesDeletionDelta =
            notesDeletionDelta == null ? noteDeleteOpDelta : noteDeleteOpDelta.compose(notesDeletionDelta);
        }
      }
    }

    if (notesDeletionDelta != null) {
      notesDeletionDelta.chop();
      // Defer the update so that the current delta can be processed
      // Promise.resolve(notesDeletionDelta).then(deleteDelta => {
      //   this.editor?.updateContents(deleteDelta, 'api');
      // });
    }
    */
  }

  /**
   * Trims out the unproductive ops from a delta emitted by Quill's onContentChanged event.
   * This is used to determine which ops accurately represents the change applied to the editor,
   * more specifically, trim out object inserts like note thread embeds that did not truly get inserted.
   */
  private trimUnproductiveOps(delta: DeltaStatic): DeltaStatic {
    // The quill way of determining changes applied to its content doesn't work perfectly on non-text objects
    // and the result in the delta is a series of object inserts followed by a delete op that removes
    // the original object inserts. This trims out those ops from this delta so the delta is a true representation
    // of the changes applied to the text.
    // For example, a delta may contain [ retain: 10, insert: blank, insert: verse, insert: note, delete: 2 ]
    // where the delete: 2 op deletes the original verse and note inserts that get replaced in this delta
    const productiveOps: DeltaStatic = cloneDeep(delta);
    if (productiveOps.ops == null || productiveOps.ops.length < 2) {
      return delta;
    }
    const opCount: number = productiveOps.ops.length;
    // find the trailing delete op
    const lastDeleteOp: number | undefined = productiveOps.ops[opCount - 1].delete;
    let deleteCount: number = lastDeleteOp ?? 0;
    if (deleteCount === 0) {
      return delta;
    }

    for (let i = 0; i < deleteCount; i++) {
      const curIndex: number = opCount - i - 2;
      const insertObj = productiveOps.ops[curIndex].insert;
      if (insertObj != null && typeof insertObj !== 'string') {
        // the object insert may be a false op
        continue;
      }
      // the op is productive, so keep the entire delta
      return delta;
    }
    productiveOps.ops.splice(opCount - 1 - deleteCount);
    return productiveOps;
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

    const project = (await this.projectService.getProfile(this.id.projectId)).data;
    if (project == null) {
      return;
    }

    this.lang = project.writingSystem.tag;
  }
}
