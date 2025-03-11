import { HttpClient } from '@angular/common/http';
import { fakeAsync, flush } from '@angular/core/testing';
import { instance, mock, when } from 'ts-mockito';
import { OnlineStatusService } from './online-status.service';
import { noopDestroyRef } from './realtime.service';

const mockedHttpClient = mock(HttpClient);
const mockedNavigator = mock(Navigator);

describe('OnlineStatusService', () => {
  it('offline when navigator is set to offline', fakeAsync(() => {
    const env = new TestEnvironment();
    env.onlineStatus = false;
    expect(env.onlineStatusService.isOnline).toBe(false);
  }));

  it('online when navigator is set to online', fakeAsync(() => {
    const env = new TestEnvironment();
    env.onlineStatus = true;
    expect(env.onlineStatusService.isOnline).toBe(true);
  }));

  it('switch to offline when navigator changes status', fakeAsync(() => {
    const env = new TestEnvironment();
    env.onlineStatus = true;
    expect(env.onlineStatusService.isOnline).toBe(true);
    env.onlineStatus = false;
    expect(env.onlineStatusService.isOnline).toBe(false);
  }));

  it('switch to online when navigator changes status', fakeAsync(() => {
    const env = new TestEnvironment();
    env.onlineStatus = false;
    expect(env.onlineStatusService.isOnline).toBe(false);
    env.onlineStatus = true;
    expect(env.onlineStatusService.isOnline).toBe(true);
  }));

  it('informs the caller when the user is back online', fakeAsync(() => {
    const env = new TestEnvironment();
    env.onlineStatus = false;
    let onlineFiredCount = 0;
    env.onlineStatusService.online.then(() => onlineFiredCount++);
    flush();
    expect(onlineFiredCount).toBe(0);

    env.onlineStatus = true;
    flush();
    expect(onlineFiredCount).toBe(1);

    env.onlineStatusService.online.then(() => onlineFiredCount++);
    flush();
    expect(onlineFiredCount).toBe(2);

    env.onlineStatus = false;
    env.onlineStatusService.online.then(() => onlineFiredCount++);
    flush();
    expect(onlineFiredCount).toBe(2);
  }));

  it('switch to offline when navigator is online but websocket status is false', fakeAsync(() => {
    const env = new TestEnvironment();
    env.onlineStatus = true;
    expect(env.onlineStatusService.isOnline).toBe(true);
    env.onlineStatusService.webSocketResponse = false;
    expect(env.onlineStatusService.isOnline).toBe(false);
  }));

  it('switch to online when navigator is online and websocket comes back online', fakeAsync(() => {
    const env = new TestEnvironment();
    env.onlineStatus = true;
    expect(env.onlineStatusService.isOnline).toBe(true);
    env.onlineStatusService.webSocketResponse = false;
    expect(env.onlineStatusService.isOnline).toBe(false);
    env.onlineStatusService.webSocketResponse = true;
    expect(env.onlineStatusService.isOnline).toBe(true);
  }));
});

class TestEnvironment {
  readonly onlineStatusService: OnlineStatusService;
  private navigatorOnline: boolean = true;

  constructor() {
    when(mockedNavigator.onLine).thenCall(() => this.navigatorOnline);
    this.onlineStatusService = new OnlineStatusService(
      instance(mockedHttpClient),
      instance(mockedNavigator),
      noopDestroyRef
    );
  }

  set onlineStatus(status: boolean) {
    this.navigatorOnline = status;
    window.dispatchEvent(new Event(status ? 'online' : 'offline'));
  }
}
