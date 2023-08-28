import { Component, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { distinctUntilChanged, map } from 'rxjs/operators';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { AudioHeadingRef, AudioTextRef, CheckingUtils } from '../../checking.utils';
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

  constructor(private readonly i18n: I18nService, private readonly projectService: SFProjectService) {
    super();
  }

  get isPlaying(): boolean {
    return !!this.audioPlayer?.audio?.isPlaying;
  }

  @Input() set timing(value: AudioTiming[]) {
    this._timing = value.sort((a, b) => a.from - b.from);
  }

  get currentVerseLabel(): string {
    if (this.textDocId == null || this.audioPlayer?.audio?.currentTime == null) return '';
    const currentVerseStr: string = this.getCurrentVerseStr(this.audioPlayer.audio.currentTime);
    const verseRef = new VerseRef(
      Canon.bookNumberToId(this.textDocId.bookNum),
      this.textDocId.chapterNum.toString(),
      currentVerseStr
    );
    return this.i18n.localizeReference(verseRef);
  }

  play(): void {
    if (this.audioPlayer?.audio == null) return;
    this.audioPlayer.audio.play();
    this.subscribePlayerVerseChange(this.audioPlayer.audio);
  }

  pause(): void {
    this.audioPlayer?.audio?.pause();
  }

  previousRef(): void {
    if (this.audioPlayer?.audio == null || this._timing.length < 1) return;

    const currentTimingIndex: number = this.getRefIndexInTimings(this.audioPlayer.audio.currentTime);
    if (currentTimingIndex <= 0) {
      this.audioPlayer.audio.currentTime = 0;
      return;
    }
    this.audioPlayer.audio.currentTime = this._timing[currentTimingIndex - 1].from;
  }

  nextRef(): void {
    if (this.audioPlayer?.audio == null || this._timing.length < 1) return;

    const currentTimingIndex: number = this.getRefIndexInTimings(this.audioPlayer.audio.currentTime);
    if (currentTimingIndex < 0) {
      // TODO (scripture audio): find a better solution than setting the current time to 0
      this.audioPlayer.audio.currentTime = 0;
      return;
    }
    this.audioPlayer.audio.currentTime = this._timing[currentTimingIndex].to;
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
        if (this.textDocId == null || this.audioPlayer?.audio == null) return;

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
        const segmentRef: string = `verse_${this.textDocId.chapterNum}_${audioTextRef.verseStr}`;
        this.currentVerseChanged.emit(segmentRef);
      }
    );
  }

  private getCurrentVerseStr(currentTime: number): string {
    const index: number = this.getRefIndexInTimings(currentTime);
    for (let i = index; i >= 0; i--) {
      const audioRef: AudioTextRef | undefined = CheckingUtils.parseAudioRef(this._timing, this._timing[i].from);
      if (audioRef != null) return audioRef.verseStr;
    }
    return '0';
  }
}
