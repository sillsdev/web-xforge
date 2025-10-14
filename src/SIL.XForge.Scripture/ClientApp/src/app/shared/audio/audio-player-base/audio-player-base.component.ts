import { Component, DestroyRef, Input, OnDestroy } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { AudioPlayer, AudioStatus } from '../audio-player';

@Component({
  template: ``,
  standalone: false
})
export abstract class AudioPlayerBaseComponent implements OnDestroy {
  readonly isAudioAvailable$: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private _audioStatus: AudioStatus | undefined;
  private _hasProblem: boolean = false;
  private _isAudioAvailable: boolean = false;
  private _audio: AudioPlayer | undefined;

  constructor(
    protected readonly onlineStatusService: OnlineStatusService,
    protected readonly destroyRef: DestroyRef
  ) {
    this.isAudioAvailable$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(newVal => {
      this._isAudioAvailable = newVal;
      this.audio?.setSeek(0);
    });
  }

  public get hasProblem(): boolean {
    return this._hasProblem;
  }

  private set hasProblem(value: boolean) {
    this._hasProblem = value;
  }

  get audio(): AudioPlayer | undefined {
    return this._audio;
  }

  protected set audio(value: AudioPlayer | undefined) {
    this._audio = value;
    if (this._audio !== undefined) {
      this._audio.status$.pipe(quietTakeUntilDestroyed(this.destroyRef)).subscribe(newVal => {
        this._audioStatus = newVal;
        if (newVal === AudioStatus.Available) {
          this.hasProblem = false;
          this.isAudioAvailable$.next(true);
        }
        if (this._audio?.hasErrorState) {
          this.hasProblem = true;
          this.isAudioAvailable$.next(false);
        }
      });
    } else {
      this._audioStatus = undefined;
    }
  }

  get isAudioAvailable(): boolean {
    return this._isAudioAvailable;
  }

  get audioStatus(): AudioStatus {
    return this._audioStatus ?? (this.onlineStatusService.isOnline ? AudioStatus.Unavailable : AudioStatus.Offline);
  }

  @Input() set source(source: string | undefined) {
    this.isAudioAvailable$.next(false);
    this.audio?.dispose();
    this._audioStatus = undefined;
    if (source != null && source !== '') {
      this.audio = new AudioPlayer(source, this.onlineStatusService);
    } else {
      this.audio = undefined;
    }
  }

  ngOnDestroy(): void {
    this.audio?.dispose();
  }
}
