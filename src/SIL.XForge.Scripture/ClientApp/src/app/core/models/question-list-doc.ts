import { QuestionList, QUESTIONS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/question-list';
import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';

export class QuestionListDoc extends JsonRealtimeDoc<QuestionList> {
  static readonly COLLECTION = QUESTIONS_COLLECTION;

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(QuestionListDoc.COLLECTION, adapter, store);
  }
}
