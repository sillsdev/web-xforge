import { User, USERS_COLLECTION, USER_INDEX_PATHS } from 'realtime-server/lib/cjs/common/models/user';
import { JsonRealtimeDoc } from './json-realtime-doc';

export class UserDoc extends JsonRealtimeDoc<User> {
  static readonly COLLECTION = USERS_COLLECTION;
  static readonly INDEX_PATHS = USER_INDEX_PATHS;
}
