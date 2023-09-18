import { Injectable } from '@angular/core';
import { CommandService } from 'xforge-common/command.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { PROJECTS_URL } from 'xforge-common/url-constants';

export interface FeatureFlag {
  readonly description: string;
  readonly readonly: boolean;
  get enabled(): boolean;
  set enabled(value: boolean);
}

@Injectable({
  providedIn: 'root'
})
export class FeatureFlagStore extends SubscriptionDisposable {
  static readonly keyPrefix = 'SF_FEATURE_FLAG_';

  private localFlags: { [key: string]: boolean } = {};
  private remoteFlags: { [key: string]: boolean } = {};
  private remoteFlagCacheExpiry: Date = new Date();

  constructor(
    private readonly commandService: CommandService,
    private readonly onlineStatusService: OnlineStatusService
  ) {
    super();
    // Cause the flags to be reloaded when coming online
    if (onlineStatusService.onlineStatus$ != null) {
      this.subscribe(onlineStatusService.onlineStatus$, status => {
        if (status) this.remoteFlagCacheExpiry = new Date();
      });
    }
  }

  isEnabled(key: string): boolean {
    return this.isRemoteEnabled(key) || this.isLocalEnabled(key);
  }

  isLocalEnabled(key: string): boolean {
    if (this.localFlags[key] === undefined) {
      this.localFlags[key] = this.getFromLocalStorage(key);
    }
    return this.localFlags[key];
  }

  isRemoteEnabled(key: string): boolean {
    this.retrieveFeatureFlagsIfMissing();
    if (Object.entries(this.remoteFlags).length === 0) {
      return false;
    }
    return this.remoteFlags[key] ?? false;
  }

  isRemotePresent(key: string): boolean {
    this.retrieveFeatureFlagsIfMissing();
    return key in this.remoteFlags;
  }

  isReadOnly(key: string): boolean {
    // Keys are only readonly if they are set on the server
    return this.isRemotePresent(key);
  }

  setEnabled(key: string, value: boolean): void {
    // Keys are only set locally
    this.localFlags[key] = value;
    localStorage.setItem(this.getLocalStorageKey(key), JSON.stringify(value));
  }

  private getFromLocalStorage(key: string): boolean {
    const itemFromStore: string | null = localStorage.getItem(this.getLocalStorageKey(key));
    const valueFromStore: string | undefined =
      typeof itemFromStore === 'string' ? JSON.parse(itemFromStore) : undefined;
    return typeof valueFromStore === 'boolean' ? valueFromStore : false;
  }

  private getLocalStorageKey(key: string): string {
    return FeatureFlagStore.keyPrefix + key;
  }

  private retrieveFeatureFlagsIfMissing(): void {
    if (this.remoteFlagCacheExpiry <= new Date() && this.onlineStatusService.isOnline) {
      // Set to the next remote flag cache expiry timestamp for 1 hour so that the null check above returns false
      this.remoteFlagCacheExpiry = new Date(new Date().getTime() + 360_000);
      this.commandService
        .onlineInvoke<{ [key: string]: boolean }>(PROJECTS_URL, 'featureFlags')
        .then(flags => {
          this.remoteFlags = flags ?? {};
          // Set any feature flag values to local storage
          Object.entries(this.remoteFlags).forEach(([key, value]) => this.setEnabled(key, value));
        })
        .catch(e => {
          let recheckInMinutes: number;

          // If the error is from the RPC server, recheck in 5 minutes
          if (e.code < -32000) {
            recheckInMinutes = 5;
          } else {
            // On other errors (server, connection, etc), recheck in 1 minute
            recheckInMinutes = 1;
          }
          this.remoteFlagCacheExpiry = new Date(new Date().getTime() + recheckInMinutes * 60_000);
        });
    }
  }
}

export class FeatureFlagFromStorage implements FeatureFlag {
  constructor(
    private readonly key: string,
    readonly description: string,
    private readonly featureFlagStore: FeatureFlagStore
  ) {}

  get readonly(): boolean {
    return this.featureFlagStore.isReadOnly(this.key);
  }

  get enabled(): boolean {
    return this.featureFlagStore.isEnabled(this.key);
  }

  set enabled(value: boolean) {
    this.featureFlagStore.setEnabled(this.key, value);
  }
}

@Injectable({
  providedIn: 'root'
})
export class FeatureFlagService {
  constructor(private readonly featureFlagStore: FeatureFlagStore) {}

  readonly showFeatureFlags: FeatureFlag = new FeatureFlagFromStorage(
    'SHOW_FEATURE_FLAGS',
    'Show feature flags',
    this.featureFlagStore
  );

  readonly showNonPublishedLocalizations: FeatureFlag = new FeatureFlagFromStorage(
    'SHOW_NON_PUBLISHED_LOCALIZATIONS',
    'Show non-published localizations',
    this.featureFlagStore
  );

  readonly showNmtDrafting: FeatureFlag = new FeatureFlagFromStorage(
    'SHOW_NMT_DRAFTING',
    'Show NMT drafting',
    this.featureFlagStore
  );

  readonly allowForwardTranslationNmtDrafting: FeatureFlag = new FeatureFlagFromStorage(
    'ALLOW_FORWARD_TRANSLATION_NMT_DRAFTING',
    'Allow Forward Translation NMT drafting',
    this.featureFlagStore
  );

  readonly scriptureAudio: FeatureFlag = new FeatureFlagFromStorage(
    'SCRIPTURE_AUDIO',
    'Scripture audio',
    this.featureFlagStore
  );

  readonly preventOpSubmission: FeatureFlag = new FeatureFlagFromStorage(
    'PREVENT_OP_SUBMISSION',
    'Prevent op submission (intentionally breaks things)',
    this.featureFlagStore
  );

  readonly preventOpAcknowledgement: FeatureFlag = new FeatureFlagFromStorage(
    'PREVENT_OP_ACKNOWLEDGEMENT',
    'Prevent op acknowledgement (intentionally breaks things)',
    this.featureFlagStore
  );

  readonly stillness: FeatureFlag = new FeatureFlagFromStorage(
    'STILLNESS',
    'Stillness (non-distracting progress indicators)',
    this.featureFlagStore
  );

  get featureFlags(): FeatureFlag[] {
    return Object.values(this).filter(value => value instanceof FeatureFlagFromStorage);
  }
}
