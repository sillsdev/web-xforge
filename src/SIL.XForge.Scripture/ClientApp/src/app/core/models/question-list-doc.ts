import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { QuestionList } from './question-list';

export class QuestionListDoc extends JsonRealtimeDoc<QuestionList> {
  static readonly TYPE = 'questions';

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(QuestionListDoc.TYPE, adapter, store);
  }
}
