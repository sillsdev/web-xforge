import { Component, Input, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { PwaService } from 'xforge-common/pwa.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { AudioPlayer, AudioStatus } from '../audio-player';

@Component({
  template: ``
})
export abstract class AudioPlayerBaseComponent extends SubscriptionDisposable implements OnDestroy {
  readonly isAudioAvailable$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  readonly isAudioInitComplete$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private _audio: AudioPlayer | undefined;

  constructor(protected readonly pwaService: PwaService) {
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
  }

  get audioStatus(): AudioStatus {
    return this.audio?.status$.value ?? (this.pwaService.isOnline ? AudioStatus.Unavailable : AudioStatus.Offline);
  }

  @Input() set source(source: string | undefined) {
    this.isAudioInitComplete$.next(false);
    this.isAudioAvailable$.next(false);
    this.audio?.dispose();
    if (source != null && source !== '') {
      this._audio = new AudioPlayer(source, this.pwaService);
      this.subscribe(this._audio.status$, newVal => {
        if (newVal === AudioStatus.Available) {
          this.isAudioAvailable$.next(true);
        }
        if (newVal !== AudioStatus.Initializing) {
          this.isAudioInitComplete$.next(true);
        }
      });
    } else {
      this._audio = undefined;
      // We get here if the audio player was brought into the DOM before CheckingComponent was ready to specify the
      //  source (like at the very beginning). The source will probably be specified in a moment, so wait before setting
      //  audio init complete. If we just set it without waiting, and the source is then validly set, then we will flash
      //  an "unavailable" message on screen before changing to show the timer slider.
      // 200 ms is a speculative value.
      const timeoutMs = 200;
      setTimeout(() => {
        // If we still haven't initialized after a timeout passes, then there may really be something wrong and we can
        // show unavailability and possibly error messages.
        this.isAudioInitComplete$.next(true);
      }, timeoutMs);
    }
  }

  override ngOnDestroy(): void {
    super.ngOnDestroy();
    this.audio?.pause();
    this.audio?.dispose();
  }
}
