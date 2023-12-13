import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { mock, instance, when } from 'ts-mockito';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { AudioPlayer } from '../shared/audio/audio-player';

export function getAudioTimings(): AudioTiming[] {
  return [
    { textRef: '1', from: 0.0, to: 1.0 },
    { textRef: '2', from: 1.0, to: 2.0 },
    { textRef: '3-4', from: 2.0, to: 3.0 }
  ];
}

export function getAudioTimingWithHeadings(): AudioTiming[] {
  return [
    { textRef: '1', from: 0.0, to: 0.75 },
    { textRef: 's', from: 0.75, to: 1.5 },
    { textRef: '2', from: 1.5, to: 2.25 },
    { textRef: 's', from: 2.25, to: 3.0 },
    { textRef: '3', from: 3.0, to: 4.0 }
  ];
}

export function getAudioTimingsPhraseLevel(): AudioTiming[] {
  return [
    { textRef: '1a', from: 0.0, to: 1.0 },
    { textRef: '1b', from: 1.0, to: 2.0 },
    { textRef: '2a', from: 2.0, to: 3.0 },
    { textRef: '2b', from: 3.0, to: 4.0 }
  ];
}

export class AudioPlayerStub extends AudioPlayer {
  htmlAudioMock: HTMLAudioElement = mock(HTMLAudioElement);
  protected override audio: HTMLAudioElement = instance(this.htmlAudioMock);

  private _isPlaying = false;

  constructor(audioUrl: string, onlineService: OnlineStatusService) {
    super(audioUrl, onlineService);
    when(this.htmlAudioMock.src).thenReturn(audioUrl);
    when(this.htmlAudioMock.currentTime).thenReturn(0);
  }

  override get isPlaying(): boolean {
    return this._isPlaying;
  }

  override play(): void {
    this._isPlaying = true;
  }

  override pause(): void {
    this._isPlaying = false;
  }

  override get currentTime(): number {
    return this.audio.currentTime;
  }

  override set currentTime(time: number) {
    when(this.htmlAudioMock.currentTime).thenReturn(time);
  }
}
