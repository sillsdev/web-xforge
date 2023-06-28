import { BehaviorSubject } from 'rxjs';
import { formatFileSource, isLocalBlobUrl } from 'xforge-common/file.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';

export enum AudioStatus {
  Init = 'audio_initialized',
  Available = 'audio_available',
  Unavailable = 'audio_cannot_be_accessed',
  LocalNotAvailable = 'audio_cannot_be_previewed',
  Offline = 'audio_cannot_be_played'
}

// See explanatory comment where this number is used
const ARBITRARILY_LARGE_NUMBER = 1e10;

export class AudioPlayer extends SubscriptionDisposable {
  private static lastPlayedAudio: HTMLAudioElement;
  private audio: HTMLAudioElement = new Audio();
  private audioDataLoaded = false;

  status$: BehaviorSubject<AudioStatus> = new BehaviorSubject<AudioStatus>(AudioStatus.Init);

  constructor(source: string, private readonly pwaService: PwaService) {
    super();
    this.audio.addEventListener('loadeddata', () => {
      this.currentTime = 0;
      this.audioDataLoaded = true;
      this.status$.next(AudioStatus.Available);
    });

    this.audio.addEventListener('error', () => {
      if (isLocalBlobUrl(this.audio.src)) {
        this.status$.next(AudioStatus.LocalNotAvailable);
      } else {
        this.status$.next(this.pwaService.isOnline ? AudioStatus.Unavailable : AudioStatus.Offline);
      }
    });

    this.subscribe(this.pwaService.onlineStatus$, isOnline => {
      if (isOnline && this.status$.value !== AudioStatus.Available) {
        // force the audio element to try loading again, now that the user is online again
        if (this.audio.src === '') {
          this.status$.next(AudioStatus.Unavailable);
        } else {
          this.audio.load();
        }
      }
    });

    // In Chromium the duration of blobs isn't known even after metadata is loaded
    // By making it skip to the end the duration becomes available. To do this we have to skip to some point that we
    // assume is past the end. This number should be large, but numbers as small as 1e16 have been observed to cause
    // audio playback to skip to the end of the audio when the user presses play in Chromium. Normal audio files will
    // know the duration once metadata has loaded.
    this.audio.currentTime = ARBITRARILY_LARGE_NUMBER;
    this.audio.src = formatFileSource(FileType.Audio, source);
    this.status$.next(AudioStatus.Init);
  }

  get hasErrorState(): boolean {
    return !(this.status$.value === AudioStatus.Init || this.status$.value === AudioStatus.Available);
  }

  /**
   * Audio is available if it's stored offline, or we are online and can fetch audio, or if the audio is successfully
   * loaded already (and therefore cached in memory).
   */
  get isAudioAvailable(): boolean {
    return (isLocalBlobUrl(this.audio.src) || this.pwaService.isOnline || this.audioDataLoaded) && !this.hasErrorState;
  }

  play(): void {
    if (AudioPlayer.lastPlayedAudio) {
      AudioPlayer.lastPlayedAudio.pause();
    }

    if (!this.audioDataLoaded) {
      this.audio.load();
    }

    this.audio.play();
    AudioPlayer.lastPlayedAudio = this.audio;
  }

  pause(): void {
    this.audio.pause();
  }

  get seek(): number {
    if (this.duration > 0) {
      if (this.isPlaying) {
        return (this.currentTime / this.duration) * 100;
      } else if (this.currentTime === this.duration) {
        return 100;
      }
    }
    return 0;
  }

  setSeek(value: number): void {
    this.audio.currentTime = value > 0 ? this.duration * (value / 100) : 0;
  }

  get duration(): number {
    return isNaN(this.audio.duration) || this.audio.duration === Infinity ? 0 : this.audio.duration;
  }

  get currentTime(): number {
    return isNaN(this.audio.currentTime) || this.audio.currentTime === ARBITRARILY_LARGE_NUMBER
      ? 0
      : this.audio.currentTime;
  }

  set currentTime(time: number) {
    this.audio.currentTime = time;
  }

  get isPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended && this.audio.readyState > 2;
  }
}
