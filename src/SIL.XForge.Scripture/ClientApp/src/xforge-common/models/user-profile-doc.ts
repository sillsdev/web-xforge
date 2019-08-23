import { User, USER_PROFILES_COLLECTION } from 'realtime-server/lib/common/models/user';
import { RealtimeDocAdapter } from '../realtime-doc-adapter';
import { RealtimeOfflineStore } from '../realtime-offline-store';
import { JsonRealtimeDoc } from './json-realtime-doc';

export class UserProfileDoc extends JsonRealtimeDoc<User> {
  static readonly COLLECTION = USER_PROFILES_COLLECTION;

  constructor(adapter: RealtimeDocAdapter, store?: RealtimeOfflineStore) {
    super(UserProfileDoc.COLLECTION, adapter, store);
  }
}
