import { Component, Input, OnChanges, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { AudioPlayer, AudioStatus } from '../../../shared/audio/audio-player';
import { AudioPlayerBaseComponent } from '../../../shared/audio/audio-player-base/audio-player-base.component';
import { AudioSegmentPlayer } from '../../../shared/audio/audio-segment-player';

@Component({
  selector: 'app-single-button-audio-player',
  templateUrl: './single-button-audio-player.component.html',
  styleUrls: ['./single-button-audio-player.component.scss']
})
export class SingleButtonAudioPlayerComponent extends AudioPlayerBaseComponent implements OnChanges, OnDestroy {
  private _source?: string;
  private _progressInDegrees: string = '';
  private _timeUpdatedSubscription: Subscription | undefined;
  // Expose enum to template.
  readonly AudioStatus = AudioStatus;
  readonly hasFinishedPlayingOnce$: BehaviorSubject<boolean> = new BehaviorSubject(false);

  @Input() theme: 'primary' | 'secondary' = 'primary';
  @Input() start?: number;
  @Input() end?: number;
  @Input() override set source(source: string | undefined) {
    this._source = source;
  }

  constructor(onlineStatusService: OnlineStatusService) {
    super(onlineStatusService);
  }

  get progressInDegrees(): string {
    return this._progressInDegrees;
  }

  get playing(): boolean {
    return this.audio?.isPlaying ?? false;
  }

  calculateProgress(): void {
    this._progressInDegrees = this.audio?.seek !== undefined ? `${(this.audio?.seek / 100) * 360}deg` : '';
  }

  play(): void {
    this.audio?.play();
  }

  stop(): void {
    this.audio?.stop();
  }

  ngOnChanges(): void {
    this.isAudioAvailable$.next(false);
    this.hasFinishedPlayingOnce$.next(false);
    this._progressInDegrees = '';
    this._timeUpdatedSubscription?.unsubscribe();
    this.audio?.dispose();
    if (this._source != null && this._source !== '') {
      if (this.start != null && this.end != null) {
        this.audio = new AudioSegmentPlayer(this._source, this.start, this.end, this.onlineStatusService);
      } else {
        this.audio = new AudioPlayer(this._source, this.onlineStatusService);
      }

      this.subscribe(this.audio.status$, newVal => {
        if (newVal === AudioStatus.Available) {
          this.isAudioAvailable$.next(true);
          this.calculateProgress();
        }
      });
      this.subscribe(this.audio.finishedPlaying$, () => {
        if (!this.hasFinishedPlayingOnce$.value) {
          this.hasFinishedPlayingOnce$.next(true);
        }
      });
      this._timeUpdatedSubscription = this.audio.timeUpdated$.subscribe(() => {
        this.calculateProgress();
      });
    } else {
      this.audio = undefined;
    }
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this._timeUpdatedSubscription?.unsubscribe();
  }
}
