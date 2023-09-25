import { AfterViewInit, Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { Subscription } from 'rxjs';
import { distinctUntilChanged, filter, first, map } from 'rxjs/operators';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { TextDocId } from '../../../core/models/text-doc';
import { AudioPlayer } from '../../../shared/audio/audio-player';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';
import { AudioHeadingRef, AudioTextRef, CheckingUtils } from '../../checking.utils';

@Component({
  selector: 'app-checking-scripture-audio-player',
  templateUrl: './checking-scripture-audio-player.component.html',
  styleUrls: ['./checking-scripture-audio-player.component.scss']
})
export class CheckingScriptureAudioPlayerComponent extends SubscriptionDisposable implements AfterViewInit {
  @Output() currentVerseChanged = new EventEmitter<string>();
  @Output() closed: EventEmitter<void> = new EventEmitter<void>();
  @ViewChild('audioPlayer') audioPlayer?: AudioPlayerComponent;

  @Input() set textDocId(value: TextDocId | undefined) {
    this._textDocId = value;
    // set the verse label
    this.verseLabel = this.currentVerseLabel;
  }

  @Input() set timing(value: AudioTiming[]) {
    this._timing = Object.values(value).sort((a, b) => a.from - b.from);
  }

  @Input() set source(value: string | undefined) {
    this.audioSource = value;
    this.finishedSubscription?.unsubscribe();
    this.finishedSubscription = undefined;
    if (value != null) {
      this.subscribeToAudioFinished();
    }
  }

  verseLabel: string = '';
  audioSource?: string;

  private _timing: AudioTiming[] = [];
  private _textDocId?: TextDocId;
  private finishedSubscription?: Subscription;

  constructor(readonly i18n: I18nService) {
    super();
  }

  ngAfterViewInit(): void {
    this.subscribeToAudioFinished();
    this.subscribePlayerVerseChange(this.audioPlayer!.audio!);
  }

  get isPlaying(): boolean {
    return !!this.audioPlayer?.audio?.isPlaying;
  }

  private get currentVerseLabel(): string {
    if (this._textDocId == null) return '';
    const currentTime: number = this.audioPlayer?.audio?.currentTime ?? 0;
    const currentVerseStr: string = this.getCurrentVerseStr(currentTime);
    const verseRef = new VerseRef(
      Canon.bookNumberToId(this._textDocId.bookNum),
      this._textDocId.chapterNum.toString(),
      currentVerseStr
    );
    return this.i18n.localizeReference(verseRef);
  }

  close(): void {
    this.pause();
    this.closed.emit();
    this.finishedSubscription?.unsubscribe();
  }

  nextRef(): void {
    if (this.audioPlayer?.audio == null || this._timing.length < 1) return;

    const currentTimingIndex: number = this.getRefIndexInTimings(this.audioPlayer.audio.currentTime);
    if (currentTimingIndex < 0) {
      this.stop();
      return;
    } else if (this.audioPlayer.audio.currentTime < this._timing[currentTimingIndex].from) {
      // The first timing index doesn't always start at zero so this allows skipping to the start of the first reference
      this.audioPlayer.audio.currentTime = this._timing[currentTimingIndex].from;
    } else {
      this.audioPlayer.audio.currentTime = this._timing[currentTimingIndex].to;
    }
    this.verseLabel = this.currentVerseLabel;
  }

  pause(): void {
    this.audioPlayer?.audio?.pause();
  }

  play(): void {
    if (this.audioPlayer?.audio == null) return;
    this.audioPlayer.audio.play();
  }

  previousRef(): void {
    if (this.audioPlayer?.audio == null || this._timing.length < 1) return;
    const skipBackGracePeriod = 3;

    const currentTimingIndex: number = this.getRefIndexInTimings(this.audioPlayer.audio.currentTime);
    if (currentTimingIndex < 0) {
      this.audioPlayer.audio.currentTime = 0;
      return;
    } else if (this.audioPlayer.audio.currentTime > this._timing[currentTimingIndex].from + skipBackGracePeriod) {
      // Move to the start of the reference that had already been playing
      // rather than the start of the previous reference - this mimics Spotify previous track logic
      this.audioPlayer.audio.currentTime = this._timing[currentTimingIndex].from;
    } else if (currentTimingIndex === 0) {
      // The first timing index doesn't always start at zero so this forces it to the beginning of the audio
      this.audioPlayer.audio.currentTime = 0;
    } else {
      this.audioPlayer.audio.currentTime = this._timing[currentTimingIndex - 1].from;
    }
    this.verseLabel = this.currentVerseLabel;
  }

  stop(): void {
    this.audioPlayer?.audio?.stop();
  }

  private getRefIndexInTimings(currentTime: number): number {
    return this._timing.findIndex(t => t.to > currentTime);
  }

  private subscribePlayerVerseChange(audio: AudioPlayer): void {
    this.subscribe(
      audio.timeUpdated$.pipe(
        map(() => this.getRefIndexInTimings(audio.currentTime)),
        distinctUntilChanged()
      ),
      () => {
        if (this._textDocId == null || this.audioPlayer?.audio == null) return;
        this.verseLabel = this.currentVerseLabel;
        const audioTextRef: AudioTextRef | undefined = CheckingUtils.parseAudioRef(
          this._timing,
          this.audioPlayer.audio.currentTime
        );
        if (audioTextRef?.verseStr == null) {
          // emit the current ref that is a section heading
          const audioHeadingRef: AudioHeadingRef | undefined = CheckingUtils.parseAudioHeadingRef(
            this._timing,
            audio.currentTime
          );
          if (audioHeadingRef == null) return;
          const segmentRef: string = `${audioHeadingRef.label}_${audioHeadingRef.iteration}`;
          this.currentVerseChanged.emit(segmentRef);
          return;
        }
        const segmentRef: string = `verse_${this._textDocId.chapterNum}_${audioTextRef.verseStr}`;
        this.currentVerseChanged.emit(segmentRef);
      }
    );
  }

  private subscribeToAudioFinished(): void {
    if (this.audioPlayer == null || this.finishedSubscription != null) return;
    // wait until the next microtask cycle to get the audio player with the updated source
    Promise.resolve(this.audioPlayer).then(audioPlayer => {
      this.subscribe(
        audioPlayer.isAudioAvailable$.pipe(
          filter(a => a),
          first()
        ),
        () => {
          this.finishedSubscription = this.subscribe(audioPlayer.audio!.finishedPlaying$.pipe(first()), () => {
            this.close();
          });
        }
      );
    });
  }

  private getCurrentVerseStr(currentTime: number): string {
    const index: number = this.getRefIndexInTimings(currentTime);
    for (let i = index; i >= 0; i--) {
      const audioRef: AudioTextRef | undefined = CheckingUtils.parseAudioRef(this._timing, this._timing[i].from);
      if (audioRef != null) return audioRef.verseStr;
    }
    // default to verse 0 if no verse is found
    return '0';
  }
}
