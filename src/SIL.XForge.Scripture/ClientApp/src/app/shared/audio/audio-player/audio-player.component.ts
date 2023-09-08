import { Component } from '@angular/core';
import { MatSliderChange } from '@angular/material/slider';
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

  get seek(): number {
    return this.audio?.seek ?? 0;
  }

  get direction(): 'ltr' | 'rtl' {
    return this.i18n.direction;
  }

  onSeek(event: MatSliderChange): void {
    let seek: number | null = event.value;
    if (seek == null) return;
    if (this.direction === 'rtl') {
      // The slider is reversed for RTL languages so the seek is the inverse of the value that is emitted
      seek = 100 - seek;
    }
    this.audio?.setSeek(seek);
  }
}
