import { Injectable } from '@angular/core';

interface FeatureFlagStore {
  enabled: boolean;
}

// This would be the simplest possible feature flag store, which only keeps the property in memory:
// class MemoryFlagStore implements FeatureFlagStore {
//   constructor(public enabled: boolean = false) {}
// }

class LocalStorageFlagStore implements FeatureFlagStore {
  static readonly keyPrefix = 'SF_FEATURE_FLAG_';

  private readonly featureFlagKey: string;
  private _enabled: boolean;

  constructor(key: string, defaultValue: boolean = false) {
    this.featureFlagKey = LocalStorageFlagStore.keyPrefix + key;
    const itemFromStore: string | null = localStorage.getItem(this.featureFlagKey);
    const valueFromStore: string | undefined =
      typeof itemFromStore === 'string' ? JSON.parse(itemFromStore) : undefined;
    this._enabled = typeof valueFromStore === 'boolean' ? valueFromStore : defaultValue;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = value;
    localStorage.setItem(this.featureFlagKey, JSON.stringify(value));
  }
}

export class FeatureFlag {
  constructor(private readonly storage: FeatureFlagStore, readonly description: string) {}

  get enabled(): boolean {
    return this.storage.enabled;
  }

  set enabled(value: boolean) {
    this.storage.enabled = value;
  }
}

@Injectable({
  providedIn: 'root'
})
export class FeatureFlagService {
  constructor() {}

  showFeatureFlags: FeatureFlag = new FeatureFlag(
    new LocalStorageFlagStore('SHOW_FEATURE_FLAGS'),
    'Show feature flags'
  );

  showNonPublishedLocalizations: FeatureFlag = new FeatureFlag(
    new LocalStorageFlagStore('SHOW_NON_PUBLISHED_LOCALIZATIONS'),
    'Show non-published localizations'
  );

  allowAddingNotes: FeatureFlag = new FeatureFlag(
    new LocalStorageFlagStore('ALLOW_ADDING_NOTES'),
    'Allow adding notes'
  );

  showNmtDrafting: FeatureFlag = new FeatureFlag(new LocalStorageFlagStore('SHOW_NMT_DRAFTING'), 'Show NMT drafting');

  eAudio: FeatureFlag = new FeatureFlag(new LocalStorageFlagStore('SCRIPTURE_AUDIO'), 'Scripture audio');

  preventOpSubmission: FeatureFlag = new FeatureFlag(
    new LocalStorageFlagStore('PREVENT_OP_SUBMISSION'),
    'Prevent op submission (intentionally breaks things)'
  );

  preventOpAcknowledgement: FeatureFlag = new FeatureFlag(
    new LocalStorageFlagStore('PREVENT_OP_ACKNOWLEDGEMENT'),
    'Prevent op acknowledgement (intentionally breaks things)'
  );

  stillness: FeatureFlag = new FeatureFlag(
    new LocalStorageFlagStore('STILLNESS'),
    'Stillness (non-distracting progress indicators)'
  );

  get featureFlags(): FeatureFlag[] {
    return Object.values(this).filter(value => value instanceof FeatureFlag);
  }
}
