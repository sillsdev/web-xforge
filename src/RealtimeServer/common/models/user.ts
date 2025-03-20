import { Site } from './site';

export const USER_PROFILES_COLLECTION = 'user_profiles';
export const USER_PROFILE_INDEX_PATHS: string[] = [];

export const USERS_COLLECTION = 'users';
export const USER_INDEX_PATHS: string[] = USER_PROFILE_INDEX_PATHS;

export enum AuthType {
  Unknown,
  Paratext,
  Google,
  Facebook,
  Account
}

export function getAuthType(authId: string): AuthType {
  if (authId == null || !authId.includes('|')) {
    return AuthType.Unknown;
  }

  const authIdType = authId.substring(0, authId.lastIndexOf('|'));
  if (authIdType.includes('paratext')) {
    return AuthType.Paratext;
  }
  if (authIdType.includes('google')) {
    return AuthType.Google;
  }
  if (authIdType.includes('facebook')) {
    return AuthType.Facebook;
  }
  if (authIdType.includes('auth0')) {
    return AuthType.Account;
  }
  return AuthType.Unknown;
}

export interface UserProfile {
  displayName: string;
  avatarUrl: string;
}

export interface User extends UserProfile {
  name: string;
  email: string;
  paratextId?: string;
  roles: string[];
  isDisplayNameConfirmed: boolean;
  interfaceLanguage?: string;
  authId: string;
  sites: { [key: string]: Site };
}

/** Do we understand the SF user to also be a PT user? */
export function isPTUser(user: User) {
  return user.paratextId != null;
}
