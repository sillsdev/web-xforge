import { QuestionList } from 'realtime-server/lib/scriptureforge/models/question-list';
import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';

export class QuestionListDoc extends JsonRealtimeDoc<QuestionList> {
  static readonly TYPE = 'questions';

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(QuestionListDoc.TYPE, adapter, store);
  }
}
