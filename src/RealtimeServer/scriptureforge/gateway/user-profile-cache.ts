import ShareDB from 'sharedb';
import { GatewayDataSource, StoredSnapshot } from '../../common/gateway/gateway-data-source';
import { USERS_COLLECTION } from '../../common/models/user';
import { hasOwnProp, isPlainObject } from '../../common/utils/type-utils';

/**
 * The parts of a user's doc that the client shows other users about them, cached for the gateway. Presence updates
 * name the viewer, and the gateway rebuilds that name and avatar from here so that no one can present as someone else.
 */

/** What the client reads from a user's own doc to describe them to others (see TextComponent presence). */
export interface UserPresenceProfile {
  readonly displayName: string;
  readonly avatarUrl: string;
  readonly authId: string;
}

/** How long a cached profile is used without being read again. */
export const USER_PROFILE_TTL_MS = 30_000;
/** The most profiles the cache holds. The least recently read are dropped first. */
export const MAX_CACHED_PROFILES = 10_000;

interface CacheEntry {
  readonly profile: UserPresenceProfile;
  readonly fetchedAtMs: number;
}

/** A process-wide cache of user profiles. Ops to a user's doc invalidate it (see observeUserProfileChanges). */
export class UserProfileCache {
  private readonly entries = new Map<string, CacheEntry>();
  /** Increases with every invalidation, so that a read that an invalidation overtook is not cached. */
  private generation = 0;

  constructor(
    private readonly data: GatewayDataSource,
    private readonly now: () => number = Date.now
  ) {}

  /** The user's profile, or null when the user does not exist. Rejects when the user cannot be read. */
  async get(userId: string): Promise<UserPresenceProfile | null> {
    const entry: CacheEntry | undefined = this.entries.get(userId);
    if (entry != null && this.now() - entry.fetchedAtMs < USER_PROFILE_TTL_MS) {
      return entry.profile;
    }
    const generationAtStart: number = this.generation;
    const snapshot: StoredSnapshot = await this.data.getSnapshot(USERS_COLLECTION, userId, [
      'displayName',
      'avatarUrl',
      'authId'
    ]);
    if (snapshot.type == null) {
      // Not cached, so that requests for made-up ids cannot push real profiles out of the cache.
      return null;
    }
    const profile: UserPresenceProfile = readProfile(snapshot.data);
    // A profile read while some profile was invalidated may be from before the change, so it is not cached.
    if (this.generation === generationAtStart) {
      this.entries.delete(userId);
      this.entries.set(userId, { profile: profile, fetchedAtMs: this.now() });
      while (this.entries.size > MAX_CACHED_PROFILES) {
        const oldest: string | undefined = this.entries.keys().next().value;
        if (oldest == null) {
          break;
        }
        this.entries.delete(oldest);
      }
    }
    return profile;
  }

  invalidate(userId: string): void {
    this.entries.delete(userId);
    this.generation++;
  }
}

/** Registers backend-wide middleware that drops a user's cached profile whenever an op is committed to their doc. */
export function observeUserProfileChanges(backend: ShareDB, cache: UserProfileCache): void {
  backend.use('afterWrite', (context: ShareDB.middleware.SubmitContext, next: (err?: unknown) => void) => {
    try {
      if (context.collection === USERS_COLLECTION) {
        cache.invalidate(context.id);
      }
    } catch {
      // The cache's expiry is the backstop.
    }
    next();
  });
}

function readProfile(data: unknown): UserPresenceProfile {
  const user: Readonly<Record<string, unknown>> = isPlainObject(data) ? data : {};
  return {
    displayName: readString(user, 'displayName'),
    avatarUrl: readString(user, 'avatarUrl'),
    authId: readString(user, 'authId')
  };
}

function readString(record: Readonly<Record<string, unknown>>, field: string): string {
  const value: unknown = hasOwnProp(record, field) ? record[field] : undefined;
  return typeof value === 'string' ? value : '';
}
