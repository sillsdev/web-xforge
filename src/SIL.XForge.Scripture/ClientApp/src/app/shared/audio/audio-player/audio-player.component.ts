import { Component } from '@angular/core';
import { MatLegacySliderChange as MatSliderChange } from '@angular/material/legacy-slider';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { AudioPlayerBaseComponent } from '../audio-player-base/audio-player-base.component';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.scss']
})
export class AudioPlayerComponent extends AudioPlayerBaseComponent {
  constructor(onlineStatusService: OnlineStatusService, readonly i18n: I18nService) {
    super(onlineStatusService);
  }

  get duration(): number {
    return this.audio?.duration ?? 0;
  }

  get isAudioAvailable(): boolean {
    return this.audio?.isAudioAvailable === true;
  }

  get seek(): number {
    return this.audio?.seek ?? 0;
  }

  onSeek(event: MatSliderChange): void {
    let seek: number | null = event.value;
    if (seek == null) return;
    if (this.i18n.direction === 'rtl') {
      // It appears that a bug in @angular/material@14.x prevents the slider from working in RTL environments.
      // The workaround is to flip the slider over the y-axis (so it appears LTR). But to allow seeking to work,
      // the seek value is set to the inverse of the value that is emitted from the slider.
      seek = 100 - seek;
    }
    this.audio?.setSeek(seek);
  }
}
