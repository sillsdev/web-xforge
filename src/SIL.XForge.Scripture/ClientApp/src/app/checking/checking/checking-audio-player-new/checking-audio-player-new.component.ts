import { Component, Input, OnDestroy, ViewChild } from '@angular/core';
import { AudioPlayerComponent } from 'src/app/shared/audio/audio-player.component';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';

@Component({
  selector: 'app-checking-audio-player-new',
  templateUrl: './checking-audio-player-new.component.html',
  styleUrls: ['./checking-audio-player-new.component.scss']
})
export class CheckingAudioPlayerNewComponent extends SubscriptionDisposable implements OnDestroy {
  @ViewChild(AudioPlayerComponent) audioPlayer?: AudioPlayerComponent;
  private _source: string | undefined;

  constructor(readonly i18n: I18nService) {
    super();
  }

  getSource(): string | undefined {
    return this._source;
  }

  @Input() set source(source: string | undefined) {
    this._source = source;
  }

  get isAudioAvailable(): boolean {
    return this.audioPlayer?.enabled ?? false;
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
