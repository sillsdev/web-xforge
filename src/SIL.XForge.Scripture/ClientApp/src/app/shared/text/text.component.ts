import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output
} from '@angular/core';
import { TranslocoService } from '@ngneat/transloco';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { isEqual, merge } from 'lodash-es';
import Quill, { Delta, EmitterSource, Range } from 'quill';
import QuillCursors from 'quill-cursors';
import { AuthType, getAuthType } from 'realtime-server/lib/esm/common/models/user';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextAnchor } from 'realtime-server/lib/esm/scriptureforge/models/text-anchor';
import { StringMap } from 'rich-text';
import { fromEvent, Subject, Subscription, timer } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LocalPresence, Presence } from 'sharedb/lib/sharedb';
import tinyColor from 'tinycolor2';
import { DialogService } from 'xforge-common/dialog.service';
import { LocaleDirection } from 'xforge-common/models/i18n-locale';
import { UserDoc } from 'xforge-common/models/user-doc';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { getBrowserEngine, objectId } from 'xforge-common/utils';
import { environment } from '../../../environments/environment';
import { isString } from '../../../type-utils';
import { NoteThreadIcon } from '../../core/models/note-thread-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TextDocService } from '../../core/text-doc.service';
import { MultiCursorViewer } from '../../translate/editor/multi-viewer/multi-viewer.component';
import {
  attributeFromMouseEvent,
  getBaseVerse,
  getVerseRefFromSegmentRef,
  getVerseStrFromSegmentRef,
  VERSE_REGEX
} from '../utils';
import { QuillFormatRegistryService } from './quill-editor-registration/quill-format-registry.service';
import { getAttributesAtPosition, getRetainCount } from './quill-util';
import { Segment } from './segment';
import { NoteDialogData, TextNoteDialogComponent } from './text-note-dialog/text-note-dialog.component';
import { EditorRange, TextViewModel } from './text-view-model';

// When a user is active in the editor a timer starts to mark them as inactive for remote presences
export const PRESENCE_EDITOR_ACTIVE_TIMEOUT = 3500;
export const EDITOR_READY_TIMEOUT = 100;

export interface TextUpdatedEvent {
  delta?: Delta;
  prevSegment?: Segment;
  segment?: Segment;
  affectedEmbeds?: EmbedsByVerse[];
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

export interface PresenceData {
  viewer: MultiCursorViewer;
}

export interface RemotePresences {
  [id: string]: PresenceData;
}

/** A verse's range and the embeds located within the range. */
export interface EmbedsByVerse {
  verseRange: Range;
  embeds: Map<string, number>;
}

/** View of an editable text document. Used for displaying Scripture. */
@Component({
  selector: 'app-text',
  templateUrl: './text.component.html',
  styleUrls: ['./text.component.scss'],
  providers: [TextViewModel] // New instance for each text component
})
export class TextComponent implements AfterViewInit, OnDestroy {
  @Input() enablePresence: boolean = false;
  @Input() markInvalid: boolean = false;
  @Input() multiSegmentSelection = false;
  @Input() subscribeToUpdates = true;
  @Input() selectableVerses: boolean = false;
  @Input() showInsights: boolean = false;
  @Output() updated = new EventEmitter<TextUpdatedEvent>(true);
  @Output() segmentRefChange = new EventEmitter<string>();
  @Output() loaded = new EventEmitter<boolean>(true);
  @Output() focused = new EventEmitter<boolean>(true);
  @Output() presenceChange = new EventEmitter<RemotePresences | undefined>(true);
  @Output() editorCreated = new EventEmitter<void>();

  lang: string = '';
  // only use USX formats and not default Quill formats
  readonly allowedFormats: string[] = this.quillFormatRegistry.getRegisteredFormats();
  // allow for different CSS based on the browser engine
  readonly browserEngine: string = getBrowserEngine();
  readonly cursorColor: string;

