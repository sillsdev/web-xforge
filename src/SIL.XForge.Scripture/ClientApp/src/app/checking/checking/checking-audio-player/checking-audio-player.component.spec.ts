import { Component, DebugElement, NgZone, ViewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSliderDragEvent } from '@angular/material/slider';
import { By } from '@angular/platform-browser';
import { lastValueFrom } from 'rxjs';
import { takeWhile } from 'rxjs/operators';
import { instance, mock } from 'ts-mockito';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { TestOnlineStatusModule } from 'xforge-common/test-online-status.module';
import { TestOnlineStatusService } from 'xforge-common/test-online-status.service';
import { TestTranslocoModule, getAudioBlob } from 'xforge-common/test-utils';
import { UICommonModule } from 'xforge-common/ui-common.module';
import { AudioStatus } from '../../../shared/audio/audio-player';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';
import { AudioTimePipe } from '../../../shared/audio/audio-time-pipe';
import { InfoComponent } from '../../../shared/info/info.component';
import { AudioAttachment } from '../checking-audio-recorder/checking-audio-recorder.component';
import { CheckingAudioPlayerComponent } from './checking-audio-player.component';

describe('CheckingAudioPlayerComponent', () => {
  const audioFile = 'test-audio-player.webm';
  const audioFileB = 'test-audio-player-b.webm';
  const audioFileShortMP3 = 'test-audio-short.mp3';
  const audioBlobFile: AudioAttachment = {
    status: 'uploaded',
    blob: getAudioBlob(),
    fileName: audioFile,
    url: URL.createObjectURL(new File([getAudioBlob()], audioFile))
  };
  const playerLoadTimeMs = 1000;

  it('should be created', async () => {
    const template =
      '<app-checking-audio-player #player1 id="player1" source="' + audioFile + '"></app-checking-audio-player>';
    const env = new TestEnvironment(template);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.component.player1.audioPlayer?.isAudioAvailable$.value).toBe(true);
    expect(env.duration).toBe('0:05');
    expect(env.currentTime).toBe('0:00');
  });

  it('can play physical files', async () => {
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

  it('can play blob files', async () => {
    const template =
      '<app-checking-audio-player #player1 id="player1" source="' +
      audioBlobFile.url +
      '"></app-checking-audio-player>';
    const env = new TestEnvironment(template);
    await env.waitForPlayer(playerLoadTimeMs);
    env.clickButton(env.playButton(1));
    await env.waitForPlayer(1100);
    env.fixture.detectChanges();
    env.clickButton(env.pauseButton(1));
    await env.waitForPlayer(1100);
    env.fixture.detectChanges();
    expect(env.currentTime).toBe('0:01');
  });

  it('can play short mp3 files', async () => {
    const template =
      '<app-checking-audio-player #player1 id="player1" source="' +
      audioFileShortMP3 +
      '"></app-checking-audio-player>';
    const env = new TestEnvironment(template);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.component.player1.audioPlayer?.audio?.status$.value).toBe(AudioStatus.Available);
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
    expect(env.component.player1.audioPlayer?.audio?.isPlaying).toBe(true);
    env.clickButton(env.playButton(2));
    await env.waitForPlayer(500);
    expect(env.component.player1.audioPlayer?.audio?.isPlaying).toBe(false);
    env.clickButton(env.pauseButton(2));
    expect(env.component.player2.audioPlayer?.audio?.isPlaying).toBe(false);
  });

  it('disables the audio player when audio is reset', async () => {
    const template =
      '<app-checking-audio-player #player1 id="player1" source="' + audioFile + '"></app-checking-audio-player>';
    const env = new TestEnvironment(template);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.component.player1.audioPlayer?.audio).not.toBeUndefined();
    env.component.player1.source = '';
    env.fixture.detectChanges();
    expect(env.component.player1.audioPlayer?.audio).toBeUndefined();
  });

  it('it notifies the user when audio is unavailable offline', async () => {
    const template = `<app-checking-audio-player #player1 source="https://"></app-checking-audio-player>`;
    const env = new TestEnvironment(template, false);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.component.player1.audioPlayer?.audio).not.toBeUndefined();
    expect(env.audioNotAvailableMessage).not.toBeNull();
  });

  it('it can play blobs even when offline', async () => {
    const template = `<app-checking-audio-player #player1 source="${audioBlobFile.url}"></app-checking-audio-player>`;
    const env = new TestEnvironment(template, false);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.component.player1.audioPlayer?.audio).not.toBeUndefined();
    expect(env.audioNotAvailableMessage).toBeNull();
  });

  it('it can seek to a new position', async () => {
    const template = `<app-checking-audio-player #player1 source="${audioBlobFile.url}"></app-checking-audio-player>`;
    const env = new TestEnvironment(template, true);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.component.player1.audioPlayer).not.toBeUndefined();
    expect(env.component.player1.audioPlayer?.seek).toBe(0);
    env.component.player1.audioPlayer?.onSeek({ value: 0.1 } as MatSliderDragEvent);
    expect(env.component.player1.audioPlayer?.seek).toBe(0.1);
  });

  it('it can play preloaded audio when offline', async () => {
    const template = `<app-checking-audio-player #player1 source="${audioFile}"></app-checking-audio-player>`;
    const env = new TestEnvironment(template, false);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.component.player1.audioPlayer?.audio?.isAudioAvailable).toBe(true);
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
    expect(env.component.player1.audioPlayer?.audioStatus).toEqual(AudioStatus.Unavailable);
    expect(env.playButton(1)).toBeNull();
  });

  it('show error tooltip if error loading audio while offline and the file does not exist', async () => {
    const template =
      '<app-checking-audio-player #player1 source="audio-file-not-exists.webm"></app-checking-audio-player>';
    const env = new TestEnvironment(template, false);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.audioNotAvailableMessage).not.toBeNull();
    expect(env.audioNotAvailableMessage.query(By.css('#error-load'))).not.toBeNull();
    expect(env.component.player1.audioPlayer?.audioStatus).toEqual(AudioStatus.Offline);
    expect(env.playButton(1)).toBeNull();
  });

  it('show error tooltip if error loading audio is unsupported', async () => {
    const template = `<app-checking-audio-player #player1 source="blob://unsupported"></app-checking-audio-player>`;
    const env = new TestEnvironment(template, true);
    await env.waitForPlayer(playerLoadTimeMs);
    expect(env.audioNotAvailableMessage).not.toBeNull();
    expect(env.audioNotAvailableMessage.query(By.css('#error-load'))).not.toBeNull();
    expect(env.component.player1.audioPlayer?.audioStatus).toEqual(AudioStatus.LocalNotAvailable);
    expect(env.playButton(1)).toBeNull();
  });
});

