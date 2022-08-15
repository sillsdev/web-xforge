import { Component, DebugElement, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { instance, mock, when } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { PwaService } from 'xforge-common/pwa.service';
import { TestTranslocoModule } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioStatus, AudioTimePipe, CheckingAudioPlayerComponent } from './checking-audio-player.component';

describe('CheckingAudioPlayerComponent', () => {
  const audioFile = 'test-audio-player.webm';
  const audioFileB = 'test-audio-player-b.webm';
  const playerLoadTimeMs = 1000;

  it('should be created', async () => {
    const template =
      '<app-checking-audio-player #player1 id="player1" source="' + audioFile + '"></app-checking-audio-player>';
    const env = new TestEnvironment(template);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.component.player1.enabled).toBe(true);
    expect(env.duration).toBe('0:05');
    expect(env.currentTime).toBe('0:00');
  });

  it('can play', async () => {
    const template =
      '<app-checking-audio-player #player1 id="player1" source="' + audioFile + '"></app-checking-audio-player>';
    const env = new TestEnvironment(template);
    await env.waitForPlayer(playerLoadTimeMs);
    env.clickButton(env.playButton(1));
    await env.waitForPlayer(1500);
    env.fixture.detectChanges();
    env.clickButton(env.pauseButton(1));
    expect(env.currentTime).toBe('0:01');
  });

  it('plays and pauses the other playing audio', async () => {
    const template =
      '<app-checking-audio-player #player1 id="player1" source="' +
      audioFile +
      '"></app-checking-audio-player>' +
      '<app-checking-audio-player #player2 id="player2" source="' +
      audioFileB +
      '"></app-checking-audio-player>';
    const env = new TestEnvironment(template);
    await env.waitForPlayer(playerLoadTimeMs);
    env.clickButton(env.playButton(1));
    await env.waitForPlayer(500);
    expect(env.component.player1.isPlaying).toBe(true);
    env.clickButton(env.playButton(2));
    await env.waitForPlayer(500);
    expect(env.component.player1.isPlaying).toBe(false);
    env.clickButton(env.pauseButton(2));
    expect(env.component.player2.isPlaying).toBe(false);
  });

  it('disables the audio player when audio is reset', async () => {
    const template =
      '<app-checking-audio-player #player1 id="player1" source="' + audioFile + '"></app-checking-audio-player>';
    const env = new TestEnvironment(template);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.component.player1.hasSource).toBe(true);
    env.component.player1.source = '';
    expect(env.component.player1.hasSource).toBe(false);
  });

  it('it notifies the user when audio is unavailable offline', async () => {
    const template = `<app-checking-audio-player #player1 source="https://"></app-checking-audio-player>`;
    const env = new TestEnvironment(template, false);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.component.player1.hasSource).toBe(true);
    expect(env.audioNotAvailableMessage).not.toBeNull();
  });

  it('it can play blobs even when offline', async () => {
    const template = `<app-checking-audio-player #player1 source="${audioFile}"></app-checking-audio-player>`;
    const env = new TestEnvironment(template, false);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.component.player1.hasSource).toBe(true);
    expect(env.audioNotAvailableMessage).toBeNull();
  });

  it('it can play preloaded audio when offline', async () => {
    const template = `<app-checking-audio-player #player1 source="${audioFile}"></app-checking-audio-player>`;
    const env = new TestEnvironment(template, false);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.component.player1.hasSource).toBe(true);
    // The browser is online, but the component thinks it is offline. This simulates the scenario where audio data is
    // already loaded, but the browser is offline.
    expect(env.audioNotAvailableMessage).toBeNull();
  });

  it('show error tooltip if error loading audio while online and the file does not exist', async () => {
    const template =
      '<app-checking-audio-player #player1 source="audio-file-not-exists.webm"></app-checking-audio-player>';
    const env = new TestEnvironment(template, true);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.audioNotAvailableMessage).not.toBeNull();
    expect(env.audioNotAvailableMessage.query(By.css('#error-load'))).not.toBeNull();
    expect(env.component.player1.audioStatus).toEqual(AudioStatus.Unavailable);
    expect(env.playButton(1)).toBeNull();
  });

  it('show error tooltip if error loading audio while offline and the file does not exist', async () => {
    const template =
      '<app-checking-audio-player #player1 source="audio-file-not-exists.webm"></app-checking-audio-player>';
    const env = new TestEnvironment(template, false);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.audioNotAvailableMessage).not.toBeNull();
    expect(env.audioNotAvailableMessage.query(By.css('#error-load'))).not.toBeNull();
    expect(env.component.player1.audioStatus).toEqual(AudioStatus.Offline);
    expect(env.playButton(1)).toBeNull();
  });

  it('show error tooltip if error loading audio is unsupported', async () => {
    const template = `<app-checking-audio-player #player1 source="blob://unsupported"></app-checking-audio-player>`;
    const env = new TestEnvironment(template, true);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.audioNotAvailableMessage).not.toBeNull();
    expect(env.audioNotAvailableMessage.query(By.css('#error-load'))).not.toBeNull();
    expect(env.component.player1.audioStatus).toEqual(AudioStatus.LocalNotAvailable);
    expect(env.playButton(1)).toBeNull();
  });
});

