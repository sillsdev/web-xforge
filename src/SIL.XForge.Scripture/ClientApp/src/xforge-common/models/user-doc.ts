import { User, USERS_COLLECTION } from 'realtime-server/lib/common/models/user';
import { RealtimeDocAdapter } from '../realtime-doc-adapter';
import { RealtimeOfflineStore } from '../realtime-offline-store';
import { JsonRealtimeDoc } from './json-realtime-doc';

export class UserDoc extends JsonRealtimeDoc<User> {
  static readonly COLLECTION = USERS_COLLECTION;

  constructor(adapter: RealtimeDocAdapter, store?: RealtimeOfflineStore) {
    super(UserDoc.COLLECTION, adapter, store);
  }
}
