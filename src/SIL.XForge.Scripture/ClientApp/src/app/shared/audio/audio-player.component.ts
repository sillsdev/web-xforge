import { Component, Input, Pipe, PipeTransform } from '@angular/core';
import { MatSliderChange } from '@angular/material/slider';
import { BehaviorSubject } from 'rxjs';
import { AudioPlayer, AudioStatus } from 'src/app/shared/audio/audio-player';
import { I18nService } from 'xforge-common/i18n.service';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.scss']
})
export class AudioPlayerComponent extends SubscriptionDisposable {
  readonly isAudioAvailable$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private _audio: AudioPlayer | undefined;

  constructor(private readonly pwaService: PwaService, readonly i18n: I18nService) {
    super();

    this.subscribe(this.isAudioAvailable$, () => {
      this.audio?.setSeek(0);
    });
  }

  get audio(): AudioPlayer | undefined {
    return this._audio;
  }

  get duration(): number {
    return this.audio?.duration ?? 0;
  }

  get audioStatus(): AudioStatus {
    return this.audio?.status$.value ?? (this.pwaService.isOnline ? AudioStatus.Unavailable : AudioStatus.Offline);
  }

  @Input() set source(source: string | undefined) {
    this.isAudioAvailable$.next(false);
    this.audio?.dispose();
    if (source != null && source !== '') {
      this._audio = new AudioPlayer(source, this.pwaService);
      this.subscribe(this._audio.status$, newVal => {
        if (newVal === AudioStatus.Available) {
          this.isAudioAvailable$.next(true);
        }
      });
    } else {
      this._audio = undefined;
    }
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
    const minutesString: number = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    const secondsString: string | number = seconds >= 10 ? seconds : '0' + seconds;
    return minutesString + ':' + secondsString;
  }
}
