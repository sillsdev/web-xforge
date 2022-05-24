import { EventEmitter } from '@angular/core';
import cloneDeep from 'lodash-es/cloneDeep';
import Quill, { DeltaOperation, DeltaStatic, RangeStatic, Sources, StringMap } from 'quill';
import QuillCursors from 'quill-cursors';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { Subscription } from 'rxjs';
import { LocalPresence, Presence } from 'sharedb/lib/sharedb';
import tinyColor from 'tinycolor2';
import { objectId } from 'xforge-common/utils';
import { Delta, TextDoc } from '../../core/models/text-doc';
import { MultiCursorViewer } from '../../translate/editor/multi-viewer/multi-viewer.component';
import { isBadDelta, VERSE_FROM_SEGMENT_REF_REGEX } from '../utils';
import { getAttributesAtPosition } from './quill-scripture';
import { USFM_STYLE_DESCRIPTIONS } from './usfm-style-descriptions';

const PARA_STYLES: Set<string> = new Set<string>([
  // Paragraphs
  'p',
  'm',
  'po',
  'pr',
  'cls',
  'pmo',
  'pm',
  'pmc',
  'pmr',
  'pi',
  'mi',
  'pc',
  'ph',
  'lit',

  // Poetry
  'q',
  'qr',
  'qc',
  'qa',
  'qm',
  'qd',

  // Lists
  'lh',
  'li',
  'lf',
  'lim'
]);

function canParaContainVerseText(style: string): boolean {
  if (style === '') {
    return true;
  }
  style = style.replace(/[0-9]/g, '');
  return PARA_STYLES.has(style);
}

function getParagraphRef(nextIds: Map<string, number>, key: string, prefix: string): string {
  let nextId = nextIds.get(key);
  if (nextId == null) {
    nextId = 1;
  }
  const id = nextId++;
  nextIds.set(key, nextId);
  return prefix + '_' + id;
}

function setAttribute(op: DeltaOperation, attributes: StringMap, name: string, value: any): void {
  if (op.attributes == null || op.attributes[name] !== value) {
    attributes[name] = value;
  }
}

function removeAttribute(op: DeltaOperation, name: string): void {
  if (op.attributes != null && name in op.attributes) {
    delete op.attributes[name];
    if (Object.keys(op.attributes).length === 0) {
      delete op.attributes;
    }
  }
}

/** Provides information about a range of text that includes the embedded elements */
export interface EditorRange {
  startEditorPosition: number;
  editorLength: number;
  embedsWithinRange: number;
  /** Count of sequential embeds leading off the range */
  leadingEmbedCount: number;
  /** Count of sequential embeds immediately following the range */
  trailingEmbedCount: number;
}

export interface PresenceData {
  viewer: MultiCursorViewer;
  range: RangeStatic;
}

export interface RemotePresences {
  [id: string]: PresenceData;
}

class SegmentInfo {
  length: number = 0;
  origRef?: string;
  containsBlank: boolean = false;
  notesCount: number = 0;
  isVerseNext: boolean = false;
  hasInitialFormat: boolean = false;

  get isInitial(): boolean {
    return this.isVerseNext && (!this.ref.startsWith('verse') || this.ref.includes('/'));
  }

  constructor(public ref: string, public index: number) {}
}

/**
 * This class is responsible for keeping the the data model and the view model for a text in sync. This class currently
 * only supports differences in attributes between the data model and the view model. It also helps to keep the models
 * consistent and correct.
 */
export class TextViewModel {
  readonly cursorColor: string;
  enablePresenceReceive: boolean = false;
  editor?: Quill;
  localPresence?: LocalPresence<PresenceData>;

  private readonly _segments: Map<string, RangeStatic> = new Map<string, RangeStatic>();
  private readonly presenceId: string = objectId();
  private readonly cursorColorStorageKey = 'cursor_color';
  private presence?: Presence<PresenceData>;
  private remoteChangesSub?: Subscription;
  private onCreateSub?: Subscription;
  private textDoc?: TextDoc;
  /**
   * A mapping of IDs of elements embedded into the quill editor to their positions.
   * These elements are in addition to the text data i.e. Note threads
   */
  private _embeddedElements: Map<string, number> = new Map<string, number>();

  private onPresenceReceive = (_presenceId: string, _presenceData: PresenceData | null) => {};

