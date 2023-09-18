import { Component, Input, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { AudioPlayer, AudioStatus } from '../audio-player';

@Component({
  template: ``
})
export abstract class AudioPlayerBaseComponent extends SubscriptionDisposable implements OnDestroy {
  readonly isAudioAvailable$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  hasProblem: boolean = false;
  private _audio: AudioPlayer | undefined;

  constructor(protected readonly onlineStatusService: OnlineStatusService) {
    super();
  }

  get audio(): AudioPlayer | undefined {
    return this._audio;
  }

  protected set audio(value: AudioPlayer | undefined) {
    this._audio = value;
  }

  get audioStatus(): AudioStatus {
    return (
      this.audio?.status$.value ?? (this.onlineStatusService.isOnline ? AudioStatus.Unavailable : AudioStatus.Offline)
    );
  }

  @Input() set source(source: string | undefined) {
    this.isAudioAvailable$.next(false);
    this.audio?.dispose();
    if (source == null || source === '') {
      this._audio = undefined;
      return;
    }

    this._audio = new AudioPlayer(source, this.onlineStatusService);
    this.subscribe(this._audio.status$, newVal => {
      if (newVal === AudioStatus.Available) {
        this.audio?.setSeek(0);
        this.hasProblem = false;
        this.isAudioAvailable$.next(true);
      }

      if (this._audio?.hasErrorState) {
        this.hasProblem = true;
        this.isAudioAvailable$.next(false);
      }
    });
  }

  /** External declaration regarding whether the audio source is available for use or not. */
  @Input() set isSourceUnavailable(sourceUnavailable: boolean) {
    // Obviously setting isSourceUnavailable to false after a problem has already been discovered would not be a
    // reasonable time to set hasProblem to false. But this Input should be being set by a parent component in
    // conjunction with changes to source.
    this.hasProblem = sourceUnavailable;
    if (sourceUnavailable) this.isAudioAvailable$.next(false);
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.audio?.pause();
    this.audio?.dispose();
  }
}
