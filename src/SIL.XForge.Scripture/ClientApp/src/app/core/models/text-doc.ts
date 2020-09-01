import { hasSentenceEnding } from '@sillsdev/machine';
import Quill, { DeltaOperation, DeltaStatic } from 'quill';
import {
  getTextDocId,
  TEXT_INDEX_PATHS,
  TextData,
  TEXTS_COLLECTION,
  TextType
} from 'realtime-server/lib/scriptureforge/models/text-data';
import { RealtimeDoc } from 'xforge-common/models/realtime-doc';

export const Delta: new (ops?: DeltaOperation[] | { ops: DeltaOperation[] }) => DeltaStatic = Quill.import('delta');

export function isSentenceStart(segRef: string, prevSegRef?: string, prevSegText?: string): boolean {
  // if the current or previous segment is a non-verse segment (headings, titles), then the current segment is the start
  // of a sentence
  if (prevSegRef == null || prevSegText == null || !isVerseRef(segRef) || !isVerseRef(prevSegRef)) {
    return true;
  }
  // check previous verse segment for a sentence terminal character
  return hasSentenceEnding(prevSegText);
}

function isVerseRef(ref: string): boolean {
  const index = ref.indexOf('_');
  const style = ref.substring(0, index);
  return style === 'verse';
}

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

  getSegmentText(ref: string): { text?: string; prevRef?: string; prevText?: string } {
    if (this.data == null || this.data.ops == null) {
      return {};
    }

    let curText: string | undefined;
    let curRef: string | undefined;
    let prevRef: string | undefined;
    let prevText: string | undefined;
    for (const op of this.data.ops) {
      if (op.attributes != null && op.attributes.segment != null) {
        if (curRef !== op.attributes.segment) {
          if (curRef === ref) {
            break;
          }
          prevRef = curRef;
          prevText = curText;
          curRef = op.attributes.segment;
          curText = '';
        }
        if (op.insert != null && typeof op.insert === 'string') {
          curText += op.insert;
        }
      }
    }

    if (curRef === ref) {
      return { text: curText, prevRef, prevText };
    }

    return {};
  }

  protected prepareDataForStore(data: TextData): any {
    return { ops: data.ops };
  }
}
