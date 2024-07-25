import { Component } from '@angular/core';
import { MatSliderDragEvent } from '@angular/material/slider';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { AudioPlayerBaseComponent } from '../audio-player-base/audio-player-base.component';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.scss']
})
export class AudioPlayerComponent extends AudioPlayerBaseComponent {
  constructor(
    onlineStatusService: OnlineStatusService,
    readonly i18n: I18nService
  ) {
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

  onSeek(event: MatSliderDragEvent): void {
    this.audio?.setSeek(event.value);
  }
}
