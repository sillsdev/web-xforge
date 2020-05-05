import { Injectable } from '@angular/core';
import { BehaviorSubject, fromEvent, merge, Observable, of } from 'rxjs';
import { mapTo } from 'rxjs/operators';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class PwaService extends SubscriptionDisposable {
  private appOnlineStatus: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(navigator.onLine);
  private windowOnLineStatus: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(navigator.onLine);
  private webSocketStatus: BehaviorSubject<boolean | null> = new BehaviorSubject<boolean | null>(null);

  constructor() {
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
      if (environment.production) {
        // For the time being we don't want to simulate going online/offline on production so always return online
        this.appOnlineStatus.next(true);
      } else {
        this.appOnlineStatus.next(this.windowOnLineStatus.getValue() && this.webSocketStatus.getValue() !== false);
      }
    });
  }

  get isOnline(): boolean {
    return this.appOnlineStatus.getValue();
  }

  get onlineStatus(): Observable<boolean> {
    return this.appOnlineStatus.asObservable();
  }

  set webSocketResponse(status: boolean) {
    this.webSocketStatus.next(status);
  }
}