  constructor(private presenceChange?: EventEmitter<RemotePresences | undefined>) {
    let localCursorColor = localStorage.getItem(this.cursorColorStorageKey);
    if (localCursorColor == null) {
      // keep the cursor color from getting too close to white since the text is white
      localCursorColor = tinyColor({ s: 0.7, l: 0.5, h: Math.random() * 360 }).toHexString();
      localStorage.setItem(this.cursorColorStorageKey, localCursorColor);
    }
    this.cursorColor = localCursorColor;
  }

  get segments(): IterableIterator<[string, RangeStatic]> {
    return this._segments.entries();
  }

  get embeddedElements(): Map<string, number> {
    return this._embeddedElements;
  }

  get isLoaded(): boolean {
    return this.textDoc != null && this.textDoc.isLoaded;
  }

  get isEmpty(): boolean {
    if (this.textDoc == null || this.textDoc.data == null) {
      return true;
    }
    const textData = this.textDoc.data;
    return textData.ops == null || textData.ops.length === 0;
  }

  get areOpsCorrupted(): boolean {
    return this.textDoc?.isLoaded === true && this.textDoc.data?.ops != null && isBadDelta(this.textDoc.data.ops);
  }

  bind(textDoc: TextDoc, subscribeToUpdates: boolean): void {
    const editor = this.checkEditor();
    if (this.textDoc != null) {
      this.unbind();
    }

    this.textDoc = textDoc;
    editor.setContents(this.textDoc.data as DeltaStatic);
    editor.history.clear();
    if (subscribeToUpdates) {
      this.remoteChangesSub = this.textDoc.remoteChanges$.subscribe(ops => {
        const deltaWithEmbeds: DeltaStatic = this.addEmbeddedElementsToDelta(ops as DeltaStatic);
        editor.updateContents(deltaWithEmbeds, 'api');
      });
    }
    this.onCreateSub = this.textDoc.create$.subscribe(() => {
      if (textDoc.data != null) {
        editor.setContents(textDoc.data as DeltaStatic);
      }
      editor.history.clear();
    });

    this.presence = textDoc.docPresence;
    this.presence.subscribe(error => {
      if (error) throw error;
    });
    this.localPresence = this.presence.create(this.presenceId);

    const cursors: QuillCursors = editor.getModule('cursors');
    this.onPresenceReceive = (presenceId: string, presenceData: PresenceData | null) => {
      if (presenceData == null) {
        cursors.removeCursor(presenceId);
        this.presenceChange?.emit(this.presence?.remotePresences);
        return;
      }
      if (!this.enablePresenceReceive) return;

      cursors.createCursor(presenceId, presenceData.viewer.displayName, presenceData.viewer.cursorColor);
      cursors.moveCursor(presenceId, presenceData.range);
      this.presenceChange?.emit(this.presence?.remotePresences);
    };
    this.presence.on('receive', this.onPresenceReceive);
  }

  unbind(): void {
    if (this.remoteChangesSub != null) {
      this.remoteChangesSub.unsubscribe();
    }
    if (this.onCreateSub != null) {
      this.onCreateSub.unsubscribe();
    }
    this.textDoc = undefined;

    this.presence?.unsubscribe(error => {
      if (error) throw error;
    });
    this.presence?.off('receive', this.onPresenceReceive);
    this.localPresence?.submit(null as unknown as PresenceData);

    if (this.editor != null) {
      this.editor.setText('', 'silent');
      const cursors: QuillCursors = this.editor.getModule('cursors');
      cursors.clearCursors();
      this.presenceChange?.emit(this.presence?.remotePresences);
    }
    this.presence = undefined;
    this._segments.clear();
    this._embeddedElements.clear();
  }

  /**
   * Updates the view model (textDoc), segment ranges, and slightly the Quill contents, such as in response to text
   * changing in the quill editor.
   *
   * @param {DeltaStatic} delta The view model delta.
   * @param {Sources} source The source of the change.
   */
  update(delta: DeltaStatic, source: Sources): void {
    const editor = this.checkEditor();
    if (this.textDoc == null) {
      return;
    }

    // The incoming change already happened in the quill editor. Now apply the change to the view model.
    if (source === 'user' && editor.isEnabled()) {
      const modelDelta = this.viewToData(delta);
      if (modelDelta.ops != null && modelDelta.ops.length > 0) {
        this.textDoc.submit(modelDelta, this.editor);
      }
    }

    // Re-compute segment boundaries so the insertion point stays in the right place.
    this.updateSegments(editor);

    // Defer the update, since it might cause the segment ranges to be out-of-sync with the view model
    Promise.resolve().then(() => {
      const updateDelta = this.updateSegments(editor);
      if (updateDelta.ops != null && updateDelta.ops.length > 0) {
        // Clean up blanks in quill editor. This may result in re-entering the update() method.
        editor.updateContents(updateDelta, source);
      }
    });
  }

