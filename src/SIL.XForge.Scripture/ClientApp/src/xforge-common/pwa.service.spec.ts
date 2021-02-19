import { HttpClient } from '@angular/common/http';
import { SwUpdate } from '@angular/service-worker';
import { instance, mock } from 'ts-mockito';
import { LocationService } from './location.service';
import { PwaService } from './pwa.service';

describe('PwaService', () => {
  let env: TestEnvironment;

  beforeEach(() => {
    env = new TestEnvironment();
  });

  it('offline when navigator is set to offline', () => {
    env.onlineStatus = false;
    expect(env.pwaService.isOnline).toBe(false);
  });

  it('online when navigator is set to online', () => {
    env.onlineStatus = true;
    expect(env.pwaService.isOnline).toBe(true);
  });

  it('switch to offline when navigator changes status', () => {
    env.onlineStatus = true;
    expect(env.pwaService.isOnline).toBe(true);
    env.onlineStatus = false;
    expect(env.pwaService.isOnline).toBe(false);
  });

  it('switch to online when navigator changes status', () => {
    env.onlineStatus = false;
    expect(env.pwaService.isOnline).toBe(false);
    env.onlineStatus = true;
    expect(env.pwaService.isOnline).toBe(true);
  });

  it('switch to offline when navigator is online but websocket status is false', () => {
    env.onlineStatus = true;
    expect(env.pwaService.isOnline).toBe(true);
    env.pwaService.webSocketResponse = false;
    expect(env.pwaService.isOnline).toBe(false);
  });

  it('switch to online when navigator is online and websocket comes back online', () => {
    env.onlineStatus = true;
    expect(env.pwaService.isOnline).toBe(true);
    env.pwaService.webSocketResponse = false;
    expect(env.pwaService.isOnline).toBe(false);
    env.pwaService.webSocketResponse = true;
    expect(env.pwaService.isOnline).toBe(true);
  });
});

class TestEnvironment {
  readonly pwaService: PwaService;
  private navigatorOnline: boolean = true;

  constructor() {
    const mockedHttpClient = mock(HttpClient);
    const mockedSwUpdate = mock(SwUpdate);
    const mockedLocationService = mock(LocationService);
    this.pwaService = new PwaService(
      instance(mockedHttpClient),
      instance(mockedSwUpdate),
      instance(mockedLocationService)
    );
    spyOnProperty(window.navigator, 'onLine').and.returnValue(this.navigatorOnline);
  }

  set onlineStatus(status: boolean) {
    this.navigatorOnline = status;
    window.dispatchEvent(new Event(status ? 'online' : 'offline'));
  }
}
