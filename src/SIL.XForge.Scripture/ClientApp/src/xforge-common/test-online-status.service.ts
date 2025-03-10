import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { of, throwError } from 'rxjs';
import { anything, instance, spy, when } from 'ts-mockito';
import { OnlineStatusService } from './online-status.service';
import { QuietDestroyRef } from './utils';

/** This class is a helper for tests. */
@Injectable({
  providedIn: 'root'
})
export class TestOnlineStatusService extends OnlineStatusService {
  constructor(
    public readonly httpClient: HttpClient,
    public readonly mockedNavigator: Navigator,
    destroyRef: QuietDestroyRef
  ) {
    super(httpClient, instance(mockedNavigator), destroyRef);
    this.setIsOnline(true);
    this.setRealtimeServerSocketIsOnline(true);
  }

  /** Set that the browser is online or offline. */
  public setIsOnline(value: boolean): void {
    when(this.mockedNavigator.onLine).thenReturn(value);
    const httpClientSpy = spy(this.httpClient);
    if (value) {
      when(httpClientSpy.get('ping', anything())).thenCall(() => of('ok'));
    } else {
      when(httpClientSpy.get('ping', anything())).thenReturn(throwError(() => 'error'));
    }
    window.dispatchEvent(new Event(value ? 'online' : 'offline'));
  }

  /** Set that the realtime server connection is online or offline. */
  public setRealtimeServerSocketIsOnline(value: boolean): void {
    this.webSocketResponse = value;
  }
}
