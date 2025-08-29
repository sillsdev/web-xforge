import { DestroyRef, Injectable } from '@angular/core';
import { BehaviorSubject, distinctUntilChanged, Observable, Subject } from 'rxjs';
import { AnonymousService } from 'xforge-common/anonymous.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
export interface FeatureFlag {
  readonly key: string;
  readonly description: string;
  readonly position: number;
  readonly readonly: boolean;
  get enabled(): boolean;
  set enabled(value: boolean);
}

export interface ObservableFeatureFlag extends FeatureFlag {
  enabled$: Observable<boolean>;
}

interface IFeatureFlagStore {
  destroyRef: DestroyRef;
  enabled$: Observable<{ key: string; value: boolean }>;
  isEnabled(key: string): boolean;
  isReadOnly(key: string): boolean;
  setEnabled(key: string, value: boolean): void;
}

@Injectable({
  providedIn: 'root'
})
export class FeatureFlagStore implements IFeatureFlagStore {
  static readonly keyPrefix = 'SF_FEATURE_FLAG_';
  private localFlags: { [key: string]: boolean } = {};
  private remoteFlags: { [key: string]: boolean } = {};
  private remoteFlagCacheExpiry?: Date = undefined;
  private enabledSource$ = new Subject<{ key: string; value: boolean }>();
  enabled$ = this.enabledSource$.asObservable();