  highlight(segmentRefs: string[]): void {
    const refs = new Set(segmentRefs);
    const editor = this.checkEditor();
    const delta = editor.getContents();
    const clearDelta = new Delta();
    if (delta.ops != null) {
      let highlightPara = false;
      for (const op of delta.ops) {
        const len = typeof op.insert === 'string' ? op.insert.length : 1;
        const attrs = op.attributes;
        let newAttrs: StringMap | undefined;
        if (attrs != null && attrs['segment'] != null) {
          if (refs.has(attrs['segment'])) {
            // highlight segment
            newAttrs = { 'highlight-segment': true };
            highlightPara = true;
          } else if (attrs['highlight-segment'] != null) {
            // clear highlight
            newAttrs = { 'highlight-segment': false };
          }
        } else if (op.insert === '\n' || (op.attributes != null && op.attributes.para != null)) {
          if (highlightPara) {
            // highlight para
            newAttrs = { 'highlight-para': true };
            highlightPara = false;
          } else if (attrs != null && attrs['highlight-para'] != null) {
            // clear highlight
            newAttrs = { 'highlight-para': false };
          }
        }
        clearDelta.retain(len, newAttrs);
      }
    }
    editor.updateContents(clearDelta, 'silent');
  }

  /**
   * Sets USFM descriptions on a segment in the document so CSS can read the data attribute and show a pseudo element
   * with the description. In order to properly place the pseudo element, the description needs to go on the first
   * segment of the paragraph, rather than the paragraph itself.
   * The strategy to accomplish this is as follows:
   * - Find the index of the op that inserts the currently highlighted segment.
   * - Find the style of the paragraph by finding the first style-setting op that comes after the segment's op (the
   * style comes after the paragraph it applies to).
   * - Find the start of the paragraph by finding the last style-setting op that comes before the highlighted segment's
   * op (this won't exist when the highlighted segment is in the first paragraph).
   * - Find the the first segment-creating op that comes after the end of the preceding paragraph, or the firs
   * segment-creating if there is no preceding paragraph).
   * - Apply the style description to that segment.
   */
  updateUsfmDescription(): void {
    const editor = this.checkEditor();
    const delta = editor.getContents();
    const clearDelta = new Delta();
    if (delta.ops == null) {
      return;
    }

    const highlightedSegmentIndex = delta.ops.findIndex(op => op.attributes?.['highlight-segment'] === true);
    const styleOpIndexes = delta.ops.map((op, i) => (op.attributes?.para?.style ? i : -1)).filter(i => i !== -1);

    // This may be -1 if there is no style specified
    const indexOfParagraphStyle = Math.min(...styleOpIndexes.filter(i => i > highlightedSegmentIndex));
    const style = delta.ops[indexOfParagraphStyle]?.attributes?.para?.style;
    const description = USFM_STYLE_DESCRIPTIONS[style];
    if (typeof description !== 'string' || style === 'p') {
      return;
    }

    // Math.max will return -Infinity when there is no preceding paragraph
    const precedingParagraphIndex = Math.max(...styleOpIndexes.filter(i => i < highlightedSegmentIndex));
    const indexOfFirstSegmentInParagraph = delta.ops.findIndex(
      (op, i) => i > precedingParagraphIndex && op.attributes?.segment != null
    );

    for (const [i, op] of delta.ops.entries()) {
      const len = typeof op.insert === 'string' ? op.insert.length : 1;
      clearDelta.retain(len, indexOfFirstSegmentInParagraph === i ? { 'style-description': description } : {});
    }
    editor.updateContents(clearDelta, 'silent');
  }

  hasSegmentRange(ref: string): boolean {
    return this._segments.has(ref);
  }

  getRelatedSegmentRefs(ref: string): string[] {
    return Array.from(this._segments.keys()).filter(r => r.indexOf(ref + '/') === 0);
  }

