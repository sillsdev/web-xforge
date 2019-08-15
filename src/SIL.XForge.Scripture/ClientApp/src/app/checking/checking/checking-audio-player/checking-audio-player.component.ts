import { MdcSliderChange } from '@angular-mdc/web';
import { Component, Input, Pipe, PipeTransform } from '@angular/core';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-checking-audio-player',
  templateUrl: './checking-audio-player.component.html',
  styleUrls: ['./checking-audio-player.component.scss']
})
export class CheckingAudioPlayerComponent {
  seek: number = 0;

  private _currentTime: number = 0;
  private _duration: number = 0;
  private _enabled: boolean = false;
  private _isPlaying: boolean = false;
  private audio: HTMLAudioElement = new Audio();

  get currentTime(): number {
    return this._currentTime;
  }

  get duration(): number {
    return this._duration;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(enable: boolean) {
    this._enabled = enable;
    this.seek = 0;
  }

  get hasSource(): boolean {
    return !!this.audio.src && this.enabled;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  @Input() set source(source: string) {
    this.audio = new Audio();
    if (source && source !== '') {
      if (!source.includes('://')) {
        if (source.startsWith('/')) {
          source = source.substring(1);
        }
        source = environment.assets.audio + source;
      }
      this.enabled = false;
      this.audio.src = source;
      this.audio.addEventListener('timeupdate', () => {
        this._isPlaying = this.checkIsPlaying;
        this._currentTime = this.audio.currentTime;
        this._duration = this.audio.duration;
        if (!this.enabled) {
          // Reset back to the start of the audio file after the event has triggered
          this.audio.currentTime = 0;
          this.enabled = true;
        } else {
          if (this.isPlaying) {
            this.seek = (this.currentTime / this.duration) * 100;
          } else if (this.currentTime === this.duration) {
            this.seek = 100;
          }
        }
      });
      this._duration = this.audio.duration;
      this.seek = 0;
      // The duration isn't immediately available on blob files so play in mute mode to figure it out
      if (isNaN(this.duration) || this.duration === Infinity) {
        // Trigger the timeupdate event
        this.audio.currentTime = 1000;
      } else {
        this.enabled = true;
      }
    }
  }

  private get checkIsPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended && this.audio.readyState > 2;
  }

  pause() {
    this.audio.pause();
  }

  play() {
    this.audio.play();
  }

  seeking(event: MdcSliderChange) {
    this.seek = event.value;
    this.audio.currentTime = this.seek > 0 ? this.duration * (this.seek / 100) : 0;
    this._currentTime = this.audio.currentTime;
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
