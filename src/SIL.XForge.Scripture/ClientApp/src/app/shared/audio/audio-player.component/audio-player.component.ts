import { Component, Pipe, PipeTransform } from '@angular/core';
import { MatSliderChange } from '@angular/material/slider';
import { I18nService } from 'xforge-common/i18n.service';
import { PwaService } from 'xforge-common/pwa.service';
import { AudioPlayerBaseComponent } from '../audio-player-base.component/audio-player-base.component';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.scss']
})
//todo rename to slider
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

// TODO (scripture audio) This duplicates the audio pipe in checking-audio-player.component.ts. As of right now, the
// audio time pipe in checking-audio-player.component.ts is registered in CheckingModule, so this one is not used, even
// though its presence here gives the impression that it is. Since they're identical, it probably makes the most sense
// to have one and move it to its own file. @josephmyers
@Pipe({ name: 'audioTime' })
export class AudioTimePipe implements PipeTransform {
  transform(seconds: number, ..._args: any[]): string {
    const minutesString: number = Math.floor(seconds / 60);
    seconds = Math.floor(seconds % 60);
    const secondsString: string | number = seconds >= 10 ? seconds : '0' + seconds;
    return minutesString + ':' + secondsString;
  }
}
