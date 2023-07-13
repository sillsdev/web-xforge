import { Component, Input } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { AudioPlayer, AudioStatus } from '../audio-player';

@Component({
  template: ``
})
export abstract class AudioPlayerBaseComponent extends SubscriptionDisposable {
  readonly isAudioAvailable$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  protected _audio: AudioPlayer | undefined;

  constructor(protected readonly pwaService: PwaService) {
    super();

    this.subscribe(this.isAudioAvailable$, () => {
      this.audio?.setSeek(0);
    });
  }

  get audio(): AudioPlayer | undefined {
    return this._audio;
  }

  get audioStatus(): AudioStatus {
    return this.audio?.status$.value ?? (this.pwaService.isOnline ? AudioStatus.Unavailable : AudioStatus.Offline);
  }

  @Input() set source(source: string | undefined) {
    this.isAudioAvailable$.next(false);
    this.audio?.dispose();
    if (source != null && source !== '') {
      this._audio = new AudioPlayer(source, this.pwaService);
      this.subscribe(this._audio.status$, newVal => {
        if (newVal === AudioStatus.Available) {
          this.isAudioAvailable$.next(true);
        }
      });
    } else {
      this._audio = undefined;
    }
  }
}
