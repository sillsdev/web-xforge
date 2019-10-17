import Quill, { DeltaOperation, DeltaStatic } from 'quill';
import {
  getTextDocId,
  TextData,
  TEXTS_COLLECTION,
  TextType
} from 'realtime-server/lib/scriptureforge/models/text-data';
import { RealtimeDoc } from 'xforge-common/models/realtime-doc';
import { isInitialSegment } from '../../shared/utils';

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

  getSegmentCount(): { translated: number; blank: number } {
    let blank = 0;
    let translated = 0;
    if (this.data != null && this.data.ops != null) {
      for (const op of this.data.ops) {
        if (op.attributes && op.attributes.segment) {
          if (op.insert.blank != null) {
            const segRef: string = op.attributes != null ? op.attributes.segment : '';
            if (!isInitialSegment(segRef)) {
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

  protected prepareDataForStore(data: TextData): any {
    return { ops: data.ops };
  }
}
