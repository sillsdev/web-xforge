import { Component, ElementRef, Input, Pipe, PipeTransform, ViewChild } from '@angular/core';
import { saveAs } from 'file-saver';

@Component({
  selector: 'app-checking-audio-player',
  templateUrl: './checking-audio-player.component.html',
  styleUrls: ['./checking-audio-player.component.scss']
})
export class CheckingAudioPlayerComponent {
  @ViewChild('slider') slider: ElementRef;
  @Input() set downloadable(downloadable: boolean) {
    this._isDownloadable = downloadable;
  }
  @Input() set source(source: string) {
    this.audio = new Audio();
    if (source !== '') {
      this.audio.src = source;
      this.audio.addEventListener('timeupdate', () => {
        this._isPlaying = this.checkIsPlaying;
        this._currentTime = this.audio.currentTime;
        this._duration = this.audio.duration;
        if (!this.enabled) {
          // Reset back to the start of the audio file after the event has triggered
          this.audio.currentTime = 0;
          this.enabled = true;
        }
        this.seek = (this.currentTime / this.duration) * 100;
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
  private _currentTime: number = 0;
  private _duration: number = 0;
  private _enabled: boolean = false;
  private _isDownloadable: boolean = false;
  private _isPlaying: boolean = false;
  private _seek: number = 0;
  private _seeking: boolean = false;
  private audio: HTMLAudioElement = new Audio();

  get duration(): number {
    return this._duration;
  }

  get currentTime(): number {
    return this._currentTime;
  }

  get canDownload(): boolean {
    return this._isDownloadable;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(enable: boolean) {
    this._enabled = enable;
    this.seek = 0;
    // Bind events after DOM has updated
    setTimeout(() => {
      this.slider.nativeElement.addEventListener('mousemove', (event: MouseEvent) => {
        if (this._seeking) {
          this.seek = event.clientX - this.slider.nativeElement.offsetLeft;
        }
      });
      this.slider.nativeElement.addEventListener('mousedown', () => {
        this._seeking = true;
      });
      this.slider.nativeElement.addEventListener('mouseup', () => {
        this._seeking = false;
      });
    }, 1);
  }

  get hasSource(): boolean {
    return !!this.audio.src && this.enabled;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get seek(): number {
    return this._seek;
  }

  set seek(value: number) {
    this._seek = value;
    if (!this.isPlaying) {
      this.audio.currentTime = this.seek > 0 ? this.duration * (this.seek / 100) : 0;
      console.log(this.duration, this.seek);
      this._currentTime = this.audio.currentTime;
    }
  }

  private get checkIsPlaying(): boolean {
    return !this.audio.paused && !this.audio.ended && this.audio.currentTime > 0 && this.audio.readyState > 2;
  }

  download() {
    if (this.canDownload) {
      saveAs(this.audio.src);
    }
  }

  pause() {
    this.audio.pause();
  }

  play() {
    this.audio.play();
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
