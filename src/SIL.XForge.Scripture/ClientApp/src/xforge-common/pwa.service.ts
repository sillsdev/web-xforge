import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { SwUpdate, UpdateAvailableEvent } from '@angular/service-worker';
import { BehaviorSubject, fromEvent, merge, Observable, of } from 'rxjs';
import { filter, mapTo, take } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { LocationService } from './location.service';

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
  }

  get isOnline(): boolean {
    return this.appOnlineStatus.getValue();
  }

  get onlineStatus(): Observable<boolean> {
    return this.appOnlineStatus.asObservable();
  }

  get hasUpdate(): Observable<UpdateAvailableEvent> {
    return this.updates.available;
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
