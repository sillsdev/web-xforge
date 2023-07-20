import { Component, Input, OnChanges } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { AudioPlayer, AudioStatus } from 'src/app/shared/audio/audio-player';
import { AudioPlayerBaseComponent } from 'src/app/shared/audio/audio-player-base.component/audio-player-base.component';
import { AudioSegmentPlayer } from 'src/app/shared/audio/audio-segment-player';
import { PwaService } from 'xforge-common/pwa.service';

@Component({
  selector: 'app-single-button-audio-player',
  templateUrl: './single-button-audio-player.component.html',
  styleUrls: ['./single-button-audio-player.component.scss']
})
export class SingleButtonAudioPlayerComponent extends AudioPlayerBaseComponent implements OnChanges {
  private _source?: string;

  readonly hasFinishedPlayingOnce$: BehaviorSubject<boolean> = new BehaviorSubject(false);

  @Input() start?: number;
  @Input() end?: number;
  @Input() override set source(source: string | undefined) {
    this._source = source;
  }

  constructor(pwaService: PwaService) {
    super(pwaService);
  }

  get progressInDegrees(): string {
    return this._audio?.seek !== undefined ? `${(this._audio?.seek / 100) * 360}deg` : '';
  }

  get playing(): boolean {
    return this._audio?.isPlaying ?? false;
  }

  play(): void {
    this._audio?.play();
  }

  stop(): void {
    this._audio?.pause();
    this._audio?.setSeek(0);
  }

  ngOnChanges(): void {
    this.isAudioAvailable$.next(false);
    this.hasFinishedPlayingOnce$.next(false);
    this.audio?.dispose();
    if (this._source != null && this._source !== '') {
      if (this.start != null && this.end != null) {
        this._audio = new AudioSegmentPlayer(this._source, this.start, this.end, this.pwaService);
      } else {
        this._audio = new AudioPlayer(this._source, this.pwaService);
      }

      this.subscribe(this._audio.status$, newVal => {
        if (newVal === AudioStatus.Available) {
          this.isAudioAvailable$.next(true);
        }
      });
      this.subscribe(this._audio.finishedPlaying$, () => {
        if (!this.hasFinishedPlayingOnce$.value) {
          this.hasFinishedPlayingOnce$.next(true);
        }
      });
    } else {
      this._audio = undefined;
    }
  }
}
