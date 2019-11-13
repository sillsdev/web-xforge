import { User, USER_INDEX_PATHS, USERS_COLLECTION } from 'realtime-server/lib/common/models/user';
import { JsonRealtimeDoc } from './json-realtime-doc';

export class UserDoc extends JsonRealtimeDoc<User> {
  static readonly COLLECTION = USERS_COLLECTION;
  static readonly INDEX_PATHS = USER_INDEX_PATHS;
}
