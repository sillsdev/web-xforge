import { HttpClient } from '@angular/common/http';
import { Inject, Injectable } from '@angular/core';
import { BehaviorSubject, firstValueFrom, fromEvent, merge, Observable, of } from 'rxjs';
import { filter, map, take } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { NAVIGATOR } from './browser-globals';

@Injectable({
  providedIn: 'root'
})
export class OnlineStatusService extends SubscriptionDisposable {
  readonly onlineBrowserStatus$: Observable<boolean>;
  readonly onlineStatus$: Observable<boolean>;
  protected appOnlineStatus$: BehaviorSubject<boolean>;
  protected windowOnLineStatus$: BehaviorSubject<boolean>;
  private webSocketStatus$: BehaviorSubject<boolean | null> = new BehaviorSubject<boolean | null>(null);

  constructor(
    protected readonly http: HttpClient,
    @Inject(NAVIGATOR) protected readonly navigator: Navigator
  ) {
    super();
    this.appOnlineStatus$ = new BehaviorSubject<boolean>(this.navigator.onLine);
    this.windowOnLineStatus$ = new BehaviorSubject<boolean>(this.navigator.onLine);
    this.onlineBrowserStatus$ = this.windowOnLineStatus$.asObservable();
    this.onlineStatus$ = this.appOnlineStatus$.asObservable();
    // Check for any online changes from the browser window
    this.subscribe(
      merge(
        of(this.navigator.onLine),
        fromEvent(window, 'online').pipe(map(() => true)),
        fromEvent(window, 'offline').pipe(map(() => false))
      ),
      status => {
        // Note that this isn't 100% as accurate as it sounds. "Online" simply means a valid network connection
        // and not a valid Internet connection. The websocket is another fallback which is constantly polled
        this.windowOnLineStatus$.next(status);
      }
    );

    // Check for changes to the online status or from the web socket status
    this.subscribe(merge(this.windowOnLineStatus$.asObservable(), this.webSocketStatus$.asObservable()), () => {
      // The app is "online" if the browser/network thinks it's online AND
      // we have a valid web socket connection OR
      //    the web socket hasn't yet had a chance to connect i.e. (null) when the app first loads
      this.appOnlineStatus$.next(this.windowOnLineStatus$.getValue() && this.webSocketStatus$.getValue() !== false);
    });
  }

  get isBrowserOnline(): boolean {
    return this.windowOnLineStatus$.getValue();
  }

  get isOnline(): boolean {
    return this.appOnlineStatus$.getValue();
  }

  set webSocketResponse(status: boolean) {
    if (status !== this.webSocketStatus$.getValue()) {
      this.webSocketStatus$.next(status);
    }
  }

  /**
   * Returns a promise that will resolve immediately if the user is online, or when the user comes online.
   */
  get online(): Promise<void> {
    return new Promise<void>(resolve => {
      firstValueFrom(
        this.onlineStatus$.pipe(
          filter(isOnline => isOnline),
          take(1)
        )
      ).then(() => resolve());
    });
  }

  async checkOnline(): Promise<boolean> {
    if (!this.navigator.onLine) {
      return false;
    }
    try {
      return (await firstValueFrom(this.http.get('ping', { responseType: 'text' }))) === 'ok';
    } catch {
      return false;
    }
  }
}
