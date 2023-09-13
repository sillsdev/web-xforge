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
  private _isAudioInitComplete: boolean = false;
  private _audio: AudioPlayer | undefined;

  constructor(protected readonly onlineStatusService: OnlineStatusService) {
    super();

    this.subscribe(this.isAudioAvailable$, () => {
      this.audio?.setSeek(0);
    });
  }

  get audio(): AudioPlayer | undefined {
    return this._audio;
  }

  protected set audio(value: AudioPlayer | undefined) {
    this._audio = value;
    if (this.audio !== undefined) {
      this.subscribe(this.audio.status$, newVal => {
        if (newVal === AudioStatus.Available) {
          this.isAudioAvailable$.next(true);
        }
        if (newVal !== AudioStatus.Init) {
          this._isAudioInitComplete = true;
        }
      });
    }
  }

  get audioStatus(): AudioStatus {
    return (
      this.audio?.status$.value ?? (this.onlineStatusService.isOnline ? AudioStatus.Unavailable : AudioStatus.Offline)
    );
  }

  get isAudioInitComplete(): boolean {
    return this._isAudioInitComplete;
  }

  @Input() set source(source: string | undefined) {
    this.isAudioAvailable$.next(false);
    this.audio?.dispose();
    if (source != null && source !== '') {
      this.audio = new AudioPlayer(source, this.onlineStatusService);
    } else {
      this.audio = undefined;
    }
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.audio?.pause();
    this.audio?.dispose();
  }
}
