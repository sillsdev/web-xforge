import { MdcSlider, MdcSliderChange } from '@angular-mdc/web/slider';
import { Component, Input, OnDestroy, Pipe, PipeTransform, ViewChild } from '@angular/core';
import { formatAudioSource } from 'xforge-common/audio.service';

// See explanatory comment where this number is used
const ARBITRARILY_LARGE_NUMBER = 1e10;

@Component({
  selector: 'app-checking-audio-player',
  templateUrl: './checking-audio-player.component.html',
  styleUrls: ['./checking-audio-player.component.scss']
})
export class CheckingAudioPlayerComponent implements OnDestroy {
  static lastPlayedAudio: HTMLAudioElement;

  @ViewChild(MdcSlider, { static: false }) slider?: MdcSlider;

  seek: number = 0;

  private _currentTime: number = 0;
  private _duration: number = 0;
  private _enabled: boolean = false;
  private _isPlaying: boolean = false;
  private audio: HTMLAudioElement = new Audio();

  constructor() {
    this.audio.addEventListener('loadedmetadata', () => this.updateDuration());

    this.audio.addEventListener('timeupdate', () => {
      this.updateDuration();
      this._isPlaying = this.checkIsPlaying;
      this._currentTime = this.audio.currentTime;
      this._duration = this.audio.duration;
      if (this.isPlaying) {
        this.seek = (this.currentTime / this.duration) * 100;
      } else if (this.currentTime === this.duration) {
        this.seek = 100;
      }
    });
  }

  get currentTime(): number {
    return isNaN(this._currentTime) || this._currentTime === ARBITRARILY_LARGE_NUMBER ? 0 : this._currentTime;
  }

  get duration(): number {
    return isNaN(this._duration) || this._duration === ARBITRARILY_LARGE_NUMBER ? 0 : this._duration;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(enable: boolean) {
    this._enabled = enable;
    this.seek = 0;
  }

  get hasSource(): boolean {
    return !!this.audio.src;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  @Input() set source(source: string) {
    if (source && source !== '') {
      source = formatAudioSource(source);
      this.enabled = false;
      this.audio.src = source;
      this.seek = 0;
      // In Chromium the duration of blobs isn't known even after metadata is loaded
      // By making it skip to the end the duration becomes available. To do this we have to skip to some point that we
      // assume is past the end. This number should be large, but numbers as small as 1e16 have been observed to cause
      // audio playback to skip to the end of the audio when the user presses play in Chromium. Normal audio files will
      // know the duration once metadata has loaded.
      this.audio.currentTime = ARBITRARILY_LARGE_NUMBER;
    } else {
      this.audio.removeAttribute('src');
      this.enabled = false;
    }
  }

  private get checkIsPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended && this.audio.readyState > 2;
  }

  ngOnDestroy() {
    if (this.isPlaying) {
      this.audio.pause();
    }
  }

  pause() {
    this.audio.pause();
  }

  play() {
    if (CheckingAudioPlayerComponent.lastPlayedAudio) {
      CheckingAudioPlayerComponent.lastPlayedAudio.pause();
    }
    if (this.slider != null) {
      this.slider.layout();
    }
    this.audio.play();
    CheckingAudioPlayerComponent.lastPlayedAudio = this.audio;
  }

  seeking(event: MdcSliderChange) {
    this.seek = event.value;
    this.audio.currentTime = this.seek > 0 ? this.duration * (this.seek / 100) : 0;
    this._currentTime = this.audio.currentTime;
  }

  private updateDuration() {
    if (!this.enabled && this.audio.duration !== Infinity && !isNaN(this.audio.duration)) {
      this.enabled = true;
      this._duration = this.audio.duration;
      this.audio.currentTime = 0;
      this._currentTime = 0;
      this.seek = 0;
    }
  }
}

@Pipe({ name: 'audioTime' })
export class AudioTimePipe implements PipeTransform {
  transform(seconds: number, ...args: any[]): string {
    const minutesString = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    const secondsString = seconds >= 10 ? seconds : '0' + seconds;
    return minutesString + ':' + secondsString;
  }
}
