import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-single-button-audio-player',
  templateUrl: './single-button-audio-player.component.html',
  styleUrls: ['./single-button-audio-player.component.scss']
})
export class SingleButtonAudioPlayerComponent {
  @Input() playing: boolean = false;
  @Input() progress: number = 0;

  get progressInDegrees(): string {
    return `${this.progress * 360}deg`;
  }
}
