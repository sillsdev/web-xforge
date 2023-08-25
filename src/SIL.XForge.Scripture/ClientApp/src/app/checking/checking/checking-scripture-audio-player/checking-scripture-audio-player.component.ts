import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { AudioTextRef, CheckingUtils } from '../../checking.utils';
import { TextDocId } from '../../../core/models/text-doc';
import { SFProjectService } from '../../../core/sf-project.service';
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
  @Input() canDelete: boolean = false;
  @Output() currentVerseChanged = new EventEmitter<string>();
  @ViewChild('audioPlayer') audioPlayer?: AudioPlayerComponent;

  private _timing: AudioTiming[] = [];
  private currentVerseStr: string = '0';

  constructor(private readonly i18n: I18nService, private readonly projectService: SFProjectService) {
    super();
  }

  /**
   * Gets the corresponding reference for the timing entry based on the current audio player time.
   * This supports timing data where text refs can be in the form 'v1', '1', '1-2', '1a', and 's' for section headings.
   * TODO (scripture audio): support phrase and verse level timing data
   */
  get currentRef(): string | undefined {
    const currentTime: number = this.audioPlayer?.audio?.currentTime ?? 0;
    const audioTiming: AudioTiming | undefined = this._timing.find(t => t.to > currentTime);
    if (audioTiming?.textRef === 's') {
      return 's_' + this._timing.filter(t => t.textRef === 's' && t.to <= audioTiming.to).length;
    }
    return audioTiming?.textRef;
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

  get isPlaying(): boolean {
    return !!this.audioPlayer?.audio?.isPlaying;
  }

  deleteAudioTimingData(): void {
    if (this.textDocId?.projectId == null || this.textDocId?.bookNum == null || this.textDocId?.chapterNum == null) {
      return;
    }
    this.audioPlayer?.audio?.pause();
    this.audioPlayer?.audio?.dispose();
    this.projectService.onlineDeleteAudioTimingData(
      this.textDocId.projectId,
      this.textDocId.bookNum,
      this.textDocId.chapterNum
    );
  }

  nextRef(): void {
    if (this.audioPlayer?.audio == null || this.timing == null) return;
    const currentTimingIndex: number = this.timing.findIndex(t => t.textRef === this.currentRef);
    if (currentTimingIndex < 0) {
      this.audioPlayer.audio.stop();
    } else if (this.audioPlayer.audio.currentTime < this.timing[currentTimingIndex].from) {
      // The first timing index doesn't always start at zero so this allows skipping to the start of the first reference
      this.audioPlayer.audio.currentTime = this.timing[currentTimingIndex].from;
    } else {
      this.audioPlayer.audio.currentTime = this.timing[currentTimingIndex].to;
    }
  }

  pause(): void {
    this.audioPlayer?.audio?.pause();
  }

  play(): void {
    if (this.audioPlayer?.audio == null) return;
    this.audioPlayer.audio.play();
    this.subscribePlayerVerseChange(this.audioPlayer.audio);
  }

  previousRef(): void {
    if (this.audioPlayer?.audio == null || this.timing == null) return;
    const skipBackGracePeriod = 3;
    const currentTimingIndex: number = this.timing.findIndex(t => t.textRef === this.currentRef);
    if (currentTimingIndex < 0) {
      this.audioPlayer.audio.currentTime = 0;
    } else if (this.audioPlayer.audio.currentTime > this.timing[currentTimingIndex].from + skipBackGracePeriod) {
      // Move to the start of the reference that had already been playing
      // rather than the start of the previous reference - this mimics Spotify previous track logic
      this.audioPlayer.audio.currentTime = this.timing[currentTimingIndex].from;
    } else if (currentTimingIndex === 0) {
      // The first timing index doesn't always start at zero so this forces it to the beginning of the audio
      this.audioPlayer.audio.currentTime = 0;
    } else {
      this.audioPlayer.audio.currentTime = this.timing[currentTimingIndex - 1].from;
    }
  }

  stop(): void {
    this.audioPlayer?.audio?.stop();
  }

  private getRefIndexInTimings(ref: string): number {
    if (CheckingUtils.parseAudioRef(ref)?.verseStr != null) {
      return this._timing.findIndex(t => t.textRef === ref)!;
    }
    // ref is a section heading
    let headingNumber: number = +ref.split('_')[1];
    for (let i = 0; i < this._timing.length; i++) {
      if (this._timing[i].textRef === 's') {
        headingNumber--;
        if (headingNumber === 0) {
          return i;
        }
      }
    }
    return -1;
  }

  private subscribePlayerVerseChange(audio: AudioPlayer): void {
    this.subscribe(
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
