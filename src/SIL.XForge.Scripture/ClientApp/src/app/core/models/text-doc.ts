import Quill, { DeltaOperation, DeltaStatic } from 'quill';
import {
  getTextDocId,
  TextData,
  TEXTS_COLLECTION,
  TextType,
  TEXT_INDEX_PATHS
} from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { RealtimeDoc } from 'xforge-common/models/realtime-doc';

export const Delta: new (ops?: DeltaOperation[] | { ops: DeltaOperation[] }) => DeltaStatic = Quill.import('delta');

/**
 * This class represents the different components for a text doc id. It can be converted to the actual text doc id
 * string using the "toString()" method.
 */
export class TextDocId {
  constructor(
    public readonly projectId: string,
    public readonly bookNum: number,
    public readonly chapterNum: number,
    public readonly textType: TextType = 'target'
  ) {}

  toString(): string {
    return getTextDocId(this.projectId, this.bookNum, this.chapterNum, this.textType);
  }
}

/**
 * This is the real-time doc for a text doc. Texts contain the textual data for one particular Scripture book
 * and chapter.
 */
export class TextDoc extends RealtimeDoc<TextData, TextData> {
  static readonly COLLECTION = TEXTS_COLLECTION;
  static readonly INDEX_PATHS = TEXT_INDEX_PATHS;

  getSegmentCount(): { translated: number; blank: number } {
    let blank = 0;
    let translated = 0;
    if (this.data != null && this.data.ops != null) {
      for (let i = 0; i < this.data.ops.length; i++) {
        const op = this.data.ops[i];
        const nextOp = i < this.data.ops.length - 1 ? this.data.ops[i + 1] : undefined;
        if (op.attributes != null && op.attributes.segment != null) {
          if (op.insert.blank != null) {
            const segRef = op.attributes.segment;
            if (
              nextOp == null ||
              nextOp.insert == null ||
              nextOp.insert.verse == null ||
              (segRef.startsWith('verse_') && !segRef.includes('/'))
            ) {
              blank++;
            }
          } else {
            translated++;
          }
        }
      }
    }
    return { translated, blank };
  }

  getSegmentText(ref: string): string {
    if (this.data == null || this.data.ops == null) {
      return '';
    }
    let text = '';
    let inSegment = false;
    for (const op of this.data.ops) {
      if (op.attributes?.segment != null && op.attributes.segment === ref) {
        if (op.insert != null && typeof op.insert === 'string') {
          text += op.insert;
          inSegment = true;
        }
      } else if (inSegment) {
        break;
      }
    }

    return text;
  }

  getSegmentTextIncludingRelated(ref: string): string {
    if (this.data == null || this.data.ops == null) {
      return '';
    }
    let text = '';
    let opIndexStart: number | undefined;
    let opIndexEnd: number | undefined;

    /** Locate range of ops that match the verse segments
     * This is done to capture important inserts between segments like blank lines
     */
    for (const i in this.data.ops) {
      if (!this.data.ops.hasOwnProperty(i)) {
        continue;
      }
      const index = parseInt(i, 10);
      const op = this.data.ops[index];
      if (
        op.attributes?.segment != null &&
        (op.attributes.segment === ref || op.attributes.segment.indexOf(ref + '/') === 0)
      ) {
        if (op.insert != null && typeof op.insert === 'string') {
          if (opIndexStart == null) {
            opIndexStart = index;
          }
          opIndexEnd = index;
        }
      }
    }
    if (opIndexStart == null || opIndexEnd == null) {
      return text;
    }
    // Get all string inserts within the op range
    for (const i in this.data.ops) {
      if (!this.data.ops.hasOwnProperty(i)) {
        continue;
      }
      const index = parseInt(i, 10);
      if (index < opIndexStart || index > opIndexEnd) {
        continue;
      }
      const op = this.data.ops[index];
      if (op.insert != null && typeof op.insert === 'string') {
        text += op.insert;
      }
    }
    return text;
  }

  protected prepareDataForStore(data: TextData): any {
    return { ops: data.ops };
  }
}
