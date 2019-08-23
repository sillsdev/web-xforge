import { CommentList, COMMENTS_COLLECTION } from 'realtime-server/lib/scriptureforge/models/comment-list';
import { JsonRealtimeDoc } from 'xforge-common/models/json-realtime-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';

export class CommentListDoc extends JsonRealtimeDoc<CommentList> {
  static readonly COLLECTION = COMMENTS_COLLECTION;

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(CommentListDoc.COLLECTION, adapter, store);
  }
}
