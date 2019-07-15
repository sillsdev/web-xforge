import { RealtimeDocAdapter } from '../realtime-doc-adapter';
import { RealtimeOfflineStore } from '../realtime-offline-store';
import { JsonRealtimeDoc } from './json-realtime-doc';
import { User } from './user';

export class UserDoc extends JsonRealtimeDoc<User> {
  static readonly TYPE = 'users';

  constructor(adapter: RealtimeDocAdapter, store?: RealtimeOfflineStore) {
    super(UserDoc.TYPE, adapter, store);
  }
}
