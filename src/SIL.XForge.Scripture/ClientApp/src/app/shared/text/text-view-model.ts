import { clone } from '@orbit/utils';
import Quill, { DeltaOperation, DeltaStatic, RangeStatic, Sources, StringMap } from 'quill';
import { Subscription } from 'rxjs';
import { Delta, TextDoc } from '../../core/models/text-doc';
import { TextType } from '../../core/models/text-doc-id';
import { Segment } from './segment';

const PARA_STYLES: Set<string> = new Set<string>([
  'p',
  'm',
  'pmo',
  'pm',
  'pmc',
  'pmr',
  'pi',
  'mi',
  'cls',
  'li',
  'pc',
  'pr',
  'ph',
  'lit',
  'q',
  'qc',
  'qr',
  'qa',
  'qm',
  'b'
]);

function isParagraphStyle(style: string): boolean {
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

function unsetAttribute(op: DeltaOperation, attributes: StringMap, name: string): void {
  if (op.attributes != null && op.attributes[name] != null) {
    attributes[name] = false;
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
  origRef: string;
  containsBlank: boolean = false;

  constructor(public ref: string, public index: number) {}
}

/**
 * This class is responsible for keeping the the data model and the view model for a text in sync. This class currently
 * only supports differences in attributes between the data model and the view model. It also helps to keep the models
 * consistent and correct.
 */
export class TextViewModel {
  private readonly _segments: Map<string, RangeStatic> = new Map<string, RangeStatic>();
  private remoteChangesSub?: Subscription;
  private onCreateSub?: Subscription;
  private textDoc?: TextDoc;

  constructor(private readonly editor: Quill) {}

  get segments(): IterableIterator<[string, RangeStatic]> {
    return this._segments.entries();
  }

  get isEmpty(): boolean {
    return this.textDoc == null || this.textDoc.data == null;
  }

  bind(textDoc: TextDoc): void {
    if (this.textDoc != null) {
      this.unbind();
    }

    this.textDoc = textDoc;
    this.editor.setContents(this.textDoc.data);
    this.editor.history.clear();
    this.remoteChangesSub = this.textDoc.remoteChanges().subscribe(ops => this.editor.updateContents(ops));
    this.onCreateSub = this.textDoc.onCreate().subscribe(() => {
      this.editor.setContents(this.textDoc.data);
      this.editor.history.clear();
    });
  }

  unbind(): void {
    if (this.textDoc == null) {
      return;
    }
    this.remoteChangesSub.unsubscribe();
    this.onCreateSub.unsubscribe();
    this.textDoc = undefined;
    this.editor.setText('', 'silent');
    this._segments.clear();
  }

  /**
   * Updates the view model and Quill contents when text is changed.
   *
   * @param {DeltaStatic} delta The view model delta.
   * @param {Sources} source The source of the change.
   */
  update(delta: DeltaStatic, source: Sources): void {
    if (this.textDoc == null) {
      return;
    }

    if (source === 'user') {
      const modelDelta = this.viewToData(delta);
      if (modelDelta.ops.length > 0) {
        this.textDoc.submit(modelDelta, this.editor);
      }
    }

    const fixDelta = this.updateSegments();
    if (fixDelta.ops.length > 0) {
      // defer the update, since it might cause the segment ranges to be out-of-sync with the view model
      Promise.resolve().then(() => this.editor.updateContents(fixDelta, 'user'));
    }
  }

  isHighlighted(segment: Segment): boolean {
    const formats = this.editor.getFormat(segment.range);
    return formats['highlight-segment'] != null;
  }

  toggleHighlight(segment: Segment, value: TextType | boolean): void {
    const range = segment.range;
    if (range.length > 0) {
      // this changes the underlying HTML, which can mess up some Quill events, so defer this call
      Promise.resolve().then(() => {
        this.editor.formatText(range.index, range.length, 'highlight-segment', value, 'silent');
        this.editor.formatLine(range.index, range.length, 'highlight-para', value, 'silent');
      });
    }
  }

  hasSegmentRange(ref: string): boolean {
    return this._segments.has(ref);
  }

  getSegmentRange(ref: string): RangeStatic {
    return this._segments.get(ref);
  }

  getSegmentRef(range: RangeStatic): string {
    let segmentRef: string;
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

  private viewToData(delta: DeltaStatic): DeltaStatic {
    const modelDelta = new Delta();
    for (const op of delta.ops) {
      const modelOp: DeltaOperation = clone(op);
      removeAttribute(modelOp, 'highlight-segment');
      removeAttribute(modelOp, 'highlight-para');
      removeAttribute(modelOp, 'para-contents');
      modelDelta.push(modelOp);
    }
    return modelDelta.chop();
  }

  private updateSegments(): DeltaStatic {
    let fixDelta = new Delta();
    const delta = this.editor.getContents();
    this._segments.clear();
    const nextIds = new Map<string, number>();
    let paraSegments: SegmentInfo[] = [];
    let chapter = '';
    let curIndex = 0;
    let curSegment: SegmentInfo;
    for (const op of delta.ops) {
      const attrs: StringMap = {};
      const len = typeof op.insert === 'string' ? op.insert.length : 1;
      if (op.insert === '\n' || (op.attributes != null && op.attributes.para != null)) {
        const style = op.attributes == null ? null : (op.attributes.para.style as string);
        if (style == null || isParagraphStyle(style)) {
          // paragraph
          for (const _ch of op.insert) {
            if (curSegment != null) {
              paraSegments.push(curSegment);
              curIndex += curSegment.length;
              curSegment = new SegmentInfo(curSegment.ref, curIndex + 1);
            }

            for (const paraSegment of paraSegments) {
              if (this._segments.has(paraSegment.ref)) {
                paraSegment.ref = getParagraphRef(nextIds, paraSegment.ref, paraSegment.ref + '/' + style);
              }

              fixDelta = this.fixSegment(paraSegment, fixDelta);
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
          fixDelta = this.fixSegment(curSegment, fixDelta);
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
          setAttribute(op, attrs, 'para-contents', true);
        } else {
          unsetAttribute(op, attrs, 'para-contents');
        }
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
      fixDelta.retain(len, attrs);
    }
    return fixDelta.chop();
  }

  private fixSegment(segment: SegmentInfo, fixDelta: DeltaStatic): DeltaStatic {
    if (segment.length === 0) {
      // insert blank
      const type = segment.ref.includes('/p') || segment.ref.includes('/m') ? 'initial' : 'normal';
      const delta = new Delta();
      delta.retain(segment.index);
      delta.insert({ blank: type }, { segment: segment.index, 'para-contents': true });
      fixDelta = fixDelta.compose(delta);
    } else if (segment.containsBlank && segment.length > 1) {
      // delete blank
      const delta = new Delta()
        .retain(segment.index)
        .retain(segment.length - 1, { segment: segment.ref, 'para-contents': true })
        .delete(1);
      fixDelta = fixDelta.compose(delta);
    } else if (segment.ref !== segment.origRef) {
      // fix segment ref
      const delta = new Delta()
        .retain(segment.index)
        .retain(segment.length, { segment: segment.ref, 'para-contents': true });
      fixDelta = fixDelta.compose(delta);
    }
    return fixDelta;
  }
}
