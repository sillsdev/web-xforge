import { fakeAsync, tick } from '@angular/core/testing';
import { SwUpdate, VersionEvent, VersionReadyEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { instance, mock, resetCalls, verify, when } from 'ts-mockito';
import { LocalSettingsService } from 'xforge-common/local-settings.service';
import { LocationService } from './location.service';
import { PwaService, PWA_CHECK_FOR_UPDATES, BeforeInstallPromptEvent, InstallPromptOutcome } from './pwa.service';

const mockedSwUpdate = mock(SwUpdate);
const mockedLocationService = mock(LocationService);
const mockedLocalSettingsService = mock(LocalSettingsService);

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
    window.dispatchEvent(new Event('beforeinstallprompt'));
    expect(canInstall).toEqual(true);
    env.dispose();
  }));

  it('can install', fakeAsync(() => {
    const env = new TestEnvironment();
    let canInstall = false;
    env.pwaService.canInstall$.subscribe((_install: boolean) => {
      canInstall = _install;
    });
    const beforeInstallPromptEvent: BeforeInstallPromptEvent = {
      prompt: () => new Promise(r => r({ outcome: 'accepted' } as InstallPromptOutcome))
    };
    window.dispatchEvent(new Event('beforeinstallprompt'));
    (env.pwaService as any).promptEvent = beforeInstallPromptEvent;
    spyOn(window, 'matchMedia').and.returnValue({
      matches: true
    } as any);
    expect(canInstall).toEqual(true);
    env.pwaService.install();
    tick();
    expect(canInstall).toEqual(false);
    env.dispose();
  }));
});

class TestEnvironment {
  readonly pwaService: PwaService;
  private versionUpdates$: Subject<VersionEvent> = new Subject<VersionEvent>();

  constructor() {
    when(mockedSwUpdate.isEnabled).thenReturn(true);
    this.pwaService = new PwaService(
      instance(mockedSwUpdate),
      instance(mockedLocationService),
      instance(mockedLocalSettingsService)
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