@Component({ selector: 'app-host', template: '' })
class HostComponent {
  @ViewChild(CheckingAudioPlayerComponent) player1!: CheckingAudioPlayerComponent;
  @ViewChild(CheckingAudioPlayerComponent) player2!: CheckingAudioPlayerComponent;
}

class TestEnvironment {
  readonly mockedPwaService = mock(PwaService);
  readonly mockedI18nService = mock(I18nService);
  readonly ngZone: NgZone;

  fixture: ComponentFixture<HostComponent>;
  component: HostComponent;

  constructor(template: string, isOnline = true) {
    TestBed.configureTestingModule({
      declarations: [HostComponent, CheckingAudioPlayerComponent, AudioTimePipe],
      providers: [
        { provide: PwaService, useFactory: () => instance(this.mockedPwaService) },
        { provide: I18nService, useFactory: () => instance(this.mockedI18nService) }
      ],
      imports: [UICommonModule, TestTranslocoModule]
    });
    when(this.mockedPwaService.isOnline).thenCall(() => isOnline);
    when(this.mockedPwaService.onlineStatus).thenReturn(of(isOnline));

    TestBed.overrideComponent(HostComponent, { set: { template: template } });
    this.ngZone = TestBed.inject(NgZone);
    this.fixture = TestBed.createComponent(HostComponent);
    this.component = this.fixture.componentInstance;
    this.fixture.detectChanges();
  }

  get duration(): string {
    return this.fixture.debugElement.query(By.css('.duration')).nativeElement.textContent;
  }

  get currentTime(): string {
    return this.fixture.debugElement.query(By.css('.current-time')).nativeElement.textContent;
  }

  get moreMenuButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.more-menu'));
  }

  get downloadButton(): DebugElement {
    return this.fixture.debugElement.query(By.css('.download'));
  }

  get audioNotAvailableMessage(): DebugElement {
    return this.fixture.debugElement.query(By.css('.audio-not-available'));
  }

  playButton(num: number): DebugElement {
    const id = num === 1 ? '#player1' : '#player2';
    return this.fixture.debugElement.query(By.css(id + ' .play'));
  }

  pauseButton(num: number): DebugElement {
    const id = num === 1 ? '#player1' : '#player2';
    return this.fixture.debugElement.query(By.css(id + ' .pause'));
  }

  clickButton(button: DebugElement): void {
    button.nativeElement.click();
    this.fixture.detectChanges();
  }

  async waitForPlayer(ms: number) {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));
    this.fixture.detectChanges();
  }
}
