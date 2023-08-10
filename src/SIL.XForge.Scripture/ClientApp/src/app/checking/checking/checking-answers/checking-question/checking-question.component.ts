import { Component, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild } from '@angular/core';
import { translate } from '@ngneat/transloco';
import { VerseRef } from '@sillsdev/scripture';
import { TextAudio, getTextAudioId } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import {
  VerseRefData,
  toStartAndEndVerseRefs,
  toVerseRef
} from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Subscription } from 'rxjs';
import { TextAudioDoc } from 'src/app/core/models/text-audio-doc';
import { I18nService } from 'xforge-common/i18n.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { QuestionDoc } from '../../../../core/models/question-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { SingleButtonAudioPlayerComponent } from '../../single-button-audio-player/single-button-audio-player.component';

@Component({
  selector: 'app-checking-question',
  templateUrl: './checking-question.component.html',
  styleUrls: ['./checking-question.component.scss']
})
export class CheckingQuestionComponent extends SubscriptionDisposable implements OnChanges, OnDestroy {
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
  private _audioChangeSub?: Subscription;
  private audioQuery?: RealtimeQuery<TextAudioDoc>;
  private projectId?: string;

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

  // TODO (scripture audio) fill this in when timing data is working
  get scriptureAudioStart(): number | undefined {
    return this._scriptureTextAudioData?.timings.find(t => t.textRef === 'v' + this.startVerse.toString())?.from;
  }

  get scriptureAudioEnd(): number | undefined {
    return this._scriptureTextAudioData?.timings.find(t => t.textRef === 'v' + this.endVerse.toString())?.to;
  }

  get questionText(): string {
    return this.questionDoc?.data?.text
      ? this.questionDoc.data.text
      : translate('checking_questions.listen_to_question') + this.referenceForDisplay;
  }

  get questionAudioUrl(): string | undefined {
    return this.questionDoc?.data?.audioUrl;
  }

  private get audioId(): string {
    if (this.projectId == null) {
      return '';
    }
    return getTextAudioId(
      this.projectId,
      this.questionDoc!.data!.verseRef!.bookNum,
      this.questionDoc!.data!.verseRef!.chapterNum
    );
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
      if (projectId === this.projectId) {
        this.updateScriptureAudio();
        return;
      }
      this.projectId = projectId;
      this.projectService.queryAudioText(this.projectId).then(audioQuery => {
        this.audioQuery = audioQuery;
        if (this._audioChangeSub != null) {
          this._audioChangeSub.unsubscribe();
        }
        this.updateScriptureAudio();
        this._audioChangeSub = audioQuery?.remoteChanges$?.subscribe(() => {
          this.updateScriptureAudio();
        });
      });
    }
  }

  ngOnDestroy(): void {
    this.dispose();
    if (this._audioChangeSub != null) {
      this._audioChangeSub.unsubscribe();
    }
  }

  private updateScriptureAudio(): void {
    this._scriptureTextAudioData = this.audioQuery?.docs?.find(t => t.id === this.audioId)?.data;
    if (this._scriptureTextAudioData == null || this.scriptureAudioUrl == null) {
      this.selectQuestion();
    } else {
      this.selectScripture();
    }
  }
}
