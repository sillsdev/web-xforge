import { User } from 'realtime-server/lib/common/models/user';
import { RealtimeDocAdapter } from '../realtime-doc-adapter';
import { RealtimeOfflineStore } from '../realtime-offline-store';
import { JsonRealtimeDoc } from './json-realtime-doc';

export class UserProfileDoc extends JsonRealtimeDoc<User> {
  static readonly TYPE = 'user-profiles';

  constructor(adapter: RealtimeDocAdapter, store?: RealtimeOfflineStore) {
    super(UserProfileDoc.TYPE, adapter, store);
  }
}
