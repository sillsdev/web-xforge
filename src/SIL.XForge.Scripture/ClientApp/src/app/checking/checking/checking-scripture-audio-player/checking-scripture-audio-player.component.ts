import { Component, Input, ViewChild } from '@angular/core';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { TextDocId } from 'src/app/core/models/text-doc';
import { SFProjectService } from 'src/app/core/sf-project.service';
import { getVerseStrFromSegmentRef } from 'src/app/shared/utils';
import { I18nService } from 'xforge-common/i18n.service';
import { AudioPlayerComponent } from '../../../shared/audio/audio-player/audio-player.component';

@Component({
  selector: 'app-checking-scripture-audio-player',
  templateUrl: './checking-scripture-audio-player.component.html',
  styleUrls: ['./checking-scripture-audio-player.component.scss']
})
export class CheckingScriptureAudioPlayerComponent {
  @Input() source?: string;
  @Input() timing?: AudioTiming[];
  @Input() textDocId?: TextDocId;
  @Input() canDelete: boolean = false;
  @ViewChild('audioPlayer') audioPlayer?: AudioPlayerComponent;

  constructor(private readonly i18n: I18nService, private readonly projectService: SFProjectService) {}

  get currentRef(): string | undefined {
    if (this.timing == null) return;
    const currentTime: number = this.audioPlayer?.audio?.currentTime ?? 0;
    return this.timing.find(t => t.to > currentTime)?.textRef;
  }

  get currentVerseLabel(): string | undefined {
    if (this.currentRef == null || this.textDocId == null) return;
    const verseRef = new VerseRef(
      Canon.bookNumberToId(this.textDocId.bookNum),
      this.textDocId.chapterNum.toString(),
      getVerseStrFromSegmentRef(this.currentRef) ?? ''
    );
    return this.i18n.localizeReference(verseRef);
  }

  get isPlaying(): boolean {
    return !!this.audioPlayer?.audio?.isPlaying;
  }

  play(): void {
    this.audioPlayer?.audio?.play();
  }

  pause(): void {
    this.audioPlayer?.audio?.pause();
  }

  previousRef(): void {
    if (this.audioPlayer == null || this.audioPlayer.audio == null || this.timing == null) return;
    const currentTimingIndex: number = this.timing.findIndex(t => t.textRef === this.currentRef);
    if (currentTimingIndex < 0) {
      this.audioPlayer.audio.currentTime = 0;
    }
    this.audioPlayer.audio.currentTime = this.timing[currentTimingIndex - 1].from;
  }

  nextRef(): void {
    if (this.audioPlayer == null || this.audioPlayer.audio == null || this.timing == null) return;
    const currentTimingIndex: number = this.timing.findIndex(t => t.textRef === this.currentRef);
    if (currentTimingIndex < 0) {
      // TODO (scripture audio): find a better solution than setting the current time to 0
      this.audioPlayer.audio.currentTime = 0;
    }
    this.audioPlayer.audio.currentTime = this.timing[currentTimingIndex].to;
  }

  deleteAudioTimingData(): void {
    if (this.textDocId?.projectId == null || this.textDocId?.bookNum == null || this.textDocId?.chapterNum == null) {
      return;
    }
    this.projectService.onlineDeleteAudioTimingData(
      this.textDocId.projectId,
      this.textDocId.bookNum,
      this.textDocId.chapterNum
    );
  }
}
