import { User, USER_PROFILES_COLLECTION } from 'realtime-server/lib/common/models/user';
import { JsonRealtimeDoc } from './json-realtime-doc';

export class UserProfileDoc extends JsonRealtimeDoc<User> {
  static readonly COLLECTION = USER_PROFILES_COLLECTION;
}
