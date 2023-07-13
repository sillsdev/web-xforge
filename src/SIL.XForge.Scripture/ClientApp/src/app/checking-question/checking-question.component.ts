import { AfterViewInit, Component, Input, ViewChild } from '@angular/core';
import { VerseRef } from '@sillsdev/scripture';
import { getTextAudioId, TextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import {
  toStartAndEndVerseRefs,
  toVerseRef,
  VerseRefData
} from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { SingleButtonAudioPlayerComponent } from '../checking/checking/single-button-audio-player/single-button-audio-player.component';
import { QuestionDoc } from '../core/models/question-doc';
import { SFProjectService } from '../core/sf-project.service';

@Component({
  selector: 'app-checking-question',
  templateUrl: './checking-question.component.html',
  styleUrls: ['./checking-question.component.scss']
})
export class CheckingQuestionComponent extends SubscriptionDisposable implements AfterViewInit {
  private _scriptureAudio?: TextAudio;
  private _focusedText = 'scripture-audio-label';

  @Input() questionDoc?: QuestionDoc;
  @ViewChild('questionAudio') questionAudio?: SingleButtonAudioPlayerComponent;
  @ViewChild('scriptureAudio') scriptureAudio?: SingleButtonAudioPlayerComponent;

  constructor(private readonly projectService: SFProjectService, private readonly i18n: I18nService) {
    super();
  }

  ngAfterViewInit(): void {
    const projectId = this.questionDoc!.data!.projectRef;
    const audioId = getTextAudioId(
      projectId,
      this.questionDoc!.data!.verseRef!.bookNum,
      this.questionDoc!.data!.verseRef!.chapterNum
    );

    this.projectService.queryAudioText(projectId).then(audioQuery => {
      this._scriptureAudio = audioQuery.docs.find(t => t.id === audioId)?.data;
    });

    this.subscribe(this.scriptureAudio!.hasFinishedPlayingOnce$, newVal => {
      if (newVal) {
        this._focusedText = 'question-audio-label';
      }
    });
  }

  get focusedText(): string {
    return this._focusedText;
  }

  get referenceForDisplay(): string {
    const verseRefData: VerseRefData | undefined = this.questionDoc?.data?.verseRef;
    return verseRefData ? this.i18n.localizeReference(toVerseRef(verseRefData)) : '';
  }

  get scriptureAudioUrl(): string | undefined {
    return this._scriptureAudio?.audioUrl;
  }

  get scriptureAudioStart(): number | undefined {
    return this._scriptureAudio?.timings.find(t => t.textRef === 'v' + this.startVerse.toString())?.from;
  }

  get scriptureAudioEnd(): number | undefined {
    return this._scriptureAudio?.timings.find(t => t.textRef === 'v' + this.endVerse.toString())?.to;
  }

  get questionText(): string {
    return this.questionDoc?.data?.text ?? 'Listen to the question for ' + this.referenceForDisplay;
  }

  get questionAudioUrl(): string | undefined {
    return this.questionDoc?.data?.audioUrl;
  }

  playScripture(): void {
    this.scriptureAudio?.audio?.isPlaying ? this.scriptureAudio?.stop() : this.scriptureAudio?.play();
  }

  playQuestion(): void {
    this.questionAudio?.audio?.isPlaying ? this.questionAudio?.stop() : this.questionAudio?.play();
  }

  private get startVerse(): number {
    const verseRefData: VerseRefData | undefined = this.questionDoc?.data?.verseRef;
    return verseRefData ? toVerseRef(verseRefData).verseNum : 0;
  }

  private get endVerse(): number {
    const verseRefData: VerseRefData | undefined = this.questionDoc?.data?.verseRef;
    const end: VerseRef | undefined = verseRefData && toStartAndEndVerseRefs(verseRefData).endVerseRef;
    return end ? end.verseNum : this.startVerse;
  }
}
