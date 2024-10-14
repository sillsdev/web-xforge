import { fakeAsync, tick } from '@angular/core/testing';
import { SwUpdate, VersionEvent, VersionReadyEvent } from '@angular/service-worker';
import { BehaviorSubject, Subject } from 'rxjs';
import { instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { WINDOW } from 'xforge-common/browser-globals';
import { LocalSettingsService } from 'xforge-common/local-settings.service';
import { LocationService } from './location.service';
import { InstallPromptOutcome, PwaService, PWA_CHECK_FOR_UPDATES } from './pwa.service';

const mockedSwUpdate = mock(SwUpdate);
const mockedLocationService = mock(LocationService);
const mockedLocalSettingsService = mock(LocalSettingsService);
const mockedWindow: Window = mock(WINDOW);

describe('PwaService', () => {
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

  it('hasUpdate should emit on VERSION_READY', fakeAsync(() => {
    const env = new TestEnvironment();
    let isVersionReady = false;
    env.pwaService.hasUpdate$.subscribe((event: VersionReadyEvent) => {
      expect(event.type).toEqual('VERSION_READY');
      isVersionReady = true;
    });
    env.triggerVersionEvent('VERSION_READY');
    expect(isVersionReady).toEqual(true);
    env.dispose();
  }));

  it('before install prompt should trigger the app as available to install', fakeAsync(() => {
    const env = new TestEnvironment();
    let canInstall = false;
    env.pwaService.canInstall$.subscribe((_install: boolean) => {
      canInstall = _install;
    });
    expect(canInstall).toEqual(false);
    mockedWindow.dispatchEvent(new Event('beforeinstallprompt'));
    expect(canInstall).toEqual(true);
    env.dispose();
  }));

  it('can install', fakeAsync(() => {
    const env = new TestEnvironment();
    let canInstall = false;
    env.pwaService.canInstall$.subscribe((_install: boolean) => {
      canInstall = _install;
    });
    mockedWindow.dispatchEvent(new Event('beforeinstallprompt'));
    TestEnvironment.isRunningInstalledApp$.next(true);
    expect(canInstall).toEqual(true);
    env.pwaService.install();
    mockedWindow.dispatchEvent(new Event('appinstalled'));
    tick();
    expect(canInstall).toEqual(false);
    env.dispose();
  }));
});

class TestEnvironment {
  readonly pwaService: PwaService;
  private versionUpdates$: Subject<VersionEvent> = new Subject<VersionEvent>();
  static isRunningInstalledApp$: BehaviorSubject<boolean> = new BehaviorSubject(false);

  constructor() {
    TestEnvironment.isRunningInstalledApp$.next(false);
    when(mockedSwUpdate.isEnabled).thenReturn(true);
    this.pwaService = new PwaService(
      instance(mockedSwUpdate),
      instance(mockedLocationService),
      instance(mockedLocalSettingsService),
      mockedWindow
    );
    when(mockedSwUpdate.versionUpdates).thenReturn(this.versionUpdates$);
    when(mockedSwUpdate.checkForUpdate()).thenResolve(true);
    resetCalls(mockedSwUpdate);
  }

  dispose(): void {
    this.pwaService.dispose();
  }

  triggerVersionEvent(type: 'VERSION_DETECTED' | 'VERSION_READY' | 'VERSION_INSTALLATION_FAILED'): void {
    this.versionUpdates$.next({ currentVersion: {}, latestVersion: {}, type } as VersionEvent);
  }
}

// Implement required methods for the injected Window
const windowEvents: Record<string, EventListenerOrEventListenerObject[]> = {};
Object.defineProperty(mockedWindow, 'matchMedia', {
  value: () => ({ matches: TestEnvironment.isRunningInstalledApp$.getValue() })
});
Object.defineProperty(mockedWindow, 'preventDefault', {
  value: () => {}
});
Object.defineProperty(mockedWindow, 'addEventListener', {
  value: (eventName: string, listener: EventListenerOrEventListenerObject) => {
    if (windowEvents[eventName] == null) {
      windowEvents[eventName] = [];
    }
    windowEvents[eventName].push(listener);
    return mockedWindow;
  }
});
Object.defineProperty(mockedWindow, 'dispatchEvent', {
  value: (event: Event) => {
    let listeners = windowEvents[event.type];
    if (listeners == null) {
      return undefined;
    }
    for (let listener of listeners) {
      if (typeof listener !== 'function') {
        continue;
      }
      if (event.type === 'beforeinstallprompt') {
        (event as any).prompt = () => new Promise(r => r({ outcome: 'accepted' } as InstallPromptOutcome));
      }
      listener(event);
    }
    return true;
  }
});
