import { AfterViewInit, Component, Input, OnDestroy, ViewChild } from '@angular/core';
import { AudioPlayerComponent } from 'src/app/shared/audio/audio-player.component';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';

@Component({
  selector: 'app-checking-audio-player-new',
  templateUrl: './checking-audio-player-new.component.html',
  styleUrls: ['./checking-audio-player-new.component.scss']
})
export class CheckingAudioPlayerNewComponent extends SubscriptionDisposable implements OnDestroy, AfterViewInit {
  private _isAudioAvailable = false;
  @ViewChild(AudioPlayerComponent) audioPlayer?: AudioPlayerComponent;
  @Input() source: string = '';

  constructor(readonly i18n: I18nService) {
    super();
  }

  ngAfterViewInit(): void {
    this.subscribe(this.audioPlayer!.isAudioAvailable$, newValue => {
      setTimeout(() => (this._isAudioAvailable = newValue));
    });
    this._isAudioAvailable = this.audioPlayer!.isAudioAvailable$.value;
  }

  get isAudioAvailable(): boolean {
    return this._isAudioAvailable;
  }

  pause(): void {
    this.audioPlayer?.audio?.pause();
  }

  play(): void {
    this.audioPlayer?.audio?.play();
  }

  isPlaying(): boolean {
    return this.audioPlayer?.audio?.isPlaying ?? false;
  }
}
