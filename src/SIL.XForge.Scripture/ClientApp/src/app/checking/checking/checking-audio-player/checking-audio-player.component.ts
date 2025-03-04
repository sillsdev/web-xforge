import { AfterViewInit, Component, Input, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { I18nService } from 'xforge-common/i18n.service';
import { QuietDestroyRef } from 'xforge-common/utils';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';

export interface AudioAttachment {
  status?: 'denied' | 'processed' | 'recording' | 'reset' | 'stopped' | 'uploaded';
  url?: string;
  fileName?: string;
  blob?: Blob;
}

@Component({
  selector: 'app-checking-audio-player',
  templateUrl: './checking-audio-player.component.html',
  styleUrls: ['./checking-audio-player.component.scss']
})
export class CheckingAudioPlayerComponent implements AfterViewInit {
  private _isAudioAvailable = false;
  @ViewChild(AudioPlayerComponent) audioPlayer?: AudioPlayerComponent;
  @Input() source?: string = '';

  constructor(
    readonly i18n: I18nService,
    private destroyRef: QuietDestroyRef
  ) {}

  ngAfterViewInit(): void {
    this.audioPlayer!.isAudioAvailable$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(newValue => {
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
