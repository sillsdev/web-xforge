import { Component, OnDestroy } from '@angular/core';
import { MatSliderDragEvent } from '@angular/material/slider';
import { Subscription } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { AudioPlayerBaseComponent } from '../audio-player-base/audio-player-base.component';

@Component({
    selector: 'app-audio-player',
    templateUrl: './audio-player.component.html',
    styleUrls: ['./audio-player.component.scss'],
    standalone: false
})
export class AudioPlayerComponent extends AudioPlayerBaseComponent implements OnDestroy {
  private _currentTime: number = 0;
  private _seek: number = 0;
  private _timeUpdatedSubscription: Subscription | undefined;

  constructor(
    onlineStatusService: OnlineStatusService,
    readonly i18n: I18nService
  ) {
    super(onlineStatusService);
  }

  get currentTime(): number {
    return this._currentTime;
  }

  get duration(): number {
    return this.audio?.duration ?? 0;
  }

  get isAudioAvailable(): boolean {
    return this.audio?.isAudioAvailable === true;
  }

  get seek(): number {
    return this._seek;
  }

  set source(source: string | undefined) {
    this._currentTime = 0;
    this._seek = 0;
    this._timeUpdatedSubscription?.unsubscribe();
    super.source = source;
    this._timeUpdatedSubscription = this.audio?.timeUpdated$.subscribe(() => {
      this._currentTime = this.audio?.currentTime ?? 0;
      this._seek = this.audio?.seek ?? 0;
    });
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    this._timeUpdatedSubscription?.unsubscribe();
  }

  onSeek(event: MatSliderDragEvent): void {
    this._seek = event.value;
    this.audio?.setSeek(this._seek);
  }
}
