import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { Subscription } from 'rxjs';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { AudioTextRef, CheckingUtils } from '../../checking.utils';
import { TextDocId } from '../../../core/models/text-doc';
import { AudioPlayer } from '../../../shared/audio/audio-player';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';

@Component({
  selector: 'app-checking-scripture-audio-player',
  templateUrl: './checking-scripture-audio-player.component.html',
  styleUrls: ['./checking-scripture-audio-player.component.scss']
})
export class CheckingScriptureAudioPlayerComponent extends SubscriptionDisposable {
  @Input() source?: string;
  @Input() textDocId?: TextDocId;
  @Output() currentVerseChanged = new EventEmitter<string>();
  @ViewChild('audioPlayer') audioPlayer?: AudioPlayerComponent;

  private audioTimingSubscription?: Subscription;
  private _timing: AudioTiming[] = [];
  private currentVerseStr: string = '0';

  constructor(private readonly i18n: I18nService) {
    super();
  }

  /** Gets the corresponding reference for the timing entry based on the current audio player time */
  get currentRef(): string | undefined {
    const currentTime: number = this.audioPlayer?.audio?.currentTime ?? 0;
    const audioTiming: AudioTiming | undefined = this._timing.find(t => t.to > currentTime);
    if (audioTiming?.textRef === 's') {
      return 's_' + this._timing.filter(t => t.textRef === 's' && t.to <= audioTiming.to).length;
    }
    return audioTiming?.textRef;
  }

  get isPlaying(): boolean {
    return !!this.audioPlayer?.audio?.isPlaying;
  }

  @Input() set timing(value: AudioTiming[]) {
    this._timing = value.sort((a, b) => a.from - b.from);
  }

  get currentVerseLabel(): string {
    if (this.currentRef == null || this.textDocId == null) return '';
    const audioTextRef: AudioTextRef | undefined = CheckingUtils.parseAudioRef(this.currentRef);
    // return the current verse if the ref is not associated with a verse
    const verseRef = new VerseRef(
      Canon.bookNumberToId(this.textDocId.bookNum),
      this.textDocId.chapterNum.toString(),
      audioTextRef?.verseStr ?? this.currentVerseStr
    );
    return this.i18n.localizeReference(verseRef);
  }

  play(): void {
    if (this.audioPlayer?.audio == null) return;
    this.audioPlayer.audio.play();
    this.audioTimingSubscription = this.subscribePlayerVerseChange(this.audioPlayer.audio);
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

  private subscribePlayerVerseChange(audio: AudioPlayer): Subscription {
    return this.subscribe(
      audio.playing$.pipe(
        map(() => this.currentRef),
        distinctUntilChanged()
      ),
      () => {
        if (this.textDocId == null || this.currentRef == null) return;
        const audioTextRef: AudioTextRef | undefined = CheckingUtils.parseAudioRef(this.currentRef);
        if (audioTextRef?.verseStr == null) {
          // emit the current ref that is a section heading
          this.currentVerseChanged.emit(this.currentRef);
          return;
        }
        // set the most current verse string
        this.currentVerseStr = audioTextRef.verseStr;
        const segmentRef: string = `verse_${this.textDocId.chapterNum}_${audioTextRef.verseStr}`;
        this.currentVerseChanged.emit(segmentRef);
      }
    );
  }
}
