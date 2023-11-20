import { Injectable } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { interval, Observable } from 'rxjs';
import { filter, takeUntil } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { LocationService } from './location.service';

export const PWA_CHECK_FOR_UPDATES = 30_000;

@Injectable({
  providedIn: 'root'
})
export class PwaService extends SubscriptionDisposable {
  private readonly _canInstall: Promise<true>;
  private promptEvent?: any;

  constructor(private readonly updates: SwUpdate, private readonly locationService: LocationService) {
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
    // TODO: Set correct event type
    this._canInstall = new Promise(resolve => {
      window.addEventListener('beforeinstallprompt', (event: any) => {
        event.preventDefault();
        this.promptEvent = event;
        console.log(this.isInstalled);
        resolve(true);
      });
    });
  }

  get canInstall(): Promise<true> {
    return this._canInstall;
  }

  get hasUpdate$(): Observable<VersionReadyEvent> {
    // Note that this isn't consistent on localhost unless port forwarding to another device
    // An event is triggered but VersionInstallationFailedEvent is emitted instead - refreshing loads the latest version
    return this.updates.versionUpdates.pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'));
  }

  get isInstalled(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches;
  }

  activateUpdates(): void {
    this.updates.activateUpdate();
    this.locationService.reload();
  }
}
