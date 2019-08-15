import { JsonRealtimeDoc } from 'xforge-common/docs/json-realtime-doc';
import { RealtimeDocAdapter } from 'xforge-common/realtime-doc-adapter';
import { RealtimeOfflineStore } from 'xforge-common/realtime-offline-store';
import { CommentList } from '../models/comment-list';

export class CommentListDoc extends JsonRealtimeDoc<CommentList> {
  static readonly TYPE = 'comments';

  constructor(adapter: RealtimeDocAdapter, store: RealtimeOfflineStore) {
    super(CommentListDoc.TYPE, adapter, store);
  }
}
