import { Injectable } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { BehaviorSubject, interval, Observable } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { LocalSettingsService } from 'xforge-common/local-settings.service';
import { LocationService } from './location.service';

export const PWA_CHECK_FOR_UPDATES = 30_000;
export const PWA_LAST_PROMPT_SEEN = 'last_pwa_prompt_seen';
export interface BeforeInstallPromptEvent {
  prompt: () => Promise<InstallPromptOutcome>;
}
export interface InstallPromptOutcome {
  outcome: 'dismissed' | 'accepted';
  platform: string;
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
    private readonly localSettings: LocalSettingsService
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
      // Currently beforeinstallprompt is only supported by Chromium browsers
      window.addEventListener('beforeinstallprompt', (event: any) => {
        event.preventDefault();
        this.promptEvent = event;
        this._canInstall$.next(true);
      });
    }
  }

  get canInstall$(): BehaviorSubject<boolean> {
    return this._canInstall$;
  }

  get getLastPromptSeen(): number {
    return this.localSettings.get(PWA_LAST_PROMPT_SEEN) ?? 0;
  }

  get hasUpdate$(): Observable<VersionReadyEvent> {
    // Note that this isn't consistent on localhost unless port forwarding to another device
    // An event is triggered but VersionInstallationFailedEvent is emitted instead - refreshing loads the latest version
    return this.updates.versionUpdates.pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'));
  }

  get isRunningInstalledApp(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches;
  }

  activateUpdates(): void {
    this.updates.activateUpdate();
    this.locationService.reload();
  }

  install(): void {
    if (this.promptEvent != null) {
      this.promptEvent?.prompt().then((result: InstallPromptOutcome) => {
        if (result.outcome === 'accepted') {
          this.canInstall$.next(!this.isRunningInstalledApp);
        }
      });
    }
  }
}
