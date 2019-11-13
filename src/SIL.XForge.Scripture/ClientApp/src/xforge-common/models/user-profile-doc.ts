import {
  USER_PROFILE_INDEX_PATHS,
  USER_PROFILES_COLLECTION,
  UserProfile
} from 'realtime-server/lib/common/models/user';
import { JsonRealtimeDoc } from './json-realtime-doc';

export class UserProfileDoc extends JsonRealtimeDoc<UserProfile> {
  static readonly COLLECTION = USER_PROFILES_COLLECTION;
  static readonly INDEX_PATHS = USER_PROFILE_INDEX_PATHS;
}
