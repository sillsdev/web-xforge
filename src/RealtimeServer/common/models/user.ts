import { Site } from './site';

export const USERS_COLLECTION = 'users';
export const USER_PROFILES_COLLECTION = 'user_profiles';

export enum AuthType {
  Unknown,
  Paratext,
  Google,
  Account
}

export function getAuthType(authId: string): AuthType {
  if (authId == null || !authId.includes('|')) {
    return AuthType.Unknown;
  }

  const authIdType = authId.substr(0, authId.lastIndexOf('|'));
  if (authIdType.includes('paratext')) {
    return AuthType.Paratext;
  }
  if (authIdType.includes('google')) {
    return AuthType.Google;
  }
  if (authIdType.includes('auth0')) {
    return AuthType.Account;
  }
  return AuthType.Unknown;
}

export interface User {
  name?: string;
  email?: string;
  paratextId?: string;
  avatarUrl?: string;
  role?: string;
  displayName?: string;
  isDisplayNameConfirmed?: boolean;
  mobilePhone?: string;
  contactMethod?: 'email' | 'sms' | 'emailSms';
  birthday?: string;
  gender?: 'female' | 'male';
  authId?: string;
  sites?: { [key: string]: Site };
}
