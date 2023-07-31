import { Component, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { translate } from '@ngneat/transloco';
import { VerseRef } from '@sillsdev/scripture';
import { getTextAudioId, TextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import {
  toStartAndEndVerseRefs,
  toVerseRef,
  VerseRefData
} from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { I18nService } from 'xforge-common/i18n.service';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { QuestionDoc } from '../../../../core/models/question-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { SingleButtonAudioPlayerComponent } from '../../single-button-audio-player/single-button-audio-player.component';

@Component({
  selector: 'app-checking-question',
  templateUrl: './checking-question.component.html',
  styleUrls: ['./checking-question.component.scss']
})
export class CheckingQuestionComponent extends SubscriptionDisposable implements OnChanges {
  @Input() questionDoc?: QuestionDoc;
  @ViewChild('questionAudio') questionAudio?: SingleButtonAudioPlayerComponent;
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

  private _scriptureAudio?: SingleButtonAudioPlayerComponent;
  private _scriptureTextAudioData?: TextAudio;
  private _focusedText: string = 'scripture-audio-label';

  constructor(private readonly projectService: SFProjectService, private readonly i18n: I18nService) {
    super();
  }

  get focusedText(): string {
    return this._focusedText;
  }

  get referenceForDisplay(): string {
    const verseRefData: VerseRefData | undefined = this.questionDoc?.data?.verseRef;
    return verseRefData ? this.i18n.localizeReference(toVerseRef(verseRefData)) : '';
  }

  get scriptureAudioUrl(): string | undefined {
    return this._scriptureTextAudioData?.audioUrl;
  }

  get scriptureAudioStart(): number | undefined {
    return this._scriptureTextAudioData?.timings.find(t => t.textRef === this.startVerse.toString())?.from;
  }

  get scriptureAudioEnd(): number | undefined {
    return this._scriptureTextAudioData?.timings.find(t => t.textRef === this.endVerse.toString())?.to;
  }

  get questionText(): string {
    return this.questionDoc?.data?.text
      ? this.questionDoc.data.text
      : translate('checking_questions.listen_to_question') + this.referenceForDisplay;
  }

  get questionAudioUrl(): string | undefined {
    return this.questionDoc?.data?.audioUrl;
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

  selectQuestion(): void {
    this._focusedText = 'question-audio-label';
  }

  selectScripture(): void {
    this._focusedText = 'scripture-audio-label';
  }

  playScripture(): void {
    this._scriptureAudio?.audio?.isPlaying ? this._scriptureAudio?.stop() : this._scriptureAudio?.play();
  }

  playQuestion(): void {
    this.questionAudio?.audio?.isPlaying ? this.questionAudio?.stop() : this.questionAudio?.play();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['questionDoc']) {
      this.dispose();

      this._focusedText = 'scripture-audio-label';
      const projectId: string = this.questionDoc!.data!.projectRef;
      const audioId: string = getTextAudioId(
        projectId,
        this.questionDoc!.data!.verseRef!.bookNum,
        this.questionDoc!.data!.verseRef!.chapterNum
      );

      this.projectService.queryAudioText(projectId).then(audioQuery => {
        this._scriptureTextAudioData = audioQuery?.docs?.find(t => t.id === audioId)?.data;
        if (this._scriptureTextAudioData == null || this.scriptureAudioUrl == null) {
          this.selectQuestion();
        }
      });
    }
  }
}