  /** Get the segments that fall within a given verse reference. A segment is considered
   * to be in the reference if (1) its ref is in the format verse_c_v or verse_c_v-w, and that
   * ref is within the given verse reference, or (2) its ref is not in that format, but the
   * first preceding segment with a ref in that format is within the given verse reference.
   * For example, the result for MAT 1:1 can be as follows: [verse_1_1, verse_1_1/p_1, s_1]
   */
  getVerseSegments(verseRef?: VerseRef): string[] {
    const segmentsInVerseRef: string[] = [];
    if (verseRef == null) {
      return segmentsInVerseRef;
    }
    const verses: VerseRef[] = verseRef.allVerses();
    const startVerseNum: number = verses[0].verseNum;
    const lastVerseNum: number = verses[verses.length - 1].verseNum;
    let matchStartNum = 0;
    let matchLastNum = 0;
    for (const segment of this._segments.keys()) {
      const match: RegExpExecArray | null = VERSE_FROM_SEGMENT_REF_REGEX.exec(segment);
      if (match != null) {
        // update numbers for the new verse
        const verseParts: string[] = match[1].split('-');
        matchStartNum = +verseParts[0];
        matchLastNum = +verseParts[verseParts.length - 1];
      }
      const matchStartsWithin = matchStartNum >= startVerseNum && matchStartNum <= lastVerseNum;
      const matchEndsWithin = matchLastNum >= startVerseNum && matchLastNum <= lastVerseNum;
      if (matchStartsWithin || matchEndsWithin) {
        segmentsInVerseRef.push(segment);
      }
    }
    return segmentsInVerseRef;
  }

  getSegmentRange(ref: string): RangeStatic | undefined {
    return this._segments.get(ref);
  }

  getSegmentText(ref: string): string {
    const editor = this.checkEditor();
    const range = this.getSegmentRange(ref);
    return range == null ? '' : editor.getText(range.index, range.length);
  }

  getSegmentContents(ref: string): DeltaStatic | undefined {
    const editor: Quill = this.checkEditor();
    const range: RangeStatic | undefined = this.getSegmentRange(ref);
    return range == null ? undefined : editor.getContents(range.index, range.length);
  }

  getSegmentRef(range: RangeStatic): string | undefined {
    let segmentRef: string | undefined;
    let maxOverlap = -1;
    if (range != null) {
      for (const [ref, segmentRange] of this.segments) {
        const segEnd = segmentRange.index + segmentRange.length;
        if (range.index <= segEnd) {
          const rangeEnd = range.index + range.length;
          const overlap = Math.min(rangeEnd, segEnd) - Math.max(range.index, segmentRange.index);
          if (overlap > maxOverlap) {
            segmentRef = ref;
            maxOverlap = overlap;
          }
          if (rangeEnd <= segEnd) {
            break;
          }
        }
      }
    }
    return segmentRef;
  }

  getNextSegmentRef(ref: string): string | undefined {
    let found = false;
    for (const segmentRef of this._segments.keys()) {
      if (found) {
        return segmentRef;
      } else if (segmentRef === ref) {
        found = true;
      }
    }
    return undefined;
  }

  getPrevSegmentRef(ref: string): string | undefined {
    let prevSegmentRef: string | undefined;
    for (const segmentRef of this._segments.keys()) {
      if (segmentRef === ref) {
        return prevSegmentRef;
      }
      prevSegmentRef = segmentRef;
    }
    return undefined;
  }

  /** Returns editor range information that corresponds to a text position past an editor position. */
  getEditorContentRange(startEditorPosition: number, textPosPast: number): EditorRange {
    const embedEditorPositions = Array.from(this.embeddedElements.values());
    const leadingEmbedCount = this.countSequentialEmbedsStartingAt(startEditorPosition);
    let resultingEditorPos = startEditorPosition + leadingEmbedCount;
    let textCharactersFound = 0;
    let embedsWithinRange = leadingEmbedCount;
    while (textCharactersFound < textPosPast) {
      if (!embedEditorPositions.includes(resultingEditorPos)) {
        textCharactersFound++;
      } else {
        embedsWithinRange++;
      }
      resultingEditorPos++;
    }
    // trailing embeds do not count towards embedsWithinRange
    const trailingEmbedCount: number = this.countSequentialEmbedsStartingAt(resultingEditorPos);
    return {
      startEditorPosition,
      editorLength: resultingEditorPos - startEditorPosition,
      embedsWithinRange,
      leadingEmbedCount,
      trailingEmbedCount
    };
  }

