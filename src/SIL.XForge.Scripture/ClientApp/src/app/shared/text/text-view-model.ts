import { Injectable, OnDestroy } from '@angular/core';
import { VerseRef } from '@sillsdev/scripture';
import { cloneDeep } from 'lodash-es';
import Quill, { Delta, EmitterSource, Range } from 'quill';
import { DeltaOperation, StringMap } from 'rich-text';
import { BehaviorSubject, Subscription } from 'rxjs';
import { isString } from '../../../type-utils';
import { TextDoc, TextDocId } from '../../core/models/text-doc';
import { LynxTextModelConverter } from '../../translate/editor/lynx/insights/lynx-editor';
import { getVerseStrFromSegmentRef, isBadDelta } from '../utils';
import { getAttributesAtPosition, getRetainCount } from './quill-util';
import { USFM_STYLE_DESCRIPTIONS } from './usfm-style-descriptions';

/** See also DeltaUsxMapper.cs ParagraphPoetryListStyles. */
const PARA_STYLES: Set<string> = new Set<string>([
  // Paragraphs
  'p',
  'nb',
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
  'lim',

  // Book
  'id'
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
  nextId ??= 1;
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

/** Represents the position of an embed. */
interface EmbedPosition {
  position: number;
  /**
   * The editor position of an embed with the same embed id as the one located at position.
   * When this is set it is necessary to clean up duplicate embeds as early as possible.
   */
  duplicatePosition?: number;
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

  constructor(
    public ref: string,
    public index: number
  ) {}
}

/**
 * This class is responsible for keeping the the data model and the view model for a text in sync. This class currently
 * only supports differences in attributes between the data model and the view model. It also helps to keep the models
 * consistent and correct.
 * See text.component.spec.ts for some unit tests.
 */
@Injectable()
export class TextViewModel implements OnDestroy, LynxTextModelConverter {
  editor?: Quill;

  private readonly _segments: Map<string, Range> = new Map<string, Range>();
  private changesSub?: Subscription;
  private onCreateSub?: Subscription;
  private textDoc?: TextDoc;
  private textDocId?: TextDocId;
  /**
   * A mapping of IDs of elements embedded into the quill editor to their positions.
   * These elements are in addition to the text data i.e. Note threads
   */
  private _embeddedElements: Map<string, EmbedPosition> = new Map<string, EmbedPosition>();

  segments$ = new BehaviorSubject<ReadonlyMap<string, Range>>(this._segments);

  get segments(): IterableIterator<[string, Range]> {
    return this._segments.entries();
  }

  get segmentsSnapshot(): IterableIterator<[string, Range]> {
    return cloneDeep(this._segments).entries();
  }

  get embeddedElements(): Map<string, number> {
    const embeddedElements: Map<string, number> = new Map<string, number>();
    for (const [embedId, embedPosition] of this._embeddedElements.entries()) {
      embeddedElements.set(embedId, embedPosition.position);
    }
    return embeddedElements;
  }

  get embeddedElementsSnapshot(): Map<string, number> {
    return cloneDeep(this.embeddedElements);
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

  private get embedPositions(): number[] {
    return this.embeddedElementPositions(Array.from(this._embeddedElements.values()));
  }

  ngOnDestroy(): void {
    this.unbind();
  }

  /** Associate the existing editor to a (single) specific textdoc. */
  bind(textDocId: TextDocId, textDoc: TextDoc, subscribeToUpdates: boolean): void {
    const editor = this.checkEditor();
    if (this.textDoc != null) {
      this.unbind();
    }

    this.textDocId = textDocId;
    this.textDoc = textDoc;
    editor.setContents(this.textDoc.data as Delta);
    editor.history.clear();

    if (subscribeToUpdates) {
      this.changesSub = this.textDoc.remoteChanges$.subscribe(ops => {
        const deltaWithEmbeds: Delta = this.addEmbeddedElementsToDelta(ops as Delta);
        editor.updateContents(deltaWithEmbeds, 'api');
      });
    }

    this.onCreateSub = this.textDoc.create$.subscribe(() => {
      if (textDoc.data != null) {
        editor.setContents(textDoc.data as Delta);
      }
      editor.history.clear();
    });
  }

  /** Break the association of the editor with the currently associated textdoc. */
  unbind(): void {
    this.changesSub?.unsubscribe();
    this.onCreateSub?.unsubscribe();
    this.textDoc = undefined;

    this.editor?.setText('', 'silent');
    this._segments.clear();
    this._embeddedElements.clear();
  }

  /**
   * Updates the view model (textDoc), segment ranges, and slightly the Quill contents, such as in response to text
   * changing in the quill editor.
   *
   * @param {Delta} delta The view model delta.
   * @param {EmitterSource} source The source of the change.
   * @param {boolean} isOnline Whether the user is online.
   */
  update(delta: Delta, source: EmitterSource, isOnline: boolean): void {
    const editor = this.checkEditor();
    if (this.textDoc == null) {
      return;
    }

    // The incoming change already happened in the quill editor. Now apply the change to the view model.
    if (source === 'user' && editor.isEnabled()) {
      const modelDelta = this.viewToData(delta);
      if (modelDelta.ops != null && modelDelta.ops.length > 0) {
        this.textDoc.submit(modelDelta, 'Editor');
      }
    }

    // Re-compute segment boundaries so the insertion point stays in the right place.
    this.updateSegments(editor, isOnline);

    // Defer the update, since it might cause the segment ranges to be out-of-sync with the view model
    Promise.resolve().then(() => {
      const updateDelta = this.updateSegments(editor, isOnline);
      if (updateDelta.ops != null && updateDelta.ops.length > 0) {
        // Clean up blanks in quill editor. This may result in re-entering the update() method.
        editor.updateContents(updateDelta, source);
      }

      const removeDuplicateDelta: Delta = this.fixDeltaForDuplicateEmbeds();
      if (removeDuplicateDelta.ops && removeDuplicateDelta.ops.length > 0) {
        editor.updateContents(removeDuplicateDelta, 'api');
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
        if (isString(attrs?.['segment'])) {
          if (refs.has(attrs['segment'])) {
            // highlight segment
            newAttrs = { 'highlight-segment': true };
            highlightPara = true;
          } else if (attrs['highlight-segment'] != null) {
            // clear highlight
            newAttrs = { 'highlight-segment': false };
          }
        } else if (
          op.insert === '\n' ||
          (op.attributes != null && (op.attributes.para != null || op.attributes.book != null))
        ) {
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
    const styleOpIndexes = delta.ops
      .map((op, i) => ((op.attributes?.para ?? (op.attributes?.book as any))?.style ? i : -1))
      .filter(i => i !== -1);

    // This may be -1 if there is no style specified
    const indexOfParagraphStyle = Math.min(...styleOpIndexes.filter(i => i > highlightedSegmentIndex));
    const style = (
      delta.ops[indexOfParagraphStyle]?.attributes?.para ?? (delta.ops[indexOfParagraphStyle]?.attributes?.book as any)
    )?.style;
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
    if (verseRef == null || !this.textDocId?.isSameBookAndChapter(verseRef)) {
      return segmentsInVerseRef;
    }
    const verses: VerseRef[] = verseRef.allVerses();
    const startVerseNum: number = verses[0].verseNum;
    const lastVerseNum: number = verses[verses.length - 1].verseNum;
    let matchStartNum = 0;
    let matchLastNum = 0;
    for (const segment of this._segments.keys()) {
      const verseStr: string | undefined = getVerseStrFromSegmentRef(segment);
      if (verseStr != null) {
        // update numbers for the new verse
        const verseParts: string[] = verseStr.split('-');
        matchStartNum = Number.parseInt(verseParts[0]);
        matchLastNum = Number.parseInt(verseParts[verseParts.length - 1]);
      }
      const matchStartsWithin: boolean = matchStartNum >= startVerseNum && matchStartNum <= lastVerseNum;
      const matchEndsWithin: boolean = matchLastNum >= startVerseNum && matchLastNum <= lastVerseNum;
      if (matchStartsWithin || matchEndsWithin) {
        segmentsInVerseRef.push(segment);
      }
    }
    return segmentsInVerseRef;
  }

  getSegmentRange(ref: string): Range | undefined {
    return this._segments.get(ref);
  }

  getSegmentText(ref: string): string {
    const editor = this.checkEditor();
    const range = this.getSegmentRange(ref);
    return range == null ? '' : editor.getText(range.index, range.length);
  }

  getSegmentContents(ref: string): Delta | undefined {
    const editor: Quill = this.checkEditor();
    const range: Range | undefined = this.getSegmentRange(ref);
    return range == null ? undefined : editor.getContents(range.index, range.length);
  }

  /**
   * Returns the segment reference with the most overlap of given range.
   * Preference is given to the specified segment if it is wholly contained within the range.
   */
  getSegmentRef(range: Range, preferRef?: string): string | undefined {
    let segmentRef: string | undefined;
    let maxOverlap = -1;

    if (range != null) {
      for (const [ref, segmentRange] of this.segments) {
        const segEnd = segmentRange.index + segmentRange.length;

        if (range.index <= segEnd) {
          const rangeEnd = range.index + range.length;
          const overlap = Math.min(rangeEnd, segEnd) - Math.max(range.index, segmentRange.index);

          // Prefer the specified segment if it is wholly within the selection range.
          // This way actions like 'select all' will select the current segment, not the longest segment.
          if (preferRef != null && overlap === segmentRange.length && preferRef === ref) {
            return ref;
          }

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
    const embedEditorPositions: number[] = this.embedPositions;
    const leadingEmbedCount: number = this.countSequentialEmbedsStartingAt(startEditorPosition);
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

  dataRangeToEditorRange(dataRange: Range): Range {
    const editor: Quill = this.checkEditor();
    const editorDelta: Delta = editor.getContents();

    if (editorDelta.ops == null || dataRange.length < 0) {
      return dataRange; // Return original as fallback
    }

    const targetStartIndex: number = dataRange.index;
    const targetEndIndex: number = dataRange.index + dataRange.length;
    const isZeroLengthRange: boolean = dataRange.length === 0;

    let editorPos: number = 0;
    let dataPos: number = 0;
    let startEditorPos: number = -1;
    let endEditorPos: number = -1;

    // Iterate ops, tracking parallel positions with/without note embeds.
    // Note embeds advance only editor position.
    // String inserts and other embeds advance both data and editor positions equally.
    for (const op of editorDelta.ops) {
      // Early exit if we've found both positions
      if (startEditorPos !== -1 && endEditorPos !== -1) {
        break;
      }

      if (op.insert == null) {
        continue;
      }

      // Note embeds only advance editor position
      if (op.insert?.['note-thread-embed'] != null) {
        editorPos++;
        continue;
      }

      const isStringInsert: boolean = isString(op.insert);
      const contentLength: number = isStringInsert ? (op.insert.length as number) : 1;

      // Skip content before target start
      if (startEditorPos === -1 && dataPos + contentLength <= targetStartIndex) {
        dataPos += contentLength;
        editorPos += contentLength;
        continue;
      }

      // Skip further processing if this content is after end position
      if (!isZeroLengthRange && startEditorPos !== -1 && dataPos >= targetEndIndex) {
        break;
      }

      // Check for start position
      if (startEditorPos === -1) {
        if (!isStringInsert) {
          // For embeds, only exact position matches
          if (dataPos === targetStartIndex) {
            startEditorPos = editorPos;
          }
        } else {
          // For strings, check if position is within string
          if (dataPos <= targetStartIndex && dataPos + contentLength > targetStartIndex) {
            startEditorPos = editorPos + (targetStartIndex - dataPos);
          }
        }

        if (isZeroLengthRange && startEditorPos !== -1) {
          return { index: startEditorPos, length: 0 };
        }
      }

      // Check for end position
      if (!isZeroLengthRange && endEditorPos === -1) {
        if (!isStringInsert) {
          // For embeds, only exact position matches
          if (dataPos === targetEndIndex) {
            endEditorPos = editorPos;
          }
        } else {
          // For strings, check if position is within string
          if (dataPos < targetEndIndex && dataPos + contentLength >= targetEndIndex) {
            endEditorPos = editorPos + (targetEndIndex - dataPos);
          }
        }
      }

      // Update positions
      dataPos += contentLength;
      editorPos += contentLength;
    }

    startEditorPos = startEditorPos === -1 ? editorPos : startEditorPos;
    endEditorPos = endEditorPos === -1 ? editorPos : endEditorPos;

    return { index: startEditorPos, length: endEditorPos - startEditorPos };
  }

  dataDeltaToEditorDelta(dataDelta: Delta): Delta {
    return this.addEmbeddedElementsToDelta(dataDelta);
  }

  private countSequentialEmbedsStartingAt(startEditorPosition: number): number {
    const embedEditorPositions = this.embedPositions;
    // add up the leading embeds
    let leadingEmbedCount = 0;
    while (embedEditorPositions.includes(startEditorPosition + leadingEmbedCount)) {
      leadingEmbedCount++;
    }
    return leadingEmbedCount;
  }

  private viewToData(delta: Delta): Delta {
    let modelDelta = new Delta();
    if (delta.ops != null) {
      for (const op of delta.ops) {
        const modelOp: DeltaOperation = cloneDeep(op);
        for (const attr of [
          'commenter-selection',
          'delete-segment',
          'direction-block',
          'direction-segment',
          'draft',
          'highlight-para',
          'highlight-segment',
          'initial',
          'insert-segment',
          'lynx-insight-error',
          'lynx-insight-info',
          'lynx-insight-warning',
          'note-thread-count',
          'note-thread-segment',
          'para-contents',
          'question-count',
          'question-segment',
          'style-description',
          'text-anchor'
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
  private updateSegments(editor: Quill, isOnline: boolean): Delta {
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
      if (op.insert === '\n' || op.attributes?.para != null || op.attributes?.book != null) {
        const style: string | null = (op.attributes?.para ?? (op.attributes?.book as any))?.style;
        if (style == null || canParaContainVerseText(style)) {
          // paragraph
          for (const _ch of op.insert as any) {
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

              [fixDelta, fixOffset] = this.fixSegment(editor, paraSegment, fixDelta, fixOffset, isOnline);
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
          if (curSegment != null) {
            // continue with the current segment at the current index
            curSegment = new SegmentInfo(curSegment.ref, curIndex);
          }
        } else {
          // title/header
          curSegment ??= new SegmentInfo('', curIndex);
          curSegment.ref = getParagraphRef(nextIds, style, style);
          [fixDelta, fixOffset] = this.fixSegment(editor, curSegment, fixDelta, fixOffset, isOnline);
          this._segments.set(curSegment.ref, { index: curSegment.index, length: curSegment.length });
          paraSegments = [];
          curIndex += curSegment.length + len;
          curSegment = undefined;
        }
      } else if ((op.insert as any).chapter != null) {
        // chapter
        chapter = (op.insert as any).chapter.number;
        curIndex += len;
        curSegment = undefined;
      } else if ((op.insert as any).verse != null) {
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
        curSegment = new SegmentInfo('verse_' + chapter + '_' + (op.insert as any).verse.number, curIndex);
      } else {
        // segment
        setAttribute(op, attrs, 'para-contents', true);
        curSegment ??= new SegmentInfo('', curIndex);
        const opSegRef: string = op.attributes?.['segment'] != null ? (op.attributes['segment'] as string) : '';
        if (curSegment.origRef == null) {
          curSegment.origRef = opSegRef;
        } else if (curSegment.origRef !== opSegRef) {
          curSegment.origRef = '';
        }
        curSegment.length += len;
        if ((op.insert as any)?.blank != null) {
          curSegment.containsBlank = true;
          if (op.attributes != null && op.attributes['initial'] === true) {
            curSegment.hasInitialFormat = true;
          }
        } else if (op.insert != null && op.insert['note-thread-embed'] != null) {
          // record the presence of an embedded note in the segment
          const id: string | undefined = op.attributes?.['threadid'] as string | undefined;
          let embedPosition: EmbedPosition | undefined = id == null ? undefined : this._embeddedElements.get(id);
          const position: number = curIndex + curSegment.length - 1;
          if (embedPosition == null && id != null) {
            embedPosition = { position };
            this._embeddedElements.set(id, embedPosition);
          } else {
            if (embedPosition != null) {
              if (embedPosition.duplicatePosition != null) {
                console.warn(
                  'Warning: text-view-model.updateSegments() did not expect to encounter an embed with >2 positions'
                );
              }
              embedPosition.duplicatePosition = position;
            }
          }
          curSegment.notesCount++;
        }
      }
      convertDelta.retain(len, attrs);
    }

    this.segments$.next(this._segments);

    return convertDelta.compose(fixDelta).chop();
  }

  /** Computes and adds to `fixDelta` a change to add or remove a blank indication as needed on `segment`, and other
   * fixes. */
  private fixSegment(
    editor: Quill,
    segment: SegmentInfo,
    fixDelta: Delta,
    fixOffset: number,
    isOnline: boolean
  ): [Delta, number] {
    // inserting blank embeds onto text docs while offline creates a scenario where quill misinterprets
    // the diff delta and can cause merge issues when returning online and duplicating verse segments
    if (segment.length - segment.notesCount === 0 && isOnline) {
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

  private embeddedElementPositions(embeds: EmbedPosition[]): number[] {
    const result: number[] = [];
    for (const ep of embeds.values()) {
      result.push(ep.position);
      if (ep.duplicatePosition != null) {
        result.push(ep.duplicatePosition);
      }
    }
    return result;
  }

  private fixDeltaForDuplicateEmbeds(): Delta {
    let delta = new Delta();
    const duplicatePositions: EmbedPosition[] = Array.from(this._embeddedElements.values()).filter(
      ep => ep.duplicatePosition != null
    );

    const deletePositions: number[] = this.embeddedElementPositions(duplicatePositions).sort((a, b) => a - b);
    for (const pos of deletePositions) {
      const deleteDelta = new Delta().retain(pos).delete(1);
      delta = deleteDelta.compose(delta);
    }
    return delta.chop();
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
  private removeEmbeddedElementsFromDelta(modelDelta: Delta): Delta {
    if (modelDelta.ops == null || modelDelta.ops.length < 1) {
      return new Delta();
    }
    const adjustedDelta = new Delta();
    let curIndex: number = 0;
    for (const op of modelDelta.ops) {
      let cloneOp: DeltaOperation | undefined = cloneDeep(op);
      if (cloneOp.retain != null) {
        const retainCount: number = getRetainCount(cloneOp)!;
        const embedsInRange: number = this.getEmbedsInEditorRange(curIndex, retainCount);
        curIndex += retainCount;

        // remove from the retain op the number of embedded elements contained in its content
        (cloneOp.retain as number) -= embedsInRange;
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
  private addEmbeddedElementsToDelta(modelDelta: Delta): Delta {
    if (modelDelta.ops == null || modelDelta.ops.length < 1) {
      return new Delta();
    }
    const adjustedDelta = new Delta();
    let curIndex: number = 0;
    let embedsUpToIndex: number = 0;
    let previousOp: 'retain' | 'insert' | 'delete' | undefined;
    let editorStartPos: number = 0;
    for (const op of modelDelta.ops) {
      const cloneOp: DeltaOperation = cloneDeep(op);
      editorStartPos = curIndex + embedsUpToIndex;
      if (cloneOp.retain != null) {
        const retainCount: number = getRetainCount(cloneOp)!;
        // editorStartPos must be the current index plus the number of embeds previous
        const editorRange: EditorRange = this.getEditorContentRange(editorStartPos, retainCount);
        embedsUpToIndex += editorRange.embedsWithinRange;
        curIndex += retainCount;
        let embedsToRetain: number = editorRange.embedsWithinRange;
        // remove any embeds subsequent to the previous insert so they can be redrawn in the right place
        if (editorRange.leadingEmbedCount > 0 && previousOp === 'insert') {
          (adjustedDelta as any).push({ delete: editorRange.leadingEmbedCount } as DeltaOperation);
          embedsToRetain -= editorRange.leadingEmbedCount;
        }
        // add to the retain op the number of embedded elements contained in its content
        (cloneOp.retain as number) += embedsToRetain;
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
  private getEmbedsInEditorRange(startPos: number, length: number): number {
    const embedPositions = this.embedPositions;
    const opEndIndex: number = startPos + length;
    let embeddedElementsCount: number = 0;
    for (const embedPos of embedPositions) {
      if (embedPos < startPos) {
        continue;
      }
      if (embedPos >= startPos && embedPos < opEndIndex) {
        embeddedElementsCount++;
        continue;
      }
      break;
    }
    return embeddedElementsCount;
  }
}
