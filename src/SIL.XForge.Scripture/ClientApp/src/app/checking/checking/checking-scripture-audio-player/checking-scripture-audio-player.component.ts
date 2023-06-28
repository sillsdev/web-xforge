import { Component, Input } from '@angular/core';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { TextDocId } from 'src/app/core/models/text-doc';
import { AudioPlayer } from 'src/app/shared/audio-player';
import { getVerseStrFromSegmentRef } from 'src/app/shared/utils';
import { I18nService } from 'xforge-common/i18n.service';
import { PwaService } from 'xforge-common/pwa.service';

@Component({
  selector: 'app-checking-scripture-audio-player',
  templateUrl: './checking-scripture-audio-player.component.html',
  styleUrls: ['./checking-scripture-audio-player.component.scss']
})
export class CheckingScriptureAudioPlayerComponent {
  private audioPlayer: AudioPlayer | undefined;

  @Input() timing?: AudioTiming[];
  @Input() textDocId?: TextDocId;
  @Input() set source(source: string | undefined) {
    if (source != null && source !== '') {
      this.audioPlayer = new AudioPlayer(source, this.pwaService);
    }
  }

  constructor(private readonly i18n: I18nService, private readonly pwaService: PwaService) {}

  get currentRef(): string | undefined {
    if (this.timing == null) return;
    const currentTime: number = this.audioPlayer?.currentTime ?? 0;
    return this.timing.find(t => t.to > currentTime)?.textRef;
  }

  get currentVerseLabel(): string | undefined {
    if (this.currentRef == null || this.textDocId == null) return;
    const verseRef = new VerseRef(
      this.textDocId.bookNum,
      this.textDocId.chapterNum,
      getVerseStrFromSegmentRef(this.currentRef)
    );
    return this.i18n.localizeReference(verseRef);
  }

  get isPlaying(): boolean {
    return !!this.audioPlayer?.isPlaying;
  }

  play(): void {
    this.audioPlayer?.play();
  }

  pause(): void {
    this.audioPlayer?.pause();
  }

  previousRef(): void {
    if (this.audioPlayer == null || this.timing == null) return;
    const currentTimingIndex: number = this.timing.findIndex(t => t.textRef === this.currentRef);
    if (currentTimingIndex < 0) {
      this.audioPlayer.currentTime = 0;
    }
    this.audioPlayer.currentTime = this.timing[currentTimingIndex - 1].from;
  }

  nextRef(): void {
    if (this.audioPlayer == null || this.timing == null) return;
    const currentTimingIndex: number = this.timing.findIndex(t => t.textRef === this.currentRef);
    if (currentTimingIndex < 0) {
      // TODO (scripture audio): find a better solution than setting the current time to 0
      this.audioPlayer.currentTime = 0;
    }
    this.audioPlayer.currentTime = this.timing[currentTimingIndex].to;
  }
}