  private countSequentialEmbedsStartingAt(startEditorPosition: number): number {
    const embedEditorPositions = Array.from(this.embeddedElements.values());
    // add up the leading embeds
    let leadingEmbedCount = 0;
    while (embedEditorPositions.includes(startEditorPosition + leadingEmbedCount)) {
      leadingEmbedCount++;
    }
    return leadingEmbedCount;
  }

  private viewToData(delta: DeltaStatic): DeltaStatic {
    let modelDelta = new Delta();
    if (delta.ops != null) {
      for (const op of delta.ops) {
        const modelOp: DeltaOperation = cloneDeep(op);
        for (const attr of [
          'highlight-segment',
          'highlight-para',
          'para-contents',
          'question-segment',
          'question-count',
          'note-thread-segment',
          'note-thread-count',
          'text-anchor',
          'initial',
          'direction-segment',
          'direction-block',
          'style-description'
        ]) {
          removeAttribute(modelOp, attr);
        }
        (modelDelta as any).push(modelOp);
      }
      // Remove Paratext notes from model delta
      modelDelta = this.removeEmbeddedElementsFromDelta(modelDelta);
    }
    return modelDelta.chop();
  }

  /**
   * Re-generate segment boundaries from quill editor ops. Return ops to clean up where and whether blanks are
   * represented.
   */
  private updateSegments(editor: Quill): DeltaStatic {
    const convertDelta = new Delta();
    let fixDelta = new Delta();
    let fixOffset = 0;
    const delta = editor.getContents();
    this._segments.clear();
    this._embeddedElements.clear();
    if (delta.ops == null) {
      return convertDelta;
    }
    const nextIds = new Map<string, number>();
    let paraSegments: SegmentInfo[] = [];
    let chapter = '';
    let curIndex = 0;
    let curSegment: SegmentInfo | undefined;
    for (const op of delta.ops) {
      const attrs: StringMap = {};
      const len = typeof op.insert === 'string' ? op.insert.length : 1;
      if (op.insert === '\n' || (op.attributes != null && op.attributes.para != null)) {
        const style = op.attributes == null || op.attributes.para == null ? null : (op.attributes.para.style as string);
        if (style == null || canParaContainVerseText(style)) {
          // paragraph
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          for (const _ch of op.insert) {
            if (curSegment != null) {
              paraSegments.push(curSegment);
              curIndex += curSegment.length;
              curSegment = new SegmentInfo(curSegment.ref, curIndex + 1);
            }
            if (style != null) {
              // only get the paragraph ref if it is needed, since it updates the nextIds map
              if (paraSegments.length === 0) {
                const paraRef = getParagraphRef(nextIds, style, style);
                paraSegments.push(new SegmentInfo(paraRef, curIndex));
              } else if (paraSegments[0].ref === '') {
                const paraRef = getParagraphRef(nextIds, style, style);
                paraSegments[0].ref = paraRef;
              }
            } else if (paraSegments.length > 0) {
              // remove blank at the beginning of an implicit paragraph
              paraSegments.shift();
            }

            for (const paraSegment of paraSegments) {
              if (this._segments.has(paraSegment.ref) && paraSegment.ref.startsWith('verse')) {
                paraSegment.ref = getParagraphRef(nextIds, paraSegment.ref, paraSegment.ref + '/' + style);
              }

              [fixDelta, fixOffset] = this.fixSegment(editor, paraSegment, fixDelta, fixOffset);
              this._segments.set(paraSegment.ref, { index: paraSegment.index, length: paraSegment.length });
            }
            paraSegments = [];
            curIndex++;
          }
        } else if (style === 'b') {
          // blank line
          paraSegments = [];
          if (curSegment != null) {
            curIndex += curSegment.length;
          }
          curIndex += len;
          curSegment = undefined;
        } else {
          // title/header
          if (curSegment == null) {
            curSegment = new SegmentInfo('', curIndex);
          }
          curSegment.ref = getParagraphRef(nextIds, style, style);
          [fixDelta, fixOffset] = this.fixSegment(editor, curSegment, fixDelta, fixOffset);
          this._segments.set(curSegment.ref, { index: curSegment.index, length: curSegment.length });
          paraSegments = [];
          curIndex += curSegment.length + len;
          curSegment = undefined;
        }
      } else if (op.insert.chapter != null) {
        // chapter
        chapter = op.insert.chapter.number;
        curIndex += len;
        curSegment = undefined;
      } else if (op.insert.verse != null) {
        // verse
        if (curSegment != null) {
          curSegment.isVerseNext = true;
          paraSegments.push(curSegment);
          curIndex += curSegment.length;
        } else if (paraSegments.length === 0) {
          paraSegments.push(new SegmentInfo('', curIndex));
        }
        setAttribute(op, attrs, 'para-contents', true);
        curIndex += len;
        curSegment = new SegmentInfo('verse_' + chapter + '_' + op.insert.verse.number, curIndex);
      } else {
        // segment
        setAttribute(op, attrs, 'para-contents', true);
        if (curSegment == null) {
          curSegment = new SegmentInfo('', curIndex);
        }
        const opSegRef = op.attributes != null && op.attributes['segment'] != null ? op.attributes['segment'] : '';
        if (curSegment.origRef == null) {
          curSegment.origRef = opSegRef;
        } else if (curSegment.origRef !== opSegRef) {
          curSegment.origRef = '';
        }
        curSegment.length += len;
        if (op.insert != null && op.insert.blank != null) {
          curSegment.containsBlank = true;
          if (op.attributes != null && op.attributes['initial'] === true) {
            curSegment.hasInitialFormat = true;
          }
        } else if (op.insert['note-thread-embed'] != null) {
          // record the presence of an embedded note in the segment
          const id = op.attributes != null && op.attributes['threadid'];
          this._embeddedElements.set(id, curIndex + curSegment.length - 1);
          curSegment.notesCount++;
        }
      }
      convertDelta.retain(len, attrs);
    }

    return convertDelta.compose(fixDelta).chop();
  }

