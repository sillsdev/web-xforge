import Quill, { DeltaOperation, DeltaStatic } from 'quill';
import { TextData, TEXTS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/text-data';
import { RealtimeDoc } from 'xforge-common/models/realtime-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';

export const Delta: new (ops?: DeltaOperation[] | { ops: DeltaOperation[] }) => DeltaStatic = Quill.import('delta');

/** Records in the text_data collection in the local or remote database are the content
 * of a chapter of a Scripture book. */
export class TextDoc extends RealtimeDoc<TextData, TextData> {
  static readonly COLLECTION = TEXTS_COLLECTION;

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(TextDoc.COLLECTION, adapter, store);
  }

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
