import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { BehaviorSubject, fromEvent, interval, merge, Observable, of } from 'rxjs';
import { filter, mapTo, take } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { LocationService } from './location.service';

export const PWA_CHECK_FOR_UPDATES = 30_000;

@Injectable({
  providedIn: 'root'
})
export class PwaService extends SubscriptionDisposable {
  private appOnlineStatus: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(navigator.onLine);
  private windowOnLineStatus: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(navigator.onLine);
  private webSocketStatus: BehaviorSubject<boolean | null> = new BehaviorSubject<boolean | null>(null);

  constructor(
    private readonly http: HttpClient,
    private readonly updates: SwUpdate,
    private readonly locationService: LocationService
  ) {
    super();
    // Check for any online changes from the browser window
    this.subscribe(
      merge(
        of(navigator.onLine),
        fromEvent(window, 'online').pipe(mapTo(true)),
        fromEvent(window, 'offline').pipe(mapTo(false))
      ),
      status => {
        // Note that this isn't 100% as accurate as it sounds. "Online" simply means a valid network connection
        // and not a valid Internet connection. The websocket is another fallback which is constantly polled
        this.windowOnLineStatus.next(status);
      }
    );
    // Check for changes to the online status or from the web socket status
    this.subscribe(merge(this.windowOnLineStatus.asObservable(), this.webSocketStatus.asObservable()), () => {
      // The app is "online" if the browser/network thinks it's online AND
      // we have a valid web socket connection OR
      //    the web socket hasn't yet had a chance to connect i.e. (null) when the app first loads
      this.appOnlineStatus.next(this.windowOnLineStatus.getValue() && this.webSocketStatus.getValue() !== false);
    });
    // Check for updates periodically
    const checkForUpdatesInterval = interval(PWA_CHECK_FOR_UPDATES).subscribe(() =>
      this.updates.checkForUpdate().catch(() => {
        // Stop checking for updates if the browser doesn't support it
        checkForUpdatesInterval.unsubscribe();
      })
    );
  }

  get isBrowserOnline(): boolean {
    return this.windowOnLineStatus.getValue();
  }

  get isOnline(): boolean {
    return this.appOnlineStatus.getValue();
  }

  get onlineBrowserStatus(): Observable<boolean> {
    return this.windowOnLineStatus.asObservable();
  }

  get onlineStatus(): Observable<boolean> {
    return this.appOnlineStatus.asObservable();
  }

  get hasUpdate(): Observable<VersionReadyEvent> {
    // Note that this isn't consistent on localhost unless port forwarding to another device
    // An event is triggered but VersionInstallationFailedEvent is emitted instead - refreshing loads the latest version
    return this.updates.versionUpdates.pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'));
  }

  set webSocketResponse(status: boolean) {
    if (status !== this.webSocketStatus.getValue()) {
      this.webSocketStatus.next(status);
    }
  }

  /**
   * Returns a promise that will resolve immediately if the user is online, or when the user comes online.
   */
  get online(): Promise<void> {
    return new Promise<void>(resolve => {
      this.onlineStatus
        .pipe(
          filter(isOnline => isOnline),
          take(1)
        )
        .toPromise()
        .then(() => resolve());
    });
  }

  async checkOnline(): Promise<boolean> {
    if (!navigator.onLine) {
      return false;
    }
    try {
      return (await this.http.get('ping', { responseType: 'text' }).toPromise()) === 'ok';
    } catch {
      return false;
    }
  }

  activateUpdates(): void {
    this.updates.activateUpdate();
    this.locationService.reload();
  }
}
