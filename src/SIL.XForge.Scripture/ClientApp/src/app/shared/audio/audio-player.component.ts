import { Component, EventEmitter, Input, OnDestroy, Output, Pipe, PipeTransform } from '@angular/core';
import { MatSliderChange } from '@angular/material/slider';
import { AudioPlayer, AudioStatus } from 'src/app/shared/audio/audio-player';
import { I18nService } from 'xforge-common/i18n.service';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.scss']
})
export class AudioPlayerComponent extends SubscriptionDisposable implements OnDestroy {
  private _enabled: boolean = false;

  audio: AudioPlayer | undefined;
  @Output() isAudioAvailableChanged = new EventEmitter<void>();

  constructor(private readonly pwaService: PwaService, readonly i18n: I18nService) {
    super();
  }

  get duration(): number {
    return this.audio?.duration ?? 0;
  }

  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(enable: boolean) {
    this._enabled = enable;
    this.audio?.setSeek(0);
  }

  get audioStatus(): AudioStatus {
    return this.audio?.status$.value ?? (this.pwaService.isOnline ? AudioStatus.Unavailable : AudioStatus.Offline);
  }

  @Input() set source(source: string | undefined) {
    this.enabled = false;
    this.audio?.dispose();
    if (source != null && source !== '') {
      this.audio = new AudioPlayer(source, this.pwaService);
      this.subscribe(this.audio?.status$, newVal => {
        if (newVal === AudioStatus.Available) {
          this.enabled = true;
          this.isAudioAvailableChanged.emit();
        }
      });
    } else {
      this.audio = undefined;
    }
    this.isAudioAvailableChanged.emit();
  }

  get isAudioAvailable(): boolean {
    return this.audio?.isAudioAvailable ?? false;
  }

  get seek(): number {
    return this.audio?.seek ?? 0;
  }

  onSeek(event: MatSliderChange): void {
    if (event?.value !== null) {
      this.audio?.setSeek(event.value);
    }
  }
}

@Pipe({ name: 'audioTime' })
export class AudioTimePipe implements PipeTransform {
  transform(seconds: number, ..._args: any[]): string {
    const minutesString = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    const secondsString = seconds >= 10 ? seconds : '0' + seconds;
    return minutesString + ':' + secondsString;
  }
}
