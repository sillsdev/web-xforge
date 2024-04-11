import { Inject, Injectable } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { BehaviorSubject, interval, Observable } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { WINDOW } from 'xforge-common/browser-globals';
import { LocalSettingsService } from 'xforge-common/local-settings.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { LocationService } from './location.service';

export const PWA_CHECK_FOR_UPDATES = 30_000;
export const PWA_PROMPT_LAST_SEEN = 'pwa_prompt_last_seen';
export const PWA_BEFORE_PROMPT_CAN_BE_SHOWN_AGAIN = 86400 * 7;

// Chromium browsers support an experimental event to prompt users to install a PWA
// if it is available.
// https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent
export interface BeforeInstallPromptEvent {
  prompt: () => Promise<InstallPromptOutcome>;
}
// The promise informs the outcome of the users interaction with the prompt from the BeforeInstallPromptEvent
// https://developer.mozilla.org/en-US/docs/Web/API/BeforeInstallPromptEvent/prompt
export interface InstallPromptOutcome {
  outcome: 'dismissed' | 'accepted';
}

@Injectable({
  providedIn: 'root'
})
export class PwaService extends SubscriptionDisposable {
  private readonly _canInstall$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private promptEvent?: BeforeInstallPromptEvent;

  constructor(
    private readonly updates: SwUpdate,
    private readonly locationService: LocationService,
    private readonly localSettings: LocalSettingsService,
    @Inject(WINDOW) private window: Window
  ) {
    super();

    // Check for updates periodically if enabled and the browser supports it
    if (this.updates.isEnabled) {
      const checkForUpdatesInterval$ = interval(PWA_CHECK_FOR_UPDATES)
        .pipe(takeUntil(this.ngUnsubscribe))
        .subscribe(() =>
          this.updates.checkForUpdate().catch((error: any) => {
            // Stop checking for updates and throw the error
            checkForUpdatesInterval$.unsubscribe();
            throw new Error(error);
          })
        );
    }

    if (this.updates.isEnabled && !this.isRunningInstalledApp) {
      // Currently beforeinstallprompt and appinstalled is only supported by Chromium browsers
      this.window.addEventListener('beforeinstallprompt', (event: any) => {
        event.preventDefault();
        this.promptEvent = event;
        this._canInstall$.next(true);
      });
      this.window.addEventListener('appinstalled', () => {
        this._canInstall$.next(false);
      });
    }
  }

  get canInstall$(): Observable<boolean> {
    return this._canInstall$.asObservable();
  }

  get installPromptLastShownTime(): number {
    return this.localSettings.get(PWA_PROMPT_LAST_SEEN) ?? 0;
  }

  get hasUpdate$(): Observable<VersionReadyEvent> {
    // Note that this isn't consistent on localhost unless port forwarding to another device
    // An event is triggered but VersionInstallationFailedEvent is emitted instead - refreshing loads the latest version
    return this.updates.versionUpdates.pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'));
  }

  /**
   * Check if the browser instance is running in standalone mode which is typical of an
   * installed PWA. This is supported across all browsers.
   */
  get isRunningInstalledApp(): boolean {
    return this.window.matchMedia('(display-mode: standalone)').matches;
  }

  activateUpdates(): void {
    this.updates.activateUpdate();
    this.locationService.reload();
  }

  async install(): Promise<void> {
    await this.promptEvent?.prompt();
  }

  setInstallPromptLastShownTime(): void {
    this.localSettings.set(PWA_PROMPT_LAST_SEEN, Date.now());
  }
}
