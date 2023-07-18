import { Component, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
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
export class CheckingQuestionComponent extends SubscriptionDisposable implements OnChanges {
  private _scriptureTextAudioData?: TextAudio;
  private _focusedText = 'scripture-audio-label';

  @Input() questionDoc?: QuestionDoc;
  @ViewChild('questionAudio') questionAudio?: SingleButtonAudioPlayerComponent;
  private _scriptureAudio?: SingleButtonAudioPlayerComponent;
  @ViewChild('scriptureAudio') set scriptureAudio(comp: SingleButtonAudioPlayerComponent) {
    if (this._scriptureAudio === comp) return;
    this._scriptureAudio = comp;
    if (comp) {
      this.subscribe(comp.hasFinishedPlayingOnce$, newVal => {
        if (newVal) {
          this.selectQuestion();
        }
      });
    }
  }

  constructor(private readonly projectService: SFProjectService, private readonly i18n: I18nService) {
    super();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['questionDoc']) {
      this.dispose();

      this._focusedText = 'scripture-audio-label';
      const projectId = this.questionDoc!.data!.projectRef;
      const audioId = getTextAudioId(
        projectId,
        this.questionDoc!.data!.verseRef!.bookNum,
        this.questionDoc!.data!.verseRef!.chapterNum
      );

      this.projectService.queryAudioText(projectId).then(audioQuery => {
        this._scriptureTextAudioData = audioQuery.docs.find(t => t.id === audioId)?.data;
        if (!this.scriptureAudioUrl) {
          this.selectQuestion();
        }
      });
    }
  }

  get focusedText(): string {
    return this._focusedText;
  }

  selectQuestion(): void {
    this._focusedText = 'question-audio-label';
  }

  selectScripture(): void {
    this._focusedText = 'scripture-audio-label';
  }

  get referenceForDisplay(): string {
    const verseRefData: VerseRefData | undefined = this.questionDoc?.data?.verseRef;
    return verseRefData ? this.i18n.localizeReference(toVerseRef(verseRefData)) : '';
  }

  get scriptureAudioUrl(): string | undefined {
    return this._scriptureTextAudioData?.audioUrl;
  }

  get scriptureAudioStart(): number | undefined {
    return this._scriptureTextAudioData?.timings.find(t => t.textRef === 'v' + this.startVerse.toString())?.from;
  }

  get scriptureAudioEnd(): number | undefined {
    return this._scriptureTextAudioData?.timings.find(t => t.textRef === 'v' + this.endVerse.toString())?.to;
  }

  get questionText(): string {
    return this.questionDoc?.data?.text
      ? this.questionDoc.data.text
      : 'Listen to the question for ' + this.referenceForDisplay;
  }

  get questionAudioUrl(): string | undefined {
    return this.questionDoc?.data?.audioUrl;
  }

  playScripture(): void {
    this._scriptureAudio?.audio?.isPlaying ? this._scriptureAudio?.stop() : this._scriptureAudio?.play();
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
