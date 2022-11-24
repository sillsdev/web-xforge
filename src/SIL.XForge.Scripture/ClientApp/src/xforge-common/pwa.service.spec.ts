import { HttpClient } from '@angular/common/http';
import { fakeAsync, flush, tick } from '@angular/core/testing';
import { SwUpdate, VersionEvent, VersionReadyEvent } from '@angular/service-worker';
import { instance, mock, verify, when } from 'ts-mockito';
import { Subject } from 'rxjs';
import { LocationService } from './location.service';
import { PWA_CHECK_FOR_UPDATES, PwaService } from './pwa.service';

const mockedHttpClient = mock(HttpClient);
const mockedSwUpdate = mock(SwUpdate);
const mockedLocationService = mock(LocationService);

describe('PwaService', () => {
  it('offline when navigator is set to offline', () => {
    const env = new TestEnvironment();
    env.onlineStatus = false;
    expect(env.pwaService.isOnline).toBe(false);
    env.dispose();
  });

  it('online when navigator is set to online', () => {
    const env = new TestEnvironment();
    env.onlineStatus = true;
    expect(env.pwaService.isOnline).toBe(true);
    env.dispose();
  });

  it('switch to offline when navigator changes status', () => {
    const env = new TestEnvironment();
    env.onlineStatus = true;
    expect(env.pwaService.isOnline).toBe(true);
    env.onlineStatus = false;
    expect(env.pwaService.isOnline).toBe(false);
    env.dispose();
  });

  it('switch to online when navigator changes status', () => {
    const env = new TestEnvironment();
    env.onlineStatus = false;
    expect(env.pwaService.isOnline).toBe(false);
    env.onlineStatus = true;
    expect(env.pwaService.isOnline).toBe(true);
    env.dispose();
  });

  it('informs the caller when the user is back online', fakeAsync(() => {
    const env = new TestEnvironment();
    env.onlineStatus = false;
    let onlineFiredCount = 0;
    env.pwaService.online.then(() => onlineFiredCount++);
    flush();
    expect(onlineFiredCount).toBe(0);

    env.onlineStatus = true;
    flush();
    expect(onlineFiredCount).toBe(1);

    env.pwaService.online.then(() => onlineFiredCount++);
    flush();
    expect(onlineFiredCount).toBe(2);

    env.onlineStatus = false;
    env.pwaService.online.then(() => onlineFiredCount++);
    flush();
    expect(onlineFiredCount).toBe(2);
    env.dispose();
  }));

  it('switch to offline when navigator is online but websocket status is false', () => {
    const env = new TestEnvironment();
    env.onlineStatus = true;
    expect(env.pwaService.isOnline).toBe(true);
    env.pwaService.webSocketResponse = false;
    expect(env.pwaService.isOnline).toBe(false);
    env.dispose();
  });

  it('switch to online when navigator is online and websocket comes back online', () => {
    const env = new TestEnvironment();
    env.onlineStatus = true;
    expect(env.pwaService.isOnline).toBe(true);
    env.pwaService.webSocketResponse = false;
    expect(env.pwaService.isOnline).toBe(false);
    env.pwaService.webSocketResponse = true;
    expect(env.pwaService.isOnline).toBe(true);
    env.dispose();
  });

  it('checks for updates', fakeAsync(() => {
    const env = new TestEnvironment();
    // Shouldn't run immediately
    verify(mockedSwUpdate.checkForUpdate()).never();
    // Run after initial timer
    tick(PWA_CHECK_FOR_UPDATES);
    verify(mockedSwUpdate.checkForUpdate()).once();
    // Ensure it is still running
    tick(PWA_CHECK_FOR_UPDATES);
    verify(mockedSwUpdate.checkForUpdate()).twice();
    expect().nothing();
    env.dispose();
  }));

  it('hasUpdate should emit on VERSION_READY', () => {
    const env = new TestEnvironment();
    let isVersionReady = false;
    env.pwaService.hasUpdate.subscribe((event: VersionReadyEvent) => {
      expect(event.type).toEqual('VERSION_READY');
      isVersionReady = true;
    });
    env.triggerVersionEvent('VERSION_READY');
    expect(isVersionReady).toEqual(true);
    env.dispose();
  });
});

class TestEnvironment {
  readonly pwaService: PwaService;
  private navigatorOnline: boolean = true;
  private versionUpdates$: Subject<VersionEvent> = new Subject<VersionEvent>();

  constructor() {
    this.pwaService = new PwaService(
      instance(mockedHttpClient),
      instance(mockedSwUpdate),
      instance(mockedLocationService)
    );
    spyOnProperty(window.navigator, 'onLine').and.returnValue(this.navigatorOnline);
    when(mockedSwUpdate.versionUpdates).thenReturn(this.versionUpdates$);
  }

  set onlineStatus(status: boolean) {
    this.navigatorOnline = status;
    window.dispatchEvent(new Event(status ? 'online' : 'offline'));
  }

  dispose() {
    this.pwaService.dispose();
  }

  triggerVersionEvent(type: 'VERSION_DETECTED' | 'VERSION_READY' | 'VERSION_INSTALLATION_FAILED') {
    this.versionUpdates$.next({ currentVersion: {}, latestVersion: {}, type } as VersionEvent);
  }
}