  /** Computes and adds to `fixDelta` a change to add or remove a blank indication as needed on `segment`, and other
   * fixes. */
  private fixSegment(
    editor: Quill,
    segment: SegmentInfo,
    fixDelta: DeltaStatic,
    fixOffset: number
  ): [DeltaStatic, number] {
    if (segment.length - segment.notesCount === 0) {
      // insert blank
      const delta = new Delta();
      // insert blank after any existing notes
      delta.retain(segment.index + segment.notesCount + fixOffset);
      const attrs: any = { segment: segment.ref, 'para-contents': true, 'direction-segment': 'auto' };
      if (segment.isInitial) {
        attrs.initial = true;
      }
      delta.insert({ blank: true }, attrs);
      fixDelta = fixDelta.compose(delta);
      fixOffset++;
    } else if (segment.containsBlank && segment.length - segment.notesCount > 1) {
      // The segment contains a blank and there is text other than translation notes
      // delete blank
      const delta = new Delta().retain(segment.index + fixOffset + segment.notesCount).delete(1);
      fixDelta = fixDelta.compose(delta);
      fixOffset--;
      const sel = editor.getSelection();
      if (sel != null && sel.index === segment.index && sel.length === 0) {
        // if the segment is no longer blank, ensure that the selection is at the end of the segment.
        // Sometimes after typing in a blank segment, the selection will be at the beginning. This seems to be a bug
        // in Quill.
        Promise.resolve().then(() => editor.setSelection(segment.index + segment.length - 1, 0, 'user'));
      }
    } else if (segment.containsBlank && segment.length === 1 && !segment.hasInitialFormat && segment.isInitial) {
      const delta = new Delta();
      delta.retain(segment.index + fixOffset);
      delta.retain(1, { initial: true });
      fixDelta = fixDelta.compose(delta);
    } else if (segment.ref !== segment.origRef) {
      // fix segment ref
      const delta = new Delta()
        .retain(segment.index + fixOffset)
        .retain(segment.length, { segment: segment.ref, 'para-contents': true });
      fixDelta = fixDelta.compose(delta);
    }
    return [fixDelta, fixOffset];
  }

  private checkEditor(): Quill {
    if (this.editor == null) {
      throw new Error('The editor has not been assigned.');
    }
    return this.editor;
  }