  constructor(
    private readonly anonymousService: AnonymousService,
    private readonly onlineStatusService: OnlineStatusService,
    readonly destroyRef: DestroyRef
  ) {
    // Cause the flags to be reloaded when coming online
    onlineStatusService.onlineStatus$
      .pipe(distinctUntilChanged(), quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(status => {
        if (status) this.remoteFlagCacheExpiry = new Date();
      });
  }

  isEnabled(key: string): boolean {
    return this.isRemoteEnabled(key) || this.isLocalEnabled(key);
  }

  isReadOnly(key: string): boolean {
    // Keys are only readonly if they are set on the server
    return this.isRemotePresent(key);
  }

  setEnabled(key: string, value: boolean): void {
    // Keys are only set locally
    this.localFlags[key] = value;
    localStorage.setItem(this.getLocalStorageKey(key), JSON.stringify(value));
    this.enabledSource$.next({ key, value });
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

  private isLocalEnabled(key: string): boolean {
    if (this.localFlags[key] === undefined) {
      this.localFlags[key] = this.getFromLocalStorage(key);
    }
    return this.localFlags[key];
  }

  private isLocalPresent(key: string): boolean {
    const itemFromStore: string | null = localStorage.getItem(this.getLocalStorageKey(key));
    const valueFromStore: string | undefined =
      typeof itemFromStore === 'string' ? JSON.parse(itemFromStore) : undefined;
    return typeof valueFromStore === 'boolean' ? true : false;
  }

  private isRemoteEnabled(key: string): boolean {
    this.retrieveFeatureFlagsIfMissing();
    if (Object.entries(this.remoteFlags).length === 0) {
      return false;
    }
    return this.remoteFlags[key] ?? false;
  }

  private isRemotePresent(key: string): boolean {
    this.retrieveFeatureFlagsIfMissing();
    return key in this.remoteFlags;
  }

  private retrieveFeatureFlagsIfMissing(): void {
    // remoteFlagCacheExpiry will be null on startup until Scripture Forge comes online
    if (
      this.remoteFlagCacheExpiry != null &&
      this.remoteFlagCacheExpiry <= new Date() &&
      this.onlineStatusService.isOnline
    ) {
      // Set to the next remote flag cache expiry timestamp for 1 hour so that the null check above returns false
      this.remoteFlagCacheExpiry = new Date(new Date().getTime() + 3_600_000);
      this.anonymousService
        .featureFlags()
        .then(flags => {
          this.remoteFlags = flags ?? {};
          // Set any feature flag values to local storage
          Object.entries(this.remoteFlags).forEach(([key, value]) => {
            if (this.isLocalPresent(key)) {
              this.setEnabled(key, value);
            } else {
              this.enabledSource$.next({ key, value });
            }
          });
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

class FeatureFlagFromStorage implements ObservableFeatureFlag {
  private enabledSource$ = new BehaviorSubject<boolean>(this.featureFlagStore.isEnabled(this.key));
  enabled$ = this.enabledSource$.asObservable(); // This ensures 'next()' is only called here
  constructor(
    readonly key: string,
    readonly description: string,
    readonly position: number,
    private readonly featureFlagStore: IFeatureFlagStore
  ) {
    this.featureFlagStore.enabled$.pipe(quietTakeUntilDestroyed(featureFlagStore.destroyRef)).subscribe(change => {
      if (change.key === this.key) {
        this.enabledSource$.next(change.value);
      }
    });
  }

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

class StaticFeatureFlagStore implements IFeatureFlagStore {
  private readonly = false;
  private enabledSource$ = new Subject<{ key: string; value: boolean }>();
  enabled$ = this.enabledSource$.asObservable();
  destroyRef: DestroyRef = { onDestroy: (_cb: () => void) => () => {} };

  constructor(
    private enabled: boolean,
    config?: { readonly: boolean }
  ) {
    if (config != null) {
      this.readonly = config.readonly;
    }
  }

  isEnabled(_key: string): boolean {
    return this.enabled;
  }

  isReadOnly(_key: string): boolean {
    return this.readonly;
  }

  setEnabled(_key: string, value: boolean): void {
    this.enabled = value;
  }
}

class ServerOnlyFeatureFlag implements FeatureFlag {
  constructor(
    readonly key: string,
    readonly description: string,
    readonly position: number,
    private readonly featureFlagStore: IFeatureFlagStore
  ) {}

  get readonly(): boolean {
    return true;
  }

  get enabled(): boolean {
    return this.featureFlagStore.isEnabled(this.key);
  }

  set enabled(_: boolean) {}
}

@Injectable({
  providedIn: 'root'
})
export class FeatureFlagService {
  constructor(private readonly featureFlagStore: FeatureFlagStore) {}

  // Before you add a new feature flag:
  //
  // NOTE: Be sure when adding new feature flags that you update /scripts/db_tools/parse-version.ts
  //
  // Also, the position is important - this is the bit wise position of the feature flag in the version.
  // The position in the dialog is determined by the order in this class.

  readonly showDeveloperTools: ObservableFeatureFlag = new FeatureFlagFromStorage(
    'SHOW_DEVELOPER_TOOLS',
    'Show developer tools',
    0,
    this.featureFlagStore
  );

  readonly showNonPublishedLocalizations: ObservableFeatureFlag = new FeatureFlagFromStorage(
    'SHOW_NON_PUBLISHED_LOCALIZATIONS',
    'Show non-published localizations',
    1,
    this.featureFlagStore
  );

  readonly showNmtDrafting: FeatureFlag = new ServerOnlyFeatureFlag(
    'SHOW_NMT_DRAFTING',
    'Show NMT drafting',
    2,
    this.featureFlagStore
  );

  readonly allowForwardTranslationNmtDrafting: FeatureFlag = new ServerOnlyFeatureFlag(
    'ALLOW_FORWARD_TRANSLATION_NMT_DRAFTING',
    'Allow Forward Translation NMT drafting',
    3,
    this.featureFlagStore
  );

  readonly scriptureAudio: FeatureFlag = new ServerOnlyFeatureFlag(
    'SCRIPTURE_AUDIO',
    'Scripture audio',
    4,
    this.featureFlagStore
  );

  readonly preventOpSubmission: ObservableFeatureFlag = new FeatureFlagFromStorage(
    'PREVENT_OP_SUBMISSION',
    'Prevent op submission (intentionally breaks things)',
    5,
    this.featureFlagStore
  );

  readonly preventOpAcknowledgement: ObservableFeatureFlag = new FeatureFlagFromStorage(
    'PREVENT_OP_ACKNOWLEDGEMENT',
    'Prevent op acknowledgement (intentionally breaks things)',
    6,
    this.featureFlagStore
  );

  readonly stillness: ObservableFeatureFlag = new FeatureFlagFromStorage(
    'STILLNESS',
    'Stillness (non-distracting progress indicators)',
    7,
    this.featureFlagStore
  );

  readonly machineInProcess: FeatureFlag = new ServerOnlyFeatureFlag(
    'MachineInProcess',
    'Use In-Process Machine for Suggestions',
    8,
    this.featureFlagStore
  );

  readonly serval: FeatureFlag = new ServerOnlyFeatureFlag(
    'Serval',
    'Use Serval for Suggestions',
    9,
    this.featureFlagStore
  );

  readonly useEchoForPreTranslation: FeatureFlag = new ServerOnlyFeatureFlag(
    'UseEchoForPreTranslation',
    'Allow Echo for Pre-Translation Drafting',
    10,
    this.featureFlagStore
  );

  readonly allowFastTraining: FeatureFlag = new ServerOnlyFeatureFlag(
    'ALLOW_FAST_TRAINING',
    'Allow Fast Pre-Translation Training',
    11,
    this.featureFlagStore
  );

  readonly uploadParatextZipForPreTranslation: FeatureFlag = new ServerOnlyFeatureFlag(
    'UploadParatextZipForPreTranslation',
    'Upload Paratext Zip Files for Pre-Translation Drafting',
    12,
    this.featureFlagStore
  );

  readonly allowAdditionalTrainingSource: FeatureFlag = new ServerOnlyFeatureFlag(
    'AllowAdditionalTrainingSource',
    'Allow mixing in an additional training source',
    13,
    this.featureFlagStore
  );

  readonly updatedLearningRateForServal: FeatureFlag = new ServerOnlyFeatureFlag(
    'UpdatedLearningRateForServal',
    'Updated Learning Rate For Serval',
    14,
    this.featureFlagStore
  );

  readonly darkMode: ObservableFeatureFlag = new FeatureFlagFromStorage(
    'DarkMode',
    'Dark mode',
    15,
    this.featureFlagStore
  );

  readonly enableLynxInsights: ObservableFeatureFlag = new FeatureFlagFromStorage(
    'EnableLynxInsights',
    'Enable Lynx insights',
    16,
    this.featureFlagStore
  );

  readonly newDraftHistory: FeatureFlag = new FeatureFlagFromStorage(
    'NewDraftHistory',
    'Preview new draft history interface',
    17,
    new StaticFeatureFlagStore(true)
  );

  readonly usfmFormat: ObservableFeatureFlag = new FeatureFlagFromStorage(
    'UsfmFormat',
    'USFM Format',
    18,
    this.featureFlagStore
  );

  get featureFlags(): FeatureFlag[] {
    return Object.values(this).filter(value => value instanceof FeatureFlagFromStorage);
  }

  get versionSuffix(): string {
    // Get the feature flags, sorted alphabetically
    const featureFlags: FeatureFlag[] = Object.values(this).filter(
      value => value instanceof FeatureFlagFromStorage || value instanceof ServerOnlyFeatureFlag
    );
    featureFlags.sort((a, b) => a.position - b.position);
    const versionNumber = this.getFeatureFlagVersion(featureFlags);
    if (versionNumber === 0) {
      return '';
    } else {
      return '-' + versionNumber;
    }
  }

  getFeatureFlagVersion(featureFlags: FeatureFlag[]): number {
    let versionNumber: number = 0;

    // Get the feature flags as a 32-bit number
    for (const featureFlag of featureFlags) {
      if (featureFlag.enabled) {
        versionNumber += Math.pow(2, featureFlag.position);
      }
    }

    return versionNumber;
  }

  getEnabledFlags(): string[] {
    return this.featureFlags.filter(flag => flag.enabled).map(flag => flag.key);
  }
}

export function createTestFeatureFlag(value: boolean): ObservableFeatureFlag {
  return new FeatureFlagFromStorage('', '', 0, new StaticFeatureFlagStore(value));
}
