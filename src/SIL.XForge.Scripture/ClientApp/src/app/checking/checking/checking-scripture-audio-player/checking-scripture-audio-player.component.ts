import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { interval, Subscription } from 'rxjs';
import { distinctUntilChanged, map, tap } from 'rxjs/operators';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { TextDocId } from '../../../core/models/text-doc';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';
import { getVerseStrFromSegmentRef } from '../../../shared/utils';

@Component({
  selector: 'app-checking-scripture-audio-player',
  templateUrl: './checking-scripture-audio-player.component.html',
  styleUrls: ['./checking-scripture-audio-player.component.scss']
})
export class CheckingScriptureAudioPlayerComponent extends SubscriptionDisposable {
  private readonly pollingInterval = 500;
  @Input() source?: string;
  @Input() textDocId?: TextDocId;
  @Output() currentVerseChanged = new EventEmitter<string>();
  @ViewChild('audioPlayer') audioPlayer?: AudioPlayerComponent;

  private audioTimingSubscription?: Subscription;
  private _timing: AudioTiming[] = [];

  constructor(private readonly i18n: I18nService) {
    super();
  }

  get currentRef(): string | undefined {
    const currentTime: number = this.audioPlayer?.audio?.currentTime ?? 0;
    return this._timing.find(t => t.to > currentTime)?.textRef;
  }

  get isPlaying(): boolean {
    return !!this.audioPlayer?.audio?.isPlaying;
  }

  // TODO: Reset when user plays verse audio
  @Input() set timing(value: AudioTiming[]) {
    this._timing = value.sort((a, b) => a.from - b.from);
  }

  get currentVerseLabel(): string {
    if (this.currentRef == null || this.textDocId == null) return '';
    const verseRef = new VerseRef(
      Canon.bookNumberToId(this.textDocId.bookNum),
      this.textDocId.chapterNum.toString(),
      getVerseStrFromSegmentRef(this.currentRef) ?? ''
    );
    return this.i18n.localizeReference(verseRef);
  }

  play(): void {
    if (this.audioPlayer?.audio == null) return;
    this.audioPlayer.audio.play();
    this.audioTimingSubscription = this.subscribePlayerVerseChange();
  }

  pause(): void {
    this.audioPlayer?.audio?.pause();
  }

  previousRef(): void {
    if (this.audioPlayer == null || this.audioPlayer.audio == null || this._timing.length < 1) return;
    const currentTimingIndex: number = this._timing.findIndex(t => t.textRef === this.currentRef);
    if (currentTimingIndex < 0) {
      this.audioPlayer.audio.currentTime = 0;
    }
    this.audioPlayer.audio.currentTime = this._timing[currentTimingIndex - 1].from;
  }

  nextRef(): void {
    if (this.audioPlayer == null || this.audioPlayer.audio == null || this._timing.length < 1) return;
    const currentTimingIndex: number = this._timing.findIndex(t => t.textRef === this.currentRef);
    if (currentTimingIndex < 0) {
      // TODO (scripture audio): find a better solution than setting the current time to 0
      this.audioPlayer.audio.currentTime = 0;
    }
    this.audioPlayer.audio.currentTime = this._timing[currentTimingIndex].to;
  }

  private subscribePlayerVerseChange(): Subscription {
    return this.subscribe(
      interval(this.pollingInterval).pipe(
        map(() => this.currentRef),
        tap(() => {
          // Unsubscribe so we are not listening to the polling
          if (!this.isPlaying) {
            this.audioTimingSubscription?.unsubscribe();
          }
        }),
        distinctUntilChanged()
      ),
      () => this.currentVerseChanged.emit(this.currentRef!)
    );
  }
}
