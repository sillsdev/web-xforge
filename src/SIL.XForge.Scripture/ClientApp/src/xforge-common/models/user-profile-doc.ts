import {
  USER_PROFILES_COLLECTION,
  USER_PROFILE_INDEX_PATHS,
  UserProfile
} from 'realtime-server/lib/esm/common/models/user';
import { JsonRealtimeDoc } from './json-realtime-doc';

export class UserProfileDoc extends JsonRealtimeDoc<UserProfile> {
  static readonly COLLECTION = USER_PROFILES_COLLECTION;
  static readonly INDEX_PATHS = USER_PROFILE_INDEX_PATHS;
}