@Component({ selector: 'app-host', template: '' })
class HostComponent {
  @ViewChild(CheckingAudioPlayerComponent) player1!: CheckingAudioPlayerComponent;
  @ViewChild(CheckingAudioPlayerComponent) player2!: CheckingAudioPlayerComponent;
}

class TestEnvironment {
  readonly testOnlineStatusService: TestOnlineStatusService;
  readonly mockedI18nService = mock(I18nService);
  readonly ngZone: NgZone;

  fixture: ComponentFixture<HostComponent>;
  component: HostComponent;

  constructor(template: string, isOnline = true) {
    TestBed.configureTestingModule({
      declarations: [HostComponent, CheckingAudioPlayerComponent, AudioPlayerComponent, AudioTimePipe, InfoComponent],
      providers: [
        { provide: OnlineStatusService, useClass: TestOnlineStatusService },
        { provide: I18nService, useFactory: () => instance(this.mockedI18nService) }
      ],
      imports: [UICommonModule, TestOnlineStatusModule.forRoot(), TestTranslocoModule]
    });

    TestBed.overrideComponent(HostComponent, { set: { template: template } });
    this.ngZone = TestBed.inject(NgZone);
    this.testOnlineStatusService = TestBed.inject(OnlineStatusService) as TestOnlineStatusService;
    this.testOnlineStatusService.setIsOnline(isOnline);
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

  async waitForPlayer(ms: number): Promise<void> {
    await new Promise(resolve => this.ngZone.runOutsideAngular(() => setTimeout(resolve, ms)));

    // Wait until the AudioPlayers have initialized if they exist
    const player1Audio = this.component.player1.audioPlayer?.audio;
    const player2Audio = this.component.player2.audioPlayer?.audio;
    await Promise.all([
      player1Audio === undefined
        ? undefined
        : lastValueFrom(
            player1Audio.status$.pipe(takeWhile<AudioStatus>(val => val === AudioStatus.Initializing, true))
          ),
      player2Audio === undefined
        ? undefined
        : lastValueFrom(
            player2Audio.status$.pipe(takeWhile<AudioStatus>(val => val === AudioStatus.Initializing, true))
          )
    ]);

    this.fixture.detectChanges();
  }
}
