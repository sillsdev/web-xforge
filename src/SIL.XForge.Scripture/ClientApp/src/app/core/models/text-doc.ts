import Quill, { DeltaOperation, DeltaStatic } from 'quill';
import { TextData, TEXTS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/text-data';
import { RealtimeDoc } from 'xforge-common/models/realtime-doc';

export const Delta: new (ops?: DeltaOperation[] | { ops: DeltaOperation[] }) => DeltaStatic = Quill.import('delta');

export type TextType = 'source' | 'target';

export function getTextDocId(
  projectId: string,
  bookId: string,
  chapter: number,
  textType: TextType = 'target'
): string {
  return `${projectId}:${bookId}:${chapter}:${textType}`;
}

/**
 * This class represents the different components for a text doc id. It can be converted to the actual text doc id
 * string using the "toString()" method.
 */
export class TextDocId {
  constructor(
    public readonly projectId: string,
    public readonly bookId: string,
    public readonly chapter: number,
    public readonly textType: TextType = 'target'
  ) {}

  toString(): string {
    return getTextDocId(this.projectId, this.bookId, this.chapter, this.textType);
  }
}

/**
 * This is the real-time doc for a text doc. Texts contain the textual data for a Scripture book.
 */
export class TextDoc extends RealtimeDoc<TextData, TextData> {
  static readonly COLLECTION = TEXTS_COLLECTION;

  getSegmentCount(): { translated: number; blank: number } {
    let blank = 0;
    let translated = 0;
    for (const op of this.data.ops) {
      if (op.attributes && op.attributes.segment) {
        if (op.insert.blank) {
          if (op.insert.blank === 'normal') {
            blank++;
          }
        } else {
          translated++;
        }
      }
    }
    return { translated, blank };
  }

  protected prepareDataForStore(data: TextData): any {
    return { ops: data.ops };
  }
}