  /**
   * Strip off the embedded elements displayed in quill from the delta. This can be used to convert a delta from
   * user edits to apply to a text doc.
   */
  private removeEmbeddedElementsFromDelta(modelDelta: DeltaStatic): DeltaStatic {
    if (modelDelta.ops == null || modelDelta.ops.length < 1) {
      return new Delta();
    }
    const adjustedDelta = new Delta();
    let curIndex: number = 0;
    for (const op of modelDelta.ops) {
      let cloneOp: DeltaOperation | undefined = cloneDeep(op);
      if (cloneOp.retain != null) {
        const embedsInRange: number = this.getEmbedsInEditorRange(curIndex, cloneOp.retain);
        curIndex += cloneOp.retain;
        // remove from the retain op the number of embedded elements contained in its content
        cloneOp.retain -= embedsInRange;
      } else if (cloneOp.delete != null) {
        const embedsInRange: number = this.getEmbedsInEditorRange(curIndex, cloneOp.delete);
        curIndex += cloneOp.delete;
        // remove from the delete op the number of embedded elements contained in its content
        cloneOp.delete -= embedsInRange;
        if (cloneOp.delete < 1) {
          cloneOp = undefined;
        }
      } else if (cloneOp.insert != null && cloneOp.insert['note-thread-embed'] != null) {
        cloneOp = undefined;
      }

      if (cloneOp != null) {
        (adjustedDelta as any).push(cloneOp);
      }
    }

    return adjustedDelta;
  }

  /**
   * Add in the embedded elements displayed in quill to the delta. This can be used to convert a delta from a remote
   * edit to apply to the current editor content.
   */
  private addEmbeddedElementsToDelta(modelDelta: DeltaStatic): DeltaStatic {
    if (modelDelta.ops == null || modelDelta.ops.length < 1) {
      return new Delta();
    }
    const adjustedDelta = new Delta();
    let curIndex: number = 0;
    let embedsUpToIndex: number = 0;
    let previousOp: 'retain' | 'insert' | 'delete' | undefined;
    let editorStartPos: number = 0;
    for (const op of modelDelta.ops) {
      let cloneOp: DeltaOperation = cloneDeep(op);
      editorStartPos = curIndex + embedsUpToIndex;
      if (cloneOp.retain != null) {
        // editorStartPos must be the current index plus the number of embeds previous
        const editorRange: EditorRange = this.getEditorContentRange(editorStartPos, cloneOp.retain);
        embedsUpToIndex += editorRange.embedsWithinRange;
        curIndex += cloneOp.retain;
        let embedsToRetain: number = editorRange.embedsWithinRange;
        // remove any embeds subsequent to the previous insert so they can be redrawn in the right place
        if (editorRange.leadingEmbedCount > 0 && previousOp === 'insert') {
          (adjustedDelta as any).push({ delete: editorRange.leadingEmbedCount } as DeltaOperation);
          embedsToRetain -= editorRange.leadingEmbedCount;
        }
        // add to the retain op the number of embedded elements contained in its content
        cloneOp.retain += embedsToRetain;
        previousOp = 'retain';
      } else if (cloneOp.delete != null) {
        const editorRange: EditorRange = this.getEditorContentRange(editorStartPos, cloneOp.delete);
        curIndex += cloneOp.delete;
        embedsUpToIndex += editorRange.embedsWithinRange;
        // add to the delete op the number of embedded elements contained in its content
        cloneOp.delete += editorRange.embedsWithinRange;
        if (cloneOp.delete < 1) {
          continue;
        }
        previousOp = 'delete';
      } else if (cloneOp.insert != null) {
        cloneOp.attributes = getAttributesAtPosition(this.checkEditor(), editorStartPos);
        previousOp = 'insert';
      }
      (adjustedDelta as any).push(cloneOp);
    }

    editorStartPos = curIndex + embedsUpToIndex;
    // remove any embeds subsequent the previous insert so they can be redrawn
    const embedsAfterLastEdit = this.countSequentialEmbedsStartingAt(editorStartPos);
    if (embedsAfterLastEdit > 0 && previousOp === 'insert') {
      (adjustedDelta as any).push({ delete: embedsAfterLastEdit } as DeltaOperation);
    }

    return adjustedDelta;
  }

  /** Gets the number of embeds in a given range displayed in the quill editor. */
  private getEmbedsInEditorRange(startIndex: number, length: number): number {
    const indices: IterableIterator<number> = this._embeddedElements.values();
    const opEndIndex: number = startIndex + length;
    let embeddedElementsCount: number = 0;
    for (const embedIndex of indices) {
      if (embedIndex < startIndex) {
        continue;
      } else if (embedIndex >= startIndex && embedIndex < opEndIndex) {
        embeddedElementsCount++;
      } else {
        break;
      }
    }
    return embeddedElementsCount;
  }
}
