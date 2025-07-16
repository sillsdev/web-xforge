import {
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { VerseRef } from '@sillsdev/scripture';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { getTextAudioId, TextAudio } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import {
  toStartAndEndVerseRefs,
  toVerseRef,
  VerseRefData
} from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { Subscription } from 'rxjs';
import { I18nService } from 'xforge-common/i18n.service';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { SubscriptionDisposable } from 'xforge-common/subscription-disposable';
import { QuestionDoc } from '../../../../core/models/question-doc';
import { TextAudioDoc } from '../../../../core/models/text-audio-doc';
import { SFProjectService } from '../../../../core/sf-project.service';
import { CheckingUtils } from '../../../checking.utils';
import { SingleButtonAudioPlayerComponent } from '../../single-button-audio-player/single-button-audio-player.component';

@Component({
    selector: 'app-checking-question',
    templateUrl: './checking-question.component.html',
    styleUrls: ['./checking-question.component.scss'],
    standalone: false
})
export class CheckingQuestionComponent extends SubscriptionDisposable implements OnChanges, OnDestroy {
  @Output() audioPlayed: EventEmitter<void> = new EventEmitter<void>();
  @ViewChild('questionAudio') questionAudio?: SingleButtonAudioPlayerComponent;
  @ViewChild('scriptureAudio') set scriptureAudio(comp: SingleButtonAudioPlayerComponent) {
    if (this._scriptureAudio === comp) return;
    this._scriptureAudio = comp;
    if (comp) {
      this.subscribe(comp.hasFinishedPlayingOnce$, newVal => {
        if (newVal) {
          this.selectQuestion();
          this.updateUserRefsPlayed();
        }
      });
    }
  }

  private _scriptureAudio?: SingleButtonAudioPlayerComponent;
  private _scriptureTextAudioData?: TextAudio;
  private _focusedText: 'question-audio-label' | 'scripture-audio-label' = 'scripture-audio-label';
  private _audioChangeSub?: Subscription;
  private _questionDoc?: QuestionDoc;
  private audioQuery?: RealtimeQuery<TextAudioDoc>;
  private projectId?: string;
  private _versesListenedTo = new Set<string>();
  private questionDocSub?: Subscription;
  private isDestroyed = false;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly projectService: SFProjectService,
    private readonly i18n: I18nService
  ) {
    super();
  }

  get focusedText(): string {
    return this._focusedText;
  }

  @Input() set questionDoc(doc: QuestionDoc | undefined) {
    if (doc?.data == null) {
      return;
    }
    if (doc.id !== this._questionDoc?.id) {
      this.stopAudio();
    }
    this._questionDoc = doc;
    this.questionDocSub?.unsubscribe();
    this.questionDocSub = this._questionDoc.changes$.subscribe(() => this.updateScriptureAudio());
  }

  get referenceForDisplay(): string {
    const verseRefData: VerseRefData | undefined = this._questionDoc?.data?.verseRef;
    return verseRefData ? this.i18n.localizeReference(toVerseRef(verseRefData)) : '';
  }

  get scriptureAudioStart(): number | undefined {
    // Audio timings are not guaranteed to be in order, some timing files group section headings and verses together
    const verseTimings: AudioTiming[] | undefined = this._scriptureTextAudioData?.timings.filter(
      t => CheckingUtils.parseAudioRef(t.textRef)?.verseStr === this.startVerse.toString()
    );
    if (verseTimings == null || verseTimings.length === 0) return undefined;
    return Math.min(...verseTimings.map(t => t.from));
  }

  get scriptureAudioEnd(): number | undefined {
    // Audio timings are not guaranteed to be in order, some timing files group section headings and verses together
    // Get the timing for the latest record for a verse
    const verseTimings: AudioTiming[] | undefined = this._scriptureTextAudioData?.timings.filter(
      t => CheckingUtils.parseAudioRef(t.textRef)?.verseStr === this.endVerse.toString()
    );
    if (verseTimings == null || verseTimings.length === 0) return undefined;
    return Math.max(...verseTimings.map(t => t.to));
  }

  get questionText(): string {
    if (this._questionDoc?.data == null) return '';
    return this._questionDoc.data.text
      ? this._questionDoc.data.text
      : this._questionDoc.data.audioUrl != null
        ? this.i18n.translateStatic('checking_questions.listen_to_question', {
            referenceForDisplay: this.referenceForDisplay
          })
        : '';
  }

  get questionAudioUrl(): string | undefined {
    return this._questionDoc?.data?.audioUrl;
  }

  get scriptureAudioUrl(): string | undefined {
    return this._scriptureTextAudioData?.audioUrl;
  }

  private get audioId(): string {
    if (this.projectId == null) {
      return '';
    }
    return getTextAudioId(
      this.projectId,
      this._questionDoc!.data!.verseRef!.bookNum,
      this._questionDoc!.data!.verseRef!.chapterNum
    );
  }

  private get startVerse(): number {
    const verseRefData: VerseRefData | undefined = this._questionDoc?.data?.verseRef;
    return verseRefData ? toVerseRef(verseRefData).verseNum : 0;
  }

  private get endVerse(): number {
    const verseRefData: VerseRefData | undefined = this._questionDoc?.data?.verseRef;
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
    if (this._scriptureAudio?.audio?.isPlaying) {
      this._scriptureAudio.stop();
    } else {
      this._scriptureAudio?.play();
      this.audioPlayed.emit();
    }
  }

  playQuestion(): void {
    this.questionAudio?.audio?.isPlaying ? this.questionAudio.stop() : this.questionAudio?.play();
  }

  stopAudio(): void {
    if (this.questionAudio?.audio?.isPlaying) {
      this.questionAudio.stop();
    }
    if (this._scriptureAudio?.audio?.isPlaying) {
      this._scriptureAudio.stop();
    }
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['questionDoc']) {
      this.dispose();

      const projectId: string = this._questionDoc!.data!.projectRef;
      if (projectId === this.projectId) {
        this.updateScriptureAudio();
        return;
      }
      this.projectId = projectId;

      this.audioQuery = await this.projectService.queryAudioText(this.projectId, this.destroyRef);

      // If the component is destroyed before the query is ready, don't subscribe to remote changes
      if (this.isDestroyed) {
        return;
      }

      if (this._audioChangeSub != null) {
        this._audioChangeSub.unsubscribe();
      }
      this.updateScriptureAudio();
      this._audioChangeSub = this.audioQuery?.remoteChanges$?.subscribe(() => {
        this.updateScriptureAudio();
      });
    }
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    super.ngOnDestroy();
    this._audioChangeSub?.unsubscribe();
    this.questionDocSub?.unsubscribe();
    this.audioQuery?.dispose();
  }

  private setDefaultFocus(): void {
    if (this._questionDoc?.data == null) {
      this.selectQuestion();
      return;
    }

    const verseRefs: VerseRef[] = toVerseRef(this._questionDoc.data.verseRef).allVerses();
    const haveListenedToAllVerses = verseRefs.every(v => this._versesListenedTo.has(v.toString()));

    // Select a question if there is no audio or if all verses have been played already
    if (this._scriptureTextAudioData == null || haveListenedToAllVerses) {
      this.selectQuestion();
    } else {
      this.selectScripture();
    }
  }

  private updateScriptureAudio(): void {
    this._scriptureTextAudioData = this.audioQuery?.docs?.find(t => t.id === this.audioId)?.data;
    this.setDefaultFocus();
  }

  private updateUserRefsPlayed(): void {
    if (this._questionDoc?.data?.verseRef == null) {
      return;
    }

    const verses = toVerseRef(this._questionDoc.data.verseRef).allVerses();
    verses.forEach(v => this._versesListenedTo.add(v.toString()));
  }
}
