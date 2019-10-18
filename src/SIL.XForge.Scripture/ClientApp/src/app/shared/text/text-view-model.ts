import cloneDeep from 'lodash/cloneDeep';
import Quill, { DeltaOperation, DeltaStatic, RangeStatic, Sources, StringMap } from 'quill';
import { TextType } from 'realtime-server/lib/scriptureforge/models/text-data';
import { Subscription } from 'rxjs';
import { Delta, TextDoc } from '../../core/models/text-doc';
import { Segment } from './segment';

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
  if (op.attributes != null && op.attributes[name] != null) {
    delete op.attributes[name];
    if (Object.keys(op.attributes).length === 0) {
      delete op.attributes;
    }
  }
}

class SegmentInfo {
  length: number = 0;
  origRef?: string;
  containsBlank: boolean = false;

  constructor(public ref: string, public index: number) {}
}

/**
 * This class is responsible for keeping the the data model and the view model for a text in sync. This class currently
 * only supports differences in attributes between the data model and the view model. It also helps to keep the models
 * consistent and correct.
 */
export class TextViewModel {
  editor?: Quill;

  private readonly _segments: Map<string, RangeStatic> = new Map<string, RangeStatic>();
  private remoteChangesSub?: Subscription;
  private onCreateSub?: Subscription;
  private textDoc?: TextDoc;

  constructor() {}

  get segments(): IterableIterator<[string, RangeStatic]> {
    return this._segments.entries();
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

  bind(textDoc: TextDoc): void {
    const editor = this.checkEditor();
    if (this.textDoc != null) {
      this.unbind();
    }

    this.textDoc = textDoc;
    editor.setContents(this.textDoc.data as DeltaStatic);
    editor.history.clear();
    this.remoteChangesSub = this.textDoc.remoteChanges$.subscribe(ops => editor.updateContents(ops as DeltaStatic));
    this.onCreateSub = this.textDoc.create$.subscribe(() => {
      if (textDoc.data != null) {
        editor.setContents(textDoc.data as DeltaStatic);
      }
      editor.history.clear();
    });
  }

  unbind(): void {
    if (this.remoteChangesSub != null) {
      this.remoteChangesSub.unsubscribe();
    }
    if (this.onCreateSub != null) {
      this.onCreateSub.unsubscribe();
    }
    this.textDoc = undefined;
    if (this.editor != null) {
      this.editor.setText('', 'silent');
    }
    this._segments.clear();
  }

  /**
   * Updates the view model and Quill contents when text is changed.
   *
   * @param {DeltaStatic} delta The view model delta.
   * @param {Sources} source The source of the change.
   */
  update(delta: DeltaStatic, source: Sources): void {
    const editor = this.checkEditor();
    if (this.textDoc == null) {
      return;
    }

    if (source === 'user' && editor.isEnabled()) {
      const modelDelta = this.viewToData(delta);
      if (modelDelta.ops != null && modelDelta.ops.length > 0) {
        this.textDoc.submit(modelDelta, this.editor);
      }
    }

    const updateDelta = this.updateSegments(editor);
    if (updateDelta.ops != null && updateDelta.ops.length > 0) {
      // defer the update, since it might cause the segment ranges to be out-of-sync with the view model
      Promise.resolve().then(() => editor.updateContents(updateDelta, 'user'));
    }
  }

  isHighlighted(segment: Segment): boolean {
    const editor = this.checkEditor();
    const formats = editor.getFormat(segment.range);
    return formats['highlight-segment'] != null;
  }

  toggleHighlight(range: RangeStatic, value: TextType | boolean): void {
    const editor = this.checkEditor();
    if (range.length > 0) {
      // this changes the underlying HTML, which can mess up some Quill events, so defer this call
      Promise.resolve().then(() => {
        editor.formatText(range.index, range.length, 'highlight-segment', value, 'silent');
        editor.formatLine(range.index, range.length, 'highlight-para', value, 'silent');
      });
    }
  }

  hasSegmentRange(ref: string): boolean {
    return this._segments.has(ref);
  }

  getSegmentRange(ref: string): RangeStatic | undefined {
    return this._segments.get(ref);
  }

  getSegmentText(ref: string): string {
    const editor = this.checkEditor();
    const range = this.getSegmentRange(ref);
    return range == null ? '' : editor.getText(range.index, range.length);
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

  private viewToData(delta: DeltaStatic): DeltaStatic {
    const modelDelta = new Delta();
    if (delta.ops != null) {
      for (const op of delta.ops) {
        const modelOp: DeltaOperation = cloneDeep(op);
        removeAttribute(modelOp, 'highlight-segment');
        removeAttribute(modelOp, 'highlight-para');
        removeAttribute(modelOp, 'para-contents');
        (modelDelta as any).push(modelOp);
      }
    }
    return modelDelta.chop();
  }

  private updateSegments(editor: Quill): DeltaStatic {
    const convertDelta = new Delta();
    let fixDelta = new Delta();
    let fixOffset = 0;
    const delta = editor.getContents();
    this._segments.clear();
    const nextIds = new Map<string, number>();
    let paraSegments: SegmentInfo[] = [];
    let chapter = '';
    let curIndex = 0;
    let curSegment: SegmentInfo | undefined;
    if (delta.ops != null) {
      for (const op of delta.ops) {
        const attrs: StringMap = {};
        const len = typeof op.insert === 'string' ? op.insert.length : 1;
        if (op.insert === '\n' || (op.attributes != null && op.attributes.para != null)) {
          const style =
            op.attributes == null || op.attributes.para == null ? null : (op.attributes.para.style as string);
          if (style == null || canParaContainVerseText(style)) {
            // paragraph
            for (const _ch of op.insert) {
              if (curSegment != null) {
                paraSegments.push(curSegment);
                curIndex += curSegment.length;
                curSegment = new SegmentInfo(curSegment.ref, curIndex + 1);
              }
              if (style != null) {
                const paraRef = getParagraphRef(nextIds, style, style);
                if (paraSegments.length === 0) {
                  paraSegments.push(new SegmentInfo(paraRef, curIndex));
                } else if (paraSegments[0].ref === '') {
                  paraSegments[0].ref = paraRef;
                }
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
          }
        }
        convertDelta.retain(len, attrs);
      }
    }
    return convertDelta.compose(fixDelta).chop();
  }

  private fixSegment(
    editor: Quill,
    segment: SegmentInfo,
    fixDelta: DeltaStatic,
    fixOffset: number
  ): [DeltaStatic, number] {
    if (segment.length === 0) {
      // insert blank
      const delta = new Delta();
      delta.retain(segment.index + fixOffset);
      delta.insert({ blank: true }, { segment: segment.ref, 'para-contents': true });
      fixDelta = fixDelta.compose(delta);
      fixOffset++;
    } else if (segment.containsBlank && segment.length > 1) {
      // delete blank
      const delta = new Delta()
        .retain(segment.index + fixOffset)
        .retain(segment.length - 1, { segment: segment.ref, 'para-contents': true })
        .delete(1);
      fixDelta = fixDelta.compose(delta);
      fixOffset--;
      const sel = editor.getSelection();
      if (sel != null && sel.index === segment.index && sel.length === 0) {
        // if the segment is no longer blank, ensure that the selection is at the end of the segment.
        // Sometimes after typing in a blank segment, the selection will be at the beginning. This seems to be a bug
        // in Quill.
        Promise.resolve().then(() => editor.setSelection(segment.index + segment.length, 0, 'user'));
      }
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
}
