import { CommentList } from 'realtime-server/lib/scriptureforge/models/comment-list';
import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';

export class CommentListDoc extends JsonRealtimeDoc<CommentList> {
  static readonly TYPE = 'comments';

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(CommentListDoc.TYPE, adapter, store);
  }
}
