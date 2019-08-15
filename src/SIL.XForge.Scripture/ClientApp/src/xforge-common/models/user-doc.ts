import { User } from 'realtime-server/lib/common/models/user';
import { RealtimeDocAdapter } from '../realtime-doc-adapter';
import { RealtimeOfflineStore } from '../realtime-offline-store';
import { JsonRealtimeDoc } from './json-realtime-doc';

export class UserDoc extends JsonRealtimeDoc<User> {
  static readonly TYPE = 'users';

  constructor(adapter: RealtimeDocAdapter, store?: RealtimeOfflineStore) {
    super(UserDoc.TYPE, adapter, store);
  }
}
