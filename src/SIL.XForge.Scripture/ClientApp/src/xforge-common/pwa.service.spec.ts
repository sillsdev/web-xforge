import { TestBed } from '@angular/core/testing';
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
    this.pwaService = new PwaService();
    spyOnProperty(window.navigator, 'onLine').and.returnValue(this.navigatorOnline);
  }

  set onlineStatus(status: boolean) {
    this.navigatorOnline = status;
    window.dispatchEvent(new Event(status ? 'online' : 'offline'));
  }
}
