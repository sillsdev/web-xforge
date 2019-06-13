import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { Comment } from './comment';

export class CommentsDoc extends JsonRealtimeDoc<Comment[]> {
  static readonly TYPE = 'comment';

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(CommentsDoc.TYPE, adapter, store);
  }
}
