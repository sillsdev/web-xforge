import { User, USERS_COLLECTION } from 'realtime-server/lib/common/models/user';
import { JsonRealtimeDoc } from './json-realtime-doc';

export class UserDoc extends JsonRealtimeDoc<User> {
  static readonly COLLECTION = USERS_COLLECTION;
}