  private clickSubs: Map<string, Subscription[]> = new Map<string, Subscription[]>();
  private _isReadOnly: boolean = true;
  private _editorStyles: any = { fontSize: '1rem' };
  private activePresenceSubscription?: Subscription;
  private onDeleteSub?: Subscription;
  private localSystemChangesSub?: Subscription;
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
          key: 'Backspace',
          altKey: null,
          ctrlKey: null,
          metaKey: null,
          shiftKey: null,
          handler: (range: Range) => this.isBackspaceAllowed(range)
        },
        'disable backspace word': {
          key: 'Backspace',
          ctrlKey: true,
          handler: (range: Range) => this.handleBackspaceWord(range)
        },
        'disable delete': {
          key: 'Delete',
          handler: (range: Range) => this.isDeleteAllowed(range)
        },
        'disable delete word': {
          key: 'Delete',
          ctrlKey: true,
          handler: (range: Range) => this.handleDeleteWord(range)
        },
        'disable enter': {
          key: 'Enter',
          shiftKey: null,
          handler: () => false
        },
        'disable backslash': {
          key: 220,
          shiftKey: null,
          handler: () => false
        },
        'move next, tab': {
          key: 'Tab',
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
          key: 'Tab',
          shiftKey: true,
          handler: () => this.movePrevSegment()
        },
        'move next, segment end, right arrow': {
          key: 'ArrowRight',
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
          key: 'ArrowLeft',
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
          key: 'y',
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
    clipboard: { textComponent: this },
    dragAndDrop: {}
  };
  private _id?: TextDocId;
  private _isRightToLeft: boolean = false;
  private _modules: any = this.DEFAULT_MODULES;
  private _editor?: Quill;
  private _segment?: Segment;
  private contentSet: boolean = false;
  /** State that the component is in with respect to loading content. */
  private loadingState:
    | 'loading'
    | 'offline-or-loading'
    | 'no-content'
    | 'empty-viewModel'
    | 'unloaded'
    | 'permission-denied' = 'loading';
  private initialTextFetched: boolean = false;
  private initialSegmentRef?: string;
  private initialSegmentChecksum?: number;
  private initialSegmentFocus?: boolean;
  private _highlightSegment: boolean = false;
  private highlightMarker?: HTMLElement;
  private _selectionBoundsTop: number = 0;
  private highlightMarkerHeight: number = 0;
  private _placeholder?: string;
  private currentUserDoc?: UserDoc;
  private readonly cursorColorStorageKey = 'cursor_color';
  private isDestroyed: boolean = false;
  private localPresenceChannel?: LocalPresence<PresenceData>;
  private localPresenceDoc?: LocalPresence<Range | null>;
  private localCursorElement?: HTMLElement | null;
  private localCursorMovingTimeout?: any;
  private readonly presenceId: string = objectId();
  /** The ShareDB presence information for the TextDoc that the quill is bound to. */
  private presenceDoc?: Presence<Range>;
  private presenceChannel?: Presence<PresenceData>;
  private presenceActiveEditor$: Subject<boolean> = new Subject<boolean>();
  private onPresenceDocReceive = (_presenceId: string, _range: Range | null): void => {};
  private onPresenceChannelReceive = (_presenceId: string, _presenceData: PresenceData | null): void => {};

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly dialogService: DialogService,
    private readonly projectService: SFProjectService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly transloco: TranslocoService,
    private readonly userService: UserService,
    readonly viewModel: TextViewModel,
    private readonly textDocService: TextDocService,
    private readonly quillFormatRegistry: QuillFormatRegistryService
  ) {
    let localCursorColor = localStorage.getItem(this.cursorColorStorageKey);
    if (localCursorColor == null) {
      // keep the cursor color from getting too close to white since the text is white
      localCursorColor = tinyColor({ s: 0.7, l: 0.5, h: Math.random() * 360 }).toHexString();
      localStorage.setItem(this.cursorColorStorageKey, localCursorColor);
    }
    this.cursorColor = localCursorColor;
    this.userService.getCurrentUser().then((userDoc: UserDoc) => {
      this.currentUserDoc = userDoc;
      this.currentUserDoc.changes$
        .pipe(quietTakeUntilDestroyed(this.destroyRef, { logWarnings: false }))
        .subscribe(() => this.submitLocalPresenceChannel(true));
    });
  }

  @Input() set isReadOnly(value: boolean) {
    this._isReadOnly = value;
  }

  get areOpsCorrupted(): boolean {
    return this.viewModel.areOpsCorrupted;
  }

  /** Message for Quill to display when there is no content loaded to display. */
  get placeholder(): string {
    switch (this.loadingState) {
      case 'loading':
        // We are working to show the content soon.
        return this.transloco.translate('text.loading');
      case 'no-content':
        // There isn't any content to show, even if we were online. Setting the placeholder Input customizes this
        // no-content message.
        return this._placeholder ?? this.transloco.translate('text.book_does_not_exist');
      case 'offline-or-loading':
        if (this.onlineStatusService.isOnline) {
          return this.transloco.translate('text.loading');
        } else {
          // We can't show content because we need to come online to fetch it.
          return this.transloco.translate('text.not_available_offline');
        }
      case 'empty-viewModel':
        return this.transloco.translate('text.book_is_empty');
      case 'permission-denied':
        return this.transloco.translate('text.permission_denied');
      case 'unloaded':
      default:
        return '';
    }
  }

  @Input() set placeholder(value: string | undefined) {
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
        this.bindQuill(); // not awaited
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

  get selectionBoundsTop(): number {
    return this._selectionBoundsTop;
  }

  get scrollPosition(): number {
    return this.editor == null ? 0 : this.editor.root.scrollTop;
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

  get editor(): Quill | undefined {
    return this._editor;
  }

  get segment(): Segment | undefined {
    return this._segment;
  }

  get segments(): IterableIterator<[string, Range]> {
    return this.viewModel.segments;
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

  get textDirection(): LocaleDirection | 'auto' {
    if (this.contentShowing) {
      return this.isRtl ? 'rtl' : 'ltr';
    }
    return 'auto';
  }

  get embeddedElements(): Readonly<Map<string, number>> {
    return this.viewModel.embeddedElements;
  }

  get currentSegmentOrDefault(): string | undefined {
    if (this._segment != null) {
      return this._segment.ref;
    }
    return this.firstVerseSegment;
  }

  get firstVerseSegment(): string | undefined {
    for (const [segmentRef] of this.segments) {
      if (getBaseVerse(segmentRef) != null) {
        return segmentRef;
      }
    }
    return undefined;
  }

  get contentShowing(): boolean {
    return (this.id != null && this.viewModel.isLoaded && !this.viewModel.isEmpty) || this.contentSet;
  }

  private set highlightMarkerVisible(value: boolean) {
    if (!this._isReadOnly && this._id?.textType === 'target' && this.highlightMarker != null) {
      this.highlightMarker.style.visibility = value ? '' : 'hidden';
    }
  }

  /**
   * Is presence enabled and currently available to use
   */
  private get isPresenceActive(): boolean {
    return this.isPresenceEnabled && this.onlineStatusService.isOnline;
  }

  /**
   * Is presence enabled for use on the editor
   */
  private get isPresenceEnabled(): boolean {
    return this.enablePresence;
  }

  get projectId(): string {
    return this.id?.projectId ?? '';
  }

  get userProjects(): string[] {
    return this.currentUserDoc?.data?.sites[environment.siteId]?.projects ?? [];
  }

  ngAfterViewInit(): void {
    this.onlineStatusService.onlineStatus$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(isOnline => {
      this.changeDetector.detectChanges();

      if (!isOnline && this._editor != null) {
        this.clearCursors(false); // Don't clear the local cursor
      }
    });

    // Listening to document 'selectionchange' event allows local cursor to change position on mousedown,
    // as opposed to quill 'onSelectionChange' event that doesn't fire until mouseup.
    fromEvent<MouseEvent>(document, 'selectionchange')
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.updateLocalCursor();
      });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.viewModel?.unbind();
    this.loadingState = 'unloaded';
    this.dismissPresences();
    this.onDeleteSub?.unsubscribe();
    this.localSystemChangesSub?.unsubscribe();
  }

  onEditorCreated(editor: Quill): void {
    this._editor = editor;
    this.highlightMarker = this._editor.addContainer('highlight-marker');
    if (this.highlightMarker != null) {
      this.highlightMarker.style.visibility = 'hidden';
    }
    fromEvent(this._editor.root, 'scroll')
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.updateHighlightMarkerVisibility());
    fromEvent(window, 'resize')
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.setHighlightMarkerPosition());
    this.viewModel.editor = editor;
    this.bindQuill(); // not awaited
    editor.container.addEventListener('beforeinput', (ev: Event) => this.onBeforeinput(ev));
    this.editorCreated.emit();
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

  getSegmentRange(ref: string): Range | undefined {
    return this.viewModel.getSegmentRange(ref);
  }

  getSegmentText(ref: string): string {
    return this.viewModel.getSegmentText(ref);
  }

  getSegmentContents(ref: string): Delta | undefined {
    return this.viewModel.getSegmentContents(ref);
  }

  getVerseSegments(verseRef?: VerseRef): string[] {
    return this.viewModel.getVerseSegments(verseRef);
  }

  /**
   * Get segments compatible for a given verseRef. For verses with letters, only return the segments
   * that explicitly contain the letter or non-verse segment in the range.
   * i.e. LUK 1:1a will match segments verse_1_1a, verse_1_1a/p1, s_1 but not verse_1_1 or verse_1_1b.
   */
  getCompatibleSegments(verseRef: VerseRef): string[] {
    const segments: string[] = this.getVerseSegments(verseRef);
    const defaultValue: string = verseRef.verse;
    return segments.filter(s => verseRef.verse === (getVerseStrFromSegmentRef(s) ?? defaultValue));
  }

  getVerseSegmentsNoHeadings(verseRef: VerseRef): string[] {
    const segments: string[] = this.getVerseSegments(verseRef);
    return segments.filter(s => VERSE_REGEX.test(s));
  }

  getSegmentElement(segment: string): Element | null {
    return this.editor == null ? null : this.editor.container.querySelector(`usx-segment[data-segment="${segment}"]`);
  }

  getViewerPosition(presenceId: string): Range | undefined {
    return Object.entries(this.presenceDoc?.remotePresences ?? {}).find(([id, _data]) => id === presenceId)?.[1];
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
      let featuredVerseSegments: string[] =
        featureName === 'question' ? this.getVerseSegmentsNoHeadings(verseRef) : this.getVerseSegments(verseRef);
      featuredVerseSegments = this.filterSegments(featuredVerseSegments);
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
    role: string,
    textAnchor: TextAnchor,
    formatName: string,
    format: any
  ): string | undefined {
    if (this.editor == null) {
      return undefined;
    }

    // A single verse can be associated with multiple compatible segments (e.g verse_1_1, verse_1_1/p_1)
    const verseSegments: string[] = this.getCompatibleSegments(verseRef);
    if (verseSegments.length === 0) {
      return undefined;
    }
    let editorPosOfSegmentToModify: Range | undefined = this.getSegmentRange(verseSegments[0]);
    let startTextPosInVerse: number = textAnchor.start;
    if (Array.from(this.viewModel.embeddedElements.keys()).includes(id)) {
      return undefined;
    }

    let embedSegmentRef: string = verseSegments[0];
    const nextSegmentMarkerLength = 1;
    const blankSegmentLength = 1;
    for (const vs of verseSegments) {
      const editorPosOfSomeSegment: Range | undefined = this.getSegmentRange(vs);
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
      }
    }

    if (editorPosOfSegmentToModify == null) {
      return undefined;
    }

    const editorRange: EditorRange = this.viewModel.getEditorContentRange(
      editorPosOfSegmentToModify.index,
      startTextPosInVerse
    );
    const embedInsertPos: number =
      editorRange.startEditorPosition + editorRange.editorLength + editorRange.trailingEmbedCount;
    let insertFormat = this.editor.getFormat(embedInsertPos);

    // Include formatting from the current insert position as well as any unique formatting
    format = { ...insertFormat, ...format };
    this.editor.insertEmbed(embedInsertPos, formatName, format, 'api');
    const textAnchorRange = this.viewModel.getEditorContentRange(embedInsertPos, textAnchor.length);
    const formatLength: number = textAnchorRange.editorLength;

    // Add text anchors as a separate formatText call rather than part of insertEmbed as it needs to expand over a
    // a length of text
    if (role !== SFProjectRole.Commenter) {
      // Formatting for text anchors only need the text-anchor property when inserted at position zero
      if (textAnchor.start === 0) {
        insertFormat = {};
      }
      const segmentLastPosition: number = editorPosOfSegmentToModify.index + editorPosOfSegmentToModify.length;
      if (segmentLastPosition === embedInsertPos) {
        // the last position needs the segment format info
        insertFormat = { ...insertFormat, ...{ 'text-anchor': true } };
      } else {
        insertFormat = { 'text-anchor': true };
      }
      this.editor.formatText(embedInsertPos, formatLength, insertFormat, 'api');
    }
    this.updateSegment();
    return embedSegmentRef;
  }

  formatEmbed(embedId: string, embedName: string, format: any): void {
    const position: number | undefined = this.embeddedElements.get(embedId);
    if (position != null && this.editor != null) {
      this.editor.formatText(position, 1, embedName, format, 'api');
    }
  }

  get commenterSelection(): Range[] {
    const ret: Range[] = [];
    if (this.editor == null) return ret;
    for (const segment of this.viewModel.segments) {
      const range = segment[1];
      const formats = getAttributesAtPosition(this.editor, range.index);
      if (formats['commenter-selection'] === true) {
        ret.push(range);
      }
    }

    return ret;
  }

  toggleVerseSelection(verseRef: VerseRef): boolean {
    if (this.editor == null) return false;
    const verseSegments: string[] = this.filterSegments(this.getCompatibleSegments(verseRef));
    const verseRange: Range | undefined = this.getSegmentRange(verseSegments[0]);
    let selectionValue: true | null = true;
    if (verseRange != null) {
      const formats: StringMap = getAttributesAtPosition(this.editor, verseRange.index);
      selectionValue = formats['commenter-selection'] ? null : true;
    }

    const format: StringMap = { ['commenter-selection']: selectionValue };
    let verseEmbedFormatted: boolean = false;
    for (const segment of verseSegments) {
      // only underline the selection if it is part of the verse text i.e. not a section heading
      if (!VERSE_REGEX.test(segment)) continue;
      const range: Range | undefined = this.getSegmentRange(segment);
      if (range != null) {
        if (!verseEmbedFormatted) {
          // add the formatting to the verse embed on the first iteration
          this.editor.formatText(range.index - 1, 1, format, 'api');
          verseEmbedFormatted = true;
        }
        this.editor.formatText(range.index, range.length, format, 'api');
      }
    }
    return selectionValue === true;
  }

  /** Respond to text changes in the quill editor. */
  onContentChanged(delta: Delta, source: string): void {
    const preDeltaSegmentCache: IterableIterator<[string, Range]> = this.viewModel.segmentsSnapshot;
    const preDeltaEmbedCache: Readonly<Map<string, number>> = this.viewModel.embeddedElementsSnapshot;
    this.viewModel.update(delta, source as EmitterSource, this.onlineStatusService.isOnline);
    // skip updating when only formatting changes occurred
    if (delta.ops != null && delta.ops.some(op => op.insert != null || op.delete != null)) {
      const isUserEdit: boolean = source === 'user';
      this.update(delta, preDeltaSegmentCache, preDeltaEmbedCache, isUserEdit);
    }

    this.updateLocalCursor();
  }

  async onSelectionChanged(range: Range | null): Promise<void> {
    this.update();
    this.submitLocalPresenceDoc(range);
  }

  clearHighlight(): void {
    this.highlight([]);
  }

  highlight(segmentRefs?: string[]): void {
    if (this._id == null) {
      return;
    }
    if (segmentRefs == null && this._segment != null) {
      // baseVerse will be null for extra verse content (i.e. mt_1, s_1)
      const baseVerse: VerseRef | undefined = getVerseRefFromSegmentRef(this._id.bookNum, this._segment.ref);
      segmentRefs = baseVerse == null ? [this._segment.ref] : this.getVerseSegments(baseVerse);
      // segmentRefs = this.getVerseSegments(baseVerse);
    }
    if (segmentRefs == null) {
      this.highlightMarkerVisible = false;
      return;
    }

    segmentRefs = this.filterSegments(segmentRefs, false);
    // this changes the underlying HTML, which can mess up some Quill events, so defer this call
    Promise.resolve(segmentRefs).then(refs => {
      this.viewModel.highlight(refs);
      if (!this.readOnlyEnabled) {
        this.viewModel.updateUsfmDescription();
      }
    });

    this.highlightMarkerVisible = segmentRefs.length > 0;
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
    for (const embedIndex of this.viewModel.embeddedElements.values()) {
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

  scrollToViewer(viewer: MultiCursorViewer): void {
    if (this.editor == null || this.presenceChannel?.remotePresences == null) {
      return;
    }
    const presenceId: string | undefined = Object.entries(this.presenceChannel?.remotePresences ?? {}).find(
      ([_id, data]) => data.viewer === viewer
    )?.[0];
    if (presenceId == null) {
      return;
    }
    const range: Range | undefined = this.getViewerPosition(presenceId);
    if (range == null) {
      this.editor.root.scrollTop = 0;
      return;
    }
    this.editor.setSelection(range);
    this.editor.blur();
    const presenceData: PresenceData = {
      viewer: { ...viewer, activeInEditor: true }
    };
    this.onPresenceChannelReceive(presenceId, presenceData);
    const active$ = timer(3000).subscribe(() => {
      presenceData.viewer.activeInEditor = false;
      this.onPresenceChannelReceive(presenceId, presenceData);
      active$.unsubscribe();
    });
  }

  isSegmentBlank(ref: string): boolean {
    const segmentDelta: Delta | undefined = this.getSegmentContents(ref);
    if (segmentDelta?.ops == null) {
      return false;
    }
    for (const op of segmentDelta.ops) {
      if (!isString(op.insert) && op.insert?.blank != null) {
        return true;
      }
    }
    return false;
  }

  /** Is a given selection range valid for editing the current segment? */
  isValidSelectionForCurrentSegment(sel: Range): boolean {
    const newSel: Range | null = this.conformToValidSelectionForCurrentSegment(sel);
    return !(newSel == null || sel.index !== newSel.index || sel.length !== newSel.length);
  }

  // Triggered for Quill editor component (onFocus) and (onBlur) events.
  // Don't toggle focus on Quill (focusout) event, as this causes editor to fail to highlight active segment
  // until an (onBlur) event is triggered.
  toggleFocus(focus: boolean): void {
    this.focused.emit(focus);
  }

  setContents(delta: Delta, source?: EmitterSource): void {
    if (this._editor != null) {
      this._editor.setContents(delta, source);
      this.contentSet = true;
    }
  }

  applyEditorStyles(): void {
    if (this._editor != null) {
      const container = this._editor.container as HTMLElement;
      for (const style in this.editorStyles) {
        if (style in container.style) {
          container.style[style] = this.editorStyles[style];
        }
      }
    }
  }

  /** Does the project referred to by this.id contain metadata for a book, with a chapter, as specified by this.id? In
   * other words, does the project "have" the book and chapter, whether or not it has been downloaded to the client's
   * IndexedDB? */
  async projectHasText(): Promise<boolean> {
    if (this.id == null) throw new Error('Invalid state. id is null.');
    const id: TextDocId = this.id;

    if (!this.userProjects?.includes(this.projectId)) {
      this.loadingState = 'permission-denied';
      return false;
    }
    const profile: SFProjectProfileDoc = await this.projectService.getProfile(this.projectId);
    if (profile.data == null) throw new Error('Failed to fetch project profile.');
    if (
      profile.data.texts.some(
        text => text.bookNum === id.bookNum && text.chapters.some(chapter => chapter.number === id.chapterNum)
      )
    ) {
      return true;
    }
    this.loadingState = 'no-content';
    return false;
  }

  private attachPresences(textDoc: TextDoc): void {
    if (!this.isPresenceEnabled || this.editor == null) {
      return;
    }
    const cursors: QuillCursors = this.editor.getModule('cursors') as QuillCursors;

    // Subscribe to TextDoc specific presence changes - these only include Range updates from ShareDB
    this.presenceDoc = textDoc.docPresence;
    this.presenceDoc.subscribe(error => {
      if (error) throw error;
    });
    this.localPresenceDoc = this.presenceDoc.create(this.presenceId);

    this.onPresenceDocReceive = (presenceId: string, range: Range | null) => {
      if (range == null || !this.isPresenceActive) {
        cursors.removeCursor(presenceId);
        return;
      }
      const viewer: MultiCursorViewer | undefined = this.getPresenceViewer(presenceId);
      if (viewer == null) {
        return;
      }
      cursors.createCursor(presenceId, viewer.displayName, viewer.cursorColor);
      cursors.moveCursor(presenceId, range);
    };
    this.presenceDoc.on('receive', this.onPresenceDocReceive);

    // Subscribe to a generic channel for the TextDoc to keep track of who is viewing the document
    // This includes those who may not have focus on the Quill editor
    this.presenceChannel = textDoc.channelPresence;
    this.presenceChannel.subscribe(error => {
      if (error) throw error;
    });
    this.localPresenceChannel = this.presenceChannel.create(this.presenceId);

    this.onPresenceChannelReceive = (presenceId: string, presenceData: PresenceData | null) => {
      if (!this.isPresenceActive) {
        cursors.removeCursor(presenceId);
        this.presenceChange?.emit();
      } else {
        if (presenceData != null) {
          cursors.toggleFlag(presenceId, presenceData.viewer.activeInEditor);
        }
        this.presenceChange?.emit(this.presenceChannel?.remotePresences);
      }
    };
    this.presenceChannel.on('receive', this.onPresenceChannelReceive);
    this.submitLocalPresenceChannel(false);
  }

  private async bindQuill(): Promise<void> {
    // bindQuill can be called after the view was destroyed via onEditorCreated or the id being set in a Promise
    if (this.isDestroyed) {
      return;
    }
    this.loadingState = 'loading';

    this.viewModel.unbind();
    await this.dismissPresences();
    if (this._id == null) {
      this.loadingState = 'no-content';
      return;
    }

    if (!(await this.projectHasText())) {
      return;
    }

    // Fetch the text. This could be blocked indefinitely if offline until getText returns. If we are offline but have
    // the text in IndexedDB, we will unfortunately briefly show that a book is unavailable offline, before it loads.
    // But if getText does not return, then we are showing a good message.
    this.loadingState = 'offline-or-loading';
    const textDoc = await this.projectService.getText(this._id);
    this.loadingState = 'loading';
    this.viewModel.bind(this._id, textDoc, this.subscribeToUpdates);
    if (this.viewModel.isEmpty) this.loadingState = 'empty-viewModel';

    this.attachPresences(textDoc);
    if (this.onDeleteSub != null) {
      this.onDeleteSub.unsubscribe();
    }
    this.onDeleteSub = textDoc.delete$.subscribe(async () => {
      this.viewModel.unbind();
      // Unset these to stop any additional events that might try to submit a presence update
      this.localPresenceChannel = undefined;
      this.localPresenceDoc = undefined;
      // Remove all presence data from the interface i.e. cursors and avatars
      await this.dismissPresences();
      // Completely disable it to avoid any other interactions from events
      this.enablePresence = false;
      this.loadingState = 'unloaded';
      this._id = undefined;
    });

    // Local system changes are big - usually complete rewrites of the document via TextDocService.overwrite()
    // As these are user initiated, it is OK to complete reload the editor, as the user will not be in the editor
    this.localSystemChangesSub?.unsubscribe();
    this.localSystemChangesSub = this.textDocService.getLocalSystemChanges$(this._id).subscribe(() => {
      this.bindQuill();
    });

    this.loaded.emit(true);
    this.applyEditorStyles();
    // These refer to footnotes, cross-references, and end notes and not actual notes
    const elements = this.editor?.container.querySelectorAll('usx-note');
    if (elements != null) {
      this.clickSubs.get('notes')?.forEach(s => s.unsubscribe());
      this.clickSubs.set(
        'notes',
        Array.from(elements).map((element: Element) =>
          fromEvent<MouseEvent>(element, 'click')
            .pipe(quietTakeUntilDestroyed(this.destroyRef))
            .subscribe(event => {
              const noteText = attributeFromMouseEvent(event, 'USX-NOTE', 'title');
              const noteType = attributeFromMouseEvent(event, 'USX-NOTE', 'data-style');
              this.dialogService.openMatDialog(TextNoteDialogComponent, {
                width: '600px',
                data: {
                  type: noteType,
                  text: noteText,
                  isRightToLeft: this.isRtl
                } as NoteDialogData
              });
            })
        )
      );
    }

    this.createLocalCursor();
  }

  private createLocalCursor(): void {
    if (this.editor != null) {
      const cursors: QuillCursors = this.editor.getModule('cursors') as QuillCursors;
      cursors.createCursor(this.presenceId, '', '');

      this.localCursorElement = document.querySelector(`#ql-cursor-${this.presenceId}`);

      // Add a specific class to the local cursor
      if (this.localCursorElement != null) {
        this.localCursorElement.classList.add('local-cursor');
      }
    }
  }

  private updateLocalCursor(): void {
    if (this._editor == null || this._isReadOnly || !this.showInsights || this.localCursorElement == null) {
      return;
    }

    const sel: Selection | null = window.getSelection();
    if (sel == null) {
      return;
    }

    const selRangeLength: number = sel.focusOffset - sel.anchorOffset;

    if (selRangeLength !== 0) {
      // Hide the local cursor when there is a selection
      this.localCursorElement.classList.add('hidden');
    } else {
      this.localCursorElement.classList.remove('hidden');
      const blot = this._editor.scroll.find(sel.anchorNode);

      if (blot == null) {
        return;
      }

      const index: number = this._editor.getIndex(blot) + sel.anchorOffset;
      this.moveLocalCursor(index);
    }
  }

  private moveLocalCursor(index: number): void {
    if (this._editor == null || this._isReadOnly || this.localCursorElement == null) {
      return;
    }

    const cursors: QuillCursors = this._editor.getModule('cursors') as QuillCursors;
    cursors.moveCursor(this.presenceId, { index, length: 0 });

    // Set 'moving' class on caret that clears after a period of non-movement
    this.localCursorElement.classList.add('moving');

    if (this.localCursorMovingTimeout != null) {
      clearTimeout(this.localCursorMovingTimeout);
    }

    this.localCursorMovingTimeout = setTimeout(() => {
      this.localCursorElement?.classList.remove('moving');
    }, 200);
  }

  private clearCursors(includeLocal: boolean): void {
    if (this.editor != null) {
      const cursors: QuillCursors = this.editor.getModule('cursors') as QuillCursors;

      if (includeLocal) {
        cursors.clearCursors();
      } else {
        cursors.cursors().forEach(cursor => {
          if (cursor.id !== this.presenceId) {
            cursors.removeCursor(cursor.id);
          }
        });
      }
    }
  }

  private async dismissPresences(): Promise<void> {
    if (!this.isPresenceEnabled) {
      return;
    }

    await this.submitLocalPresenceChannel(null);
    await this.submitLocalPresenceDoc(null);

    if (this.editor != null) {
      this.clearCursors(true);
    }

    this.presenceChannel?.unsubscribe(error => {
      if (error) throw error;
    });
    this.presenceChannel?.off('receive', this.onPresenceChannelReceive);
    this.presenceChannel = undefined;

    this.presenceDoc?.unsubscribe(error => {
      if (error) throw error;
    });
    this.presenceDoc?.off('receive', this.onPresenceDocReceive);
    this.presenceDoc = undefined;
    const noRemotePresences: RemotePresences = {};
    this.presenceChange?.emit(noRemotePresences);
    if (this.activePresenceSubscription != null) {
      this.activePresenceSubscription.unsubscribe();
    }
  }

  private getPresenceViewer(presenceId: string): MultiCursorViewer | undefined {
    if (this.presenceChannel?.remotePresences != null) {
      const viewer = Object.entries(this.presenceChannel.remotePresences)
        .filter(remotePresence => remotePresence[0] === presenceId)
        .map(remotePresence => remotePresence[1].viewer);
      if (viewer.length > 0) {
        return viewer[0];
      }
    }
    return undefined;
  }

  private isSelectionAtSegmentPosition(end: boolean): boolean {
    if (this.editor == null || this.segment == null) {
      return false;
    }
    const selection: Range | null = this.editor.getSelection();
    if (selection == null) {
      return false;
    }

    // if the segment is blank, then we are always at the end
    if (this.segment.text === '') {
      return true;
    }

    // Strip embeds from the segment range so we can get can an accurate index and length
    const segmentRange: Range = this.conformToValidSelectionForCurrentSegment(this.segment.range) ?? this.segment.range;

    const selectionEndIndex = selection.index + (end ? selection.length : 0);
    const segmentEndIndex = segmentRange.index + (end ? segmentRange.length : 0);
    return selectionEndIndex === segmentEndIndex;
  }

  private isBackspaceAllowed(range: Range): boolean {
    if (this._editor == null) {
      return false;
    }

    if (!this.isValidSelectionForCurrentSegment(range)) {
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

  private handleBackspaceWord(range: Range): boolean {
    if (range.length > 0 || this._editor == null) return false;

    const wordRange: Range | undefined = this.getRangeForWordBeforeIndex(range.index);
    if (wordRange != null) {
      this._editor.deleteText(wordRange.index, wordRange.length, 'user');
    }
    return false;
  }

  private handleDeleteWord(range: Range): boolean {
    if (range.length > 0 || this._editor == null) return false;
    const wordRange: Range | undefined = this.getRangeForWordAfterIndex(range.index);
    if (wordRange != null) {
      this._editor.deleteText(wordRange.index, wordRange.length, 'user');
    }
    return false;
  }

  private isDeleteAllowed(range: Range): boolean {
    if (this._editor == null) {
      return false;
    }

    if (!this.isValidSelectionForCurrentSegment(range)) {
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

  private getRangeForWordBeforeIndex(selectionIndex: number): Range | undefined {
    if (this.segment == null || this._editor == null) return undefined;
    const segmentRange: Range | undefined = this.getSegmentRange(this.segment.ref);
    if (segmentRange == null) return undefined;

    const lengthFromSegmentStartToSelection: number = selectionIndex - segmentRange.index;
    const contents: Delta = this._editor.getContents(segmentRange.index, lengthFromSegmentStartToSelection);
    if (contents.ops == null) return undefined;

    const lastOp: any = contents.ops[contents.ops.length - 1].insert;
    if (lastOp == null || typeof lastOp !== 'string') return undefined;

    // only process the word range if the op is a string insert
    let wordLength: number = lastOp.length;
    let startOfWordIndex: number = selectionIndex - wordLength;
    const lastSpaceIndex = lastOp.trimEnd().lastIndexOf(' ');
    if (lastSpaceIndex >= 0) {
      // the segment text has a space, so find the length to the beginning of the word
      wordLength = lastOp.trimEnd().length - 1 - lastSpaceIndex;
      const trailingSpaces = lastOp.length - lastOp.trimEnd().length;
      // include the trailing spaces to the length of the word
      wordLength += trailingSpaces;
      startOfWordIndex = selectionIndex - wordLength;
    }
    return { index: startOfWordIndex, length: wordLength };
  }

  private getRangeForWordAfterIndex(selectionIndex: number): Range | undefined {
    if (this.segment == null || this._editor == null) return undefined;
    const segmentRange: Range | undefined = this.getSegmentRange(this.segment.ref);
    if (segmentRange == null) return undefined;

    const lengthToSegmentEnd: number = segmentRange.index + segmentRange.length - selectionIndex;
    const contents: Delta = this._editor.getContents(selectionIndex, lengthToSegmentEnd);
    if (contents.ops == null || contents.ops.length < 1) return undefined;

    const firstOp = contents.ops[0].insert;
    if (firstOp == null || typeof firstOp !== 'string') return undefined;

    // only process the word range if the op is a string insert
    let wordLength: number = firstOp.length;
    const firstSpaceIndex = firstOp.trimStart().indexOf(' ');
    if (firstSpaceIndex >= 0) {
      wordLength = firstSpaceIndex;
      const leadingSpacesCount: number = firstOp.length - firstOp.trimStart().length;
      // include the leading spaces to the length of the word
      wordLength += leadingSpacesCount;
    }
    return { index: selectionIndex, length: wordLength };
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

  private async submitLocalPresenceChannel(active: boolean | null): Promise<void> {
    if (!this.isPresenceActive || this.localPresenceChannel == null || this.currentUserDoc == null) {
      return;
    }

    let presenceData: PresenceData = null as unknown as PresenceData;
    if (active != null) {
      // In this particular instance, we can send extra information on the presence object. This ability will vary
      // depending on type.
      // If the avatar src is empty ('') then it generates one with the same background and cursor color
      // Do this for email/password accounts
      const authType: AuthType = getAuthType(this.currentUserDoc.data?.authId ?? '');
      const avatarUrl: string = authType === AuthType.Unknown ? '' : (this.currentUserDoc.data?.avatarUrl ?? '');
      presenceData = {
        viewer: {
          displayName: this.currentUserDoc.data?.displayName || this.transloco.translate('editor.anonymous'),
          avatarUrl,
          cursorColor: this.cursorColor,
          activeInEditor: active
        }
      };
      this.presenceActiveEditor$.next(active);
      if (active) {
        if (this.activePresenceSubscription != null) {
          this.activePresenceSubscription.unsubscribe();
        }
        this.activePresenceSubscription = timer(PRESENCE_EDITOR_ACTIVE_TIMEOUT)
          .pipe(takeUntil(this.presenceActiveEditor$))
          .subscribe(() => {
            this.submitLocalPresenceChannel(false);
          });
      }
    }
    this.localPresenceChannel.submit(presenceData, error => {
      if (error) throw error;
    });
  }

  private async submitLocalPresenceDoc(range: Range | null): Promise<void> {
    if (
      !this.isPresenceActive ||
      this.localPresenceDoc == null ||
      this.localPresenceDoc.value === range ||
      this._isReadOnly
    )
      return;

    this.localPresenceDoc.submit(range, error => {
      if (error) throw error;
    });
  }

  private update(
    delta?: Delta,
    preDeltaSegmentCache?: IterableIterator<[string, Range]>,
    preDeltaEmbedCache?: Readonly<Map<string, number>>,
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
        const curSegmentRange: Range = this.segment.range;
        const insertionPoint: number = getRetainCount(delta.ops[0]) ?? 0;
        const segmentEndPoint: number = curSegmentRange.index + curSegmentRange.length - 1;
        if (insertionPoint >= curSegmentRange.index && insertionPoint <= segmentEndPoint) {
          this._editor.setSelection(segmentEndPoint);
        }
      }
      // get currently selected segment ref
      const selection = this._editor.getSelection();
      if (selection != null) {
        segmentRef = this.viewModel.getSegmentRef(selection, this.segmentRef);
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
    const affectedEmbeds: EmbedsByVerse[] =
      isUserEdit === true ? this.getEmbedsAffectedByDelta(delta, preDeltaSegmentCache, preDeltaEmbedCache) : [];
    this.updated.emit({
      delta,
      prevSegment,
      segment: this._segment,
      affectedEmbeds,
      isLocalUpdate: isUserEdit
    });
    if (isUserEdit) {
      this.submitLocalPresenceChannel(true);
    }
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

    const originalSegmentRefRequest: string = segmentRef;

    // One project's chapter may have verses combined (eg "1-2"), or a verse split in paragraphs, differently than the
    // same chapter in another project. When the user clicks in a verse range, or in a paragraph of a verse, the segment
    // reference they clicked in in one TextComponent may or may not directly correspond to a segment in another
    // TextComponent's viewModel.
    if (!this.viewModel.hasSegmentRange(segmentRef)) {
      let resetSegment = true;

      // If verse segment ref has no exact match, check for segments that fall within a verse reference
      if (VERSE_REGEX.test(segmentRef)) {
        const [_, chapterNum, verseNum] = segmentRef.split('_');
        const verseRef: VerseRef = new VerseRef(Canon.bookNumberToId(this.id?.bookNum ?? 0), chapterNum, verseNum);
        const correspondingSegments: string[] = this.getVerseSegments(verseRef);

        if (correspondingSegments.length > 0) {
          segmentRef = correspondingSegments[0];
          resetSegment = false;
        }
      }

      if (resetSegment) {
        if (this._segment != null && this.highlightSegment) {
          this.clearHighlight();
        }
        this._segment = undefined;
        this.segmentRefChange.emit();
        return true;
      }
    }

    if (focus) {
      const selection = this._editor.getSelection();
      const selectedSegmentRef = selection == null ? null : this.viewModel.getSegmentRef(selection, this.segmentRef);
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
      if (this.viewModel.hasSegmentRange(originalSegmentRefRequest)) {
        this.highlight();
      } else {
        // If the requested segment was a verse range, highlight all segments in the range.
        const verseStr: string | undefined = getVerseStrFromSegmentRef(originalSegmentRefRequest);
        if (verseStr != null && this.id != null) {
          const verseRef: VerseRef = new VerseRef(
            Canon.bookNumberToId(this.id.bookNum),
            this.id.chapterNum.toString(),
            verseStr
          );
          const segmentsInVerseRange: string[] = this.getVerseSegments(verseRef);
          this.highlight(segmentsInVerseRange);
        }
      }
    }
    return true;
  }

  private updateSegment(): void {
    if (this._segment == null) {
      return;
    }

    const segmentRange: Range | undefined = this.viewModel.getSegmentRange(this._segment.ref);
    if (segmentRange == null) {
      return;
    }

    const text = this.viewModel.getSegmentText(this._segment.ref);
    this._segment.update(text, segmentRange);
  }

  /** Filter the final segments if blank and on a new line segment (i.e. verse_2_4/p_1)
   * Optionally filter extra verse segments (i.e. s_1)
   */
  private filterSegments(segmentRefs: string[], includeExtraVerseSegments = true): string[] {
    // do nothing if there is one or less segments
    if (segmentRefs.length <= 1) return segmentRefs;
    const filteredSegments: string[] = [...segmentRefs];
    let lastSegment: string = filteredSegments[filteredSegments.length - 1];
    while (filteredSegments.length > 1) {
      const isBlankNewlineSegment: boolean = /\/[pq]+/.test(lastSegment) && this.isSegmentBlank(lastSegment);
      if (!isBlankNewlineSegment && (includeExtraVerseSegments || VERSE_REGEX.test(lastSegment))) {
        break;
      }
      // remove the last segment if it is blank and is on a new line and not part of the verse
      filteredSegments.pop();
      lastSegment = filteredSegments[filteredSegments.length - 1];
    }
    return filteredSegments;
  }

  /** Gets the embeds affected */
  private getEmbedsAffectedByDelta(
    delta?: Delta,
    preDeltaSegmentCache?: IterableIterator<[string, Range]>,
    preDeltaEmbedCache?: Readonly<Map<string, number>>
  ): EmbedsByVerse[] {
    if (delta?.ops == null || preDeltaSegmentCache == null || preDeltaEmbedCache == null) {
      return [];
    }
    let verseIsEdited = false;
    let currentVerse: string = '';
    let currentVerseRange: Range = { index: 0, length: 0 };
    let embedsByVerse = new Map<string, number>();
    const editPositions: number[] = this.getEditPositionsInDelta(delta);
    const embedsByEditedVerse: EmbedsByVerse[] = [];
    // content before verse 1 are considered to be in verse 0
    let baseVerse: string = '0';
    for (const [segment, range] of preDeltaSegmentCache) {
      // if we cannot determine the base verse, consider it as part of the previous verse
      baseVerse = getBaseVerse(segment) ?? baseVerse;
      if (currentVerse === '') {
        // set the current verse and range on the first pass
        currentVerse = baseVerse;
        currentVerseRange = range;
      }
      if (currentVerse !== baseVerse) {
        // this segment belongs to a new verse, add the embeds if the previous verse has been edited
        if (verseIsEdited) {
          embedsByEditedVerse.push({ embeds: embedsByVerse, verseRange: currentVerseRange });
        }
        embedsByVerse = new Map<string, number>();
        currentVerse = baseVerse;
        currentVerseRange = range;
        verseIsEdited = false;
      } else {
        // Set length from start of verse
        currentVerseRange.length = range.index + range.length - currentVerseRange.index;
      }

      const editedPositionsWithinRange: number[] = editPositions.filter(
        pos => pos >= range.index && pos <= range.index + range.length
      );
      if (editedPositionsWithinRange.length > 0) {
        verseIsEdited = true;
      }

      for (const [embedId, embedPosition] of preDeltaEmbedCache.entries()) {
        if (embedPosition >= range.index && embedPosition < range.index + range.length) {
          embedsByVerse.set(embedId, embedPosition);
        }
      }
    }

    // set the embeds for the final verse
    if (verseIsEdited) {
      embedsByEditedVerse.push({ embeds: embedsByVerse, verseRange: currentVerseRange });
    }
    return embedsByEditedVerse;
  }

  private getEditPositionsInDelta(delta: Delta): number[] {
    let curIndex = 0;
    const editPositions: number[] = [];
    if (delta.ops == null) {
      return editPositions;
    }

    for (const op of delta.ops) {
      if (op.insert != null) {
        editPositions.push(curIndex);
      } else if (op.delete != null) {
        editPositions.push(curIndex);
        curIndex += op.delete;
      } else {
        // increase the current index by the value in the retain
        curIndex += getRetainCount(op) ?? 0;
      }
    }
    return editPositions;
  }

  /** Modify the current selection, if needed, to make the selection valid for editing the current segment. */
  private adjustSelection(): void {
    if (this._editor == null) {
      return;
    }
    const sel: Range | null = this._editor.getSelection();
    if (sel == null) {
      return;
    }

    const newSel: Range | null = this.conformToValidSelectionForCurrentSegment(sel);
    if (newSel != null && (sel.index !== newSel.index || sel.length !== newSel.length)) {
      this._editor.setSelection(newSel, 'user');
    }
  }

  /** Given a selection, return a possibly modified selection that is a valid for editing the current segment.
   * For example, a selection over a segment boundary is sometimes not valid. */
  private conformToValidSelectionForCurrentSegment(sel: Range): Range | null {
    if (this._editor == null || this._segment == null) {
      return null;
    }
    let newSel: Range | undefined;
    if (this._segment.text === '') {
      // always select at the end of blank so the cursor is inside the segment and not between the segment and verse
      newSel = { index: this._segment.range.index + this._segment.range.length, length: 0 };
    } else if (!this.multiSegmentSelection) {
      // selections outside of the text chooser dialog are not permitted to extend across segments

      const oldStart: number = sel.index;
      const oldEnd: number = sel.index + sel.length;
      const segStart: number = this._segment.range.index;
      const segEnd: number = this._segment.range.index + this._segment.range.length;

      let newStart: number = Math.max(oldStart, segStart);
      if (newStart > segEnd) {
        newStart = segEnd;
      }
      const newEnd: number = Math.min(oldEnd, segEnd);

      const embedPositions: number[] = Array.from(this.embeddedElements.values()).sort();
      if (newStart === this._segment.range.index || embedPositions.includes(newStart - 1)) {
        // if the selection is before an embed at the start of the segment or
        // the selection is between embeds, move the selection behind it
        while (embedPositions.includes(newStart)) {
          newStart++;
        }
      }
      newSel = { index: newStart, length: Math.max(0, newEnd - newStart) };
    } else {
      return null;
    }

    return newSel;
  }

  /** Handler for beforeinput event on quill DOM element. */
  private onBeforeinput(ev: Event): void {
    if (this._editor == null) {
      return;
    }
    const sel: Range | null = this._editor.getSelection();
    if (sel == null) {
      return;
    }
    if (!this.isValidSelectionForCurrentSegment(sel)) {
      ev.preventDefault();
    }
  }

  /** Returns the number of embedded elements that are located at or after editorStartPos, through length of editor
   * positions to check.
   */
  private getEmbedCountInRange(editorStartPos: number, length: number): number {
    const embedPositions: number[] = Array.from(this.embeddedElements.values());
    return embedPositions.filter((pos: number) => pos >= editorStartPos && pos < editorStartPos + length).length;
  }

  private setHighlightMarkerPosition(): void {
    if (this._editor == null || this.highlightMarker == null || this._segment == null) {
      return;
    }
    const range = this._segment.range;
    const bounds = this._editor.getBounds(range.index, range.length)!;
    this._selectionBoundsTop = bounds.top + this._editor.root.scrollTop;
    this.highlightMarkerHeight = bounds.height;
    this.highlightMarker.style.top = this._selectionBoundsTop + 'px';
    this.updateHighlightMarkerVisibility();
  }

  private updateHighlightMarkerVisibility(): void {
    if (this._editor == null || this.highlightMarker == null) {
      return;
    }

    const marginTop = -this._editor.root.scrollTop;
    const offsetTop = marginTop + this._selectionBoundsTop;
    const offsetBottom = offsetTop + this.highlightMarkerHeight;
    if (offsetTop < 0) {
      this.highlightMarker.style.marginTop = -this._selectionBoundsTop + 'px';
      const height = this.highlightMarkerHeight + offsetTop;
      this.highlightMarker.style.height = Math.max(height, 0) + 'px';
    } else if (offsetBottom > this._editor.root.clientHeight) {
      this.highlightMarker.style.marginTop = marginTop + 'px';
      const height = this._editor.root.clientHeight - offsetTop;
      this.highlightMarker.style.height = Math.max(height, 0) + 'px';
    } else {
      this.highlightMarker.style.marginTop = marginTop + 'px';
      this.highlightMarker.style.height = this.highlightMarkerHeight + 'px';
    }
  }

  private async setLangFromText(): Promise<void> {
    if (this.id == null) {
      return;
    }
    if (!this.userProjects?.includes(this.projectId)) {
      return;
    }
    const project = (await this.projectService.getProfile(this.projectId)).data;
    if (project == null) {
      return;
    }

    this.lang = project.writingSystem.tag;
  }
}
