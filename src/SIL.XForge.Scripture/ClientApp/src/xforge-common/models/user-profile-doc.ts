import {
  UserProfile,
  USER_PROFILES_COLLECTION,
  USER_PROFILE_INDEX_PATHS
} from 'realtime-server/lib/cjs/common/models/user';
import { JsonRealtimeDoc } from './json-realtime-doc';

export class UserProfileDoc extends JsonRealtimeDoc<UserProfile> {
  static readonly COLLECTION = USER_PROFILES_COLLECTION;
  static readonly INDEX_PATHS = USER_PROFILE_INDEX_PATHS;
}
