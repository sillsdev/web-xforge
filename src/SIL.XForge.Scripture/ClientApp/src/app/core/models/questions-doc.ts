import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { Question } from './question';

export class QuestionsDoc extends JsonRealtimeDoc<Question[]> {
  static readonly TYPE = 'questions';

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(QuestionsDoc.TYPE, adapter, store);
  }
}
