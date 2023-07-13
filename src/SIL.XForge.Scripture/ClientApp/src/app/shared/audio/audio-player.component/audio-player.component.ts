import { Component } from '@angular/core';
import { MatSliderChange } from '@angular/material/slider';
import { I18nService } from 'xforge-common/i18n.service';
import { PwaService } from 'xforge-common/pwa.service';
import { AudioPlayerBaseComponent } from '../audio-player-base.component/audio-player-base.component';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.scss']
})
export class AudioPlayerComponent extends AudioPlayerBaseComponent {
  constructor(pwaService: PwaService, readonly i18n: I18nService) {
    super(pwaService);
  }

  get duration(): number {
    return this.audio?.duration ?? 0;
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
