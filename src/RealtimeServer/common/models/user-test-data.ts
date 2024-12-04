import merge from 'lodash/merge';
import { RecursivePartial } from '../utils/type-utils';
import { SystemRole } from './system-role';
import { User, UserProfile } from './user';

function testUserProfile(ordinal: number): UserProfile {
  return {
    displayName: `Test user ${ordinal}`,
    avatarUrl: `https://cdn.auth0.com/avatars/${ordinal}.png`
  };
}

function testUser(ordinal: number): User {
  return {
    ...testUserProfile(ordinal),
    name: `Name of test user ${ordinal}`,
    email: `user${ordinal}@example.com`,
    roles: [SystemRole.User],
    isDisplayNameConfirmed: false,
    interfaceLanguage: 'en',
    authId: `authId${ordinal}`,
    sites: {},
    viewedNotifications: new Set<string>()
  };
}

export function createTestUserProfile(overrides?: RecursivePartial<UserProfile>, ordinal = 1): UserProfile {
  return merge(testUserProfile(ordinal), overrides);
}

export function createTestUser(overrides?: RecursivePartial<User>, ordinal = 1): User {
  return merge(testUser(ordinal), overrides);
}
