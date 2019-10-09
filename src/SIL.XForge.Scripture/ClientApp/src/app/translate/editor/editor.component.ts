import { MdcIconButton } from '@angular-mdc/web';
import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  InteractiveTranslationSession,
  LatinWordTokenizer,
  MAX_SEGMENT_LENGTH,
  PhraseTranslationSuggester,
  RemoteTranslationEngine,
  Tokenizer,
  TranslationSuggester
} from '@sillsdev/machine';
import isEqual from 'lodash/isEqual';
import { DeltaStatic, RangeStatic } from 'quill';
import { Operation } from 'realtime-server/lib/common/models/project-rights';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/scriptureforge/models/sf-project-role';
import { TextType } from 'realtime-server/lib/scriptureforge/models/text-data';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { BehaviorSubject, fromEvent, Subject, Subscription, timer } from 'rxjs';
import { debounceTime, delayWhen, filter, map, repeat, retryWhen, skip, tap } from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { NoticeService } from 'xforge-common/notice.service';
import { UserService } from 'xforge-common/user.service';
import XRegExp from 'xregexp';
import { HelpHeroService } from '../../core/help-hero.service';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { Delta } from '../../core/models/text-doc';
import { TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { Segment } from '../../shared/text/segment';
import { TextComponent } from '../../shared/text/text.component';
import { TranslateMetricsSession } from './translate-metrics-session';

export const UPDATE_SUGGESTIONS_TIMEOUT = 100;
export const CONFIDENCE_THRESHOLD_TIMEOUT = 500;

const PUNCT_SPACE_REGEX = XRegExp('^(\\p{P}|\\p{S}|\\p{Cc}|\\p{Z})+$');

/** Scripture editing area. Used for Translate task. */
@Component({
  selector: 'app-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss']
})
export class EditorComponent extends DataLoadingComponent implements OnInit, OnDestroy, AfterViewInit {
  suggestionWords: string[] = [];
  suggestionConfidence: number = 0;
  showSuggestion: boolean = false;
  displaySlider: boolean = false;
  chapters: number[] = [];
  readonly metricsSession: TranslateMetricsSession;
  trainingPercentage: number;
  trainingMessage: string;
  showTrainingProgress: boolean = false;
  textHeight: string = '';

  @ViewChild('targetContainer', { static: true }) targetContainer: ElementRef;
  @ViewChild('source', { static: true }) source: TextComponent;
  @ViewChild('target', { static: true }) target: TextComponent;
  @ViewChild('suggestionsMenuButton', { static: false }) suggestionsMenuButton: MdcIconButton;

  private translationEngine: RemoteTranslationEngine;
  private isTranslating: boolean = false;
  private readonly sourceWordTokenizer: Tokenizer;
  private readonly targetWordTokenizer: Tokenizer;
  private translationSession?: InteractiveTranslationSession;
  private readonly translationSuggester: TranslationSuggester = new PhraseTranslationSuggester();
  private insertSuggestionEnd: number = -1;
  private projectDoc: SFProjectDoc;
  private projectUserConfigDoc: SFProjectUserConfigDoc;
  private projectUserConfigChangesSub: Subscription;
  private text: TextInfo;
  private sourceLoaded: boolean = false;
  private targetLoaded: boolean = false;
  private confidenceThreshold$: BehaviorSubject<number>;
  private _chapter: number;
  private lastShownSuggestionWords: string[] = [];
  private readonly segmentUpdated$: Subject<void>;
  private trainingSub: Subscription;
  private projectDataChangesSub: Subscription;
  private trainingProgressClosed: boolean = false;
  private trainingCompletedTimeout: any;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    noticeService: NoticeService,
    private readonly helpHeroService: HelpHeroService
  ) {
    super(noticeService);
    const wordTokenizer = new LatinWordTokenizer();
    this.sourceWordTokenizer = wordTokenizer;
    this.targetWordTokenizer = wordTokenizer;
    this.metricsSession = new TranslateMetricsSession(this.projectService);

    this.confidenceThreshold$ = new BehaviorSubject<number>(20);
    this.translationSuggester.confidenceThreshold = 0.2;
    this.subscribe(
      this.confidenceThreshold$.pipe(
        skip(1),
        debounceTime(CONFIDENCE_THRESHOLD_TIMEOUT),
        map(value => value / 100),
        filter(threshold => threshold !== this.translationSuggester.confidenceThreshold)
      ),
      threshold => {
        this.translationSuggester.confidenceThreshold = threshold;
        this.updateSuggestions();
        this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.confidenceThreshold, threshold));
      }
    );

    this.segmentUpdated$ = new Subject<void>();
    this.subscribe(this.segmentUpdated$.pipe(debounceTime(UPDATE_SUGGESTIONS_TIMEOUT)), () => this.updateSuggestions());
  }

  get sourceLabel(): string {
    return this.projectDoc == null || !this.projectDoc.isLoaded || this.projectDoc.data.translateConfig.source == null
      ? ''
      : this.projectDoc.data.translateConfig.source.shortName;
  }

  get targetLabel(): string {
    return this.projectDoc == null || !this.projectDoc.isLoaded ? '' : this.projectDoc.data.shortName;
  }

  get isTargetTextRight(): boolean {
    return this.projectUserConfigDoc == null || !this.projectUserConfigDoc.isLoaded
      ? true
      : this.projectUserConfigDoc.data.isTargetTextRight;
  }

  set isTargetTextRight(value: boolean) {
    if (this.isTargetTextRight !== value) {
      this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.isTargetTextRight, value));
    }
  }

  get translationSuggestionsEnabled(): boolean {
    return this.hasSource && this.translationSuggestionsProjectEnabled && this.translationSuggestionsUserEnabled;
  }

  get translationSuggestionsUserEnabled(): boolean {
    return this.projectUserConfigDoc == null ||
      !this.projectUserConfigDoc.isLoaded ||
      this.projectUserConfigDoc.data.translationSuggestionsEnabled == null
      ? true
      : this.projectUserConfigDoc.data.translationSuggestionsEnabled;
  }

  set translationSuggestionsUserEnabled(value: boolean) {
    if (this.translationSuggestionsUserEnabled !== value) {
      this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.translationSuggestionsEnabled, value));
    }
  }

  get translationSuggestionsProjectEnabled(): boolean {
    return (
      this.projectDoc != null &&
      this.projectDoc.isLoaded &&
      this.projectDoc.data.translateConfig.translationSuggestionsEnabled
    );
  }

  get confidenceThreshold(): number {
    return this.confidenceThreshold$.value;
  }

  set confidenceThreshold(value: number) {
    this.confidenceThreshold$.next(value);
  }

  get chapter(): number {
    return this._chapter;
  }

  set chapter(value: number) {
    if (this._chapter !== value) {
      this.showSuggestion = false;
      this._chapter = value;
      this.changeText();
    }
  }

  get bookName(): string {
    return this.text == null ? '' : Canon.bookNumberToEnglishName(this.text.bookNum);
  }

  get hasSource(): boolean {
    if (!this.canEditTexts) {
      return false;
    }
    return this.text == null ? false : this.text.hasSource;
  }

  get canEditTexts(): boolean {
    if (this.projectDoc == null || !this.projectDoc.isLoaded) {
      return false;
    }
    const projectRole = this.projectDoc.data.userRoles[this.userService.currentUserId];
    return SF_PROJECT_RIGHTS.hasRight(projectRole, { projectDomain: SFProjectDomain.Texts, operation: Operation.Edit });
  }

  ngOnInit(): void {
    this.subscribe(fromEvent(window, 'resize'), () => this.setTextHeight());
    this.subscribe(
      this.activatedRoute.params.pipe(filter(params => params['projectId'] != null && params['bookId'] != null)),
      async params => {
        this.showSuggestion = false;
        this.sourceLoaded = false;
        this.targetLoaded = false;
        this.loadingStarted();
        const projectId = params['projectId'] as string;
        const bookId = params['bookId'] as string;
        const bookNum = bookId != null ? Canon.bookIdToNumber(bookId) : 0;

        const prevProjectId = this.projectDoc == null ? '' : this.projectDoc.id;
        if (projectId !== prevProjectId) {
          this.projectDoc = await this.projectService.get(projectId);
          this.projectUserConfigDoc = await this.projectService.getUserConfig(
            projectId,
            this.userService.currentUserId
          );

          if (this.projectUserConfigChangesSub != null) {
            this.projectUserConfigChangesSub.unsubscribe();
          }
          this.projectUserConfigChangesSub = this.projectUserConfigDoc.remoteChanges$.subscribe(() =>
            this.loadProjectUserConfig()
          );
        }
        if (!this.projectDoc.isLoaded) {
          return;
        }
        this.text = this.projectDoc.data.texts.find(t => t.bookNum === bookNum);
        this.chapters = this.text.chapters.map(c => c.number);

        this.loadProjectUserConfig();

        if (this.projectDoc.id !== prevProjectId) {
          this.setupTranslationEngine();
          if (this.projectDataChangesSub != null) {
            this.projectDataChangesSub.unsubscribe();
          }
          this.projectDataChangesSub = this.projectDoc.remoteChanges$.subscribe(() => {
            let sourceId: TextDocId;
            if (this.hasSource) {
              sourceId = new TextDocId(this.projectDoc.id, this.text.bookNum, this._chapter, 'source');
              if (!isEqual(this.source.id, sourceId)) {
                this.sourceLoaded = false;
                this.loadingStarted();
              }
            }
            this.source.id = sourceId;
            if (this.translationEngine == null || !this.translationSuggestionsProjectEnabled) {
              this.setupTranslationEngine();
            }
            setTimeout(() => this.setTextHeight());
          });

          this.metricsSession.start(
            this.projectDoc.id,
            this.source,
            this.target,
            this.sourceWordTokenizer,
            this.targetWordTokenizer
          );
        }

        this.startUserOnboardingTour(); // start HelpHero tour for the Translate feature
      }
    );
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.setTextHeight());
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();
    if (this.projectUserConfigChangesSub != null) {
      this.projectUserConfigChangesSub.unsubscribe();
    }
    if (this.trainingSub != null) {
      this.trainingSub.unsubscribe();
    }
    if (this.projectDataChangesSub != null) {
      this.projectDataChangesSub.unsubscribe();
    }
    this.metricsSession.dispose();
  }

  suggestionsMenuOpened(): void {
    // if the parent element of a slider resizes, then the slider will not be rendered properly. A menu is resized when
    // it is opened, which triggers this bug. We workaround this bug in MDC Web by waiting to display the slider when
    // the menu is opened.
    // https://github.com/trimox/angular-mdc-web/issues/1832
    // https://github.com/material-components/material-components-web/issues/1017
    this.displaySlider = true;
  }

  suggestionsMenuClosed(): void {
    this.displaySlider = false;
    this.suggestionsMenuButton.elementRef.nativeElement.blur();
  }

  closeTrainingProgress(): void {
    this.showTrainingProgress = false;
    this.trainingProgressClosed = true;
  }

  async onTargetUpdated(segment: Segment, delta?: DeltaStatic, prevSegment?: Segment): Promise<void> {
    if (segment !== prevSegment) {
      this.lastShownSuggestionWords = [];
      this.source.setSegment(this.target.segmentRef);
      this.syncScroll();

      this.insertSuggestionEnd = -1;
      this.onStartTranslating();
      try {
        if (
          this.projectUserConfigDoc != null &&
          this.target.segmentRef !== '' &&
          (this.projectUserConfigDoc.data.selectedBookNum !== this.text.bookNum ||
            this.projectUserConfigDoc.data.selectedChapterNum !== this._chapter ||
            this.projectUserConfigDoc.data.selectedSegment !== this.target.segmentRef)
        ) {
          await this.projectUserConfigDoc.submitJson0Op(op => {
            op.set<string>(puc => puc.selectedTask, 'translate');
            op.set(puc => puc.selectedBookNum, this.text.bookNum);
            op.set(puc => puc.selectedChapterNum, this._chapter);
            op.set(puc => puc.selectedSegment, this.target.segmentRef);
            op.set(puc => puc.selectedSegmentChecksum, this.target.segmentChecksum);
          });
        }
        await this.trainSegment(prevSegment);
        await this.translateSegment();
      } finally {
        this.onFinishTranslating();
      }
    } else {
      if (delta != null) {
        // insert a space if the user just inserted a suggestion and started typing
        if (
          delta.ops.length === 2 &&
          delta.ops[0].retain === this.insertSuggestionEnd &&
          delta.ops[1].insert != null &&
          delta.ops[1].insert.length > 0 &&
          !PUNCT_SPACE_REGEX.test(delta.ops[1].insert)
        ) {
          this.target.editor.insertText(this.insertSuggestionEnd, ' ', 'user');
          const selectIndex = this.insertSuggestionEnd + delta.ops[1].insert.length + 1;
          this.insertSuggestionEnd = -1;
          this.target.editor.setSelection(selectIndex, 0, 'user');
        }
      }
      if (this.insertSuggestionEnd !== -1) {
        const selection = this.target.editor.getSelection();
        if (selection == null || selection.length > 0 || selection.index !== this.insertSuggestionEnd) {
          this.insertSuggestionEnd = -1;
        }
      }
      this.segmentUpdated$.next();
      this.syncScroll();
    }
  }

  async onSourceUpdated(textChange: boolean): Promise<void> {
    if (!textChange) {
      return;
    }
    this.syncScroll();
    this.onStartTranslating();
    try {
      await this.translateSegment();
    } finally {
      this.onFinishTranslating();
    }
  }

  onTextLoaded(textType: TextType): void {
    switch (textType) {
      case 'source':
        this.sourceLoaded = true;
        break;
      case 'target':
        this.targetLoaded = true;
        break;
    }
    if ((!this.hasSource || this.sourceLoaded) && this.targetLoaded) {
      this.loadingFinished();
    }
  }

  insertSuggestion(suggestionIndex: number, event: Event): void {
    if (suggestionIndex >= this.suggestionWords.length) {
      return;
    }

    this.target.focus();
    const range = this.skipInitialWhitespace(this.target.editor.getSelection());

    const delta = new Delta();
    delta.retain(range.index);
    if (range.length > 0) {
      delta.delete(range.length);
    }

    const words = suggestionIndex === -1 ? this.suggestionWords : this.suggestionWords.slice(0, suggestionIndex + 1);
    // TODO: use detokenizer to build suggestion text
    let insertText = words.join(' ');
    if (!this.translationSession.isLastWordComplete) {
      const lastWord = this.translationSession.prefix[this.translationSession.prefix.length - 1];
      insertText = insertText.substring(lastWord.length);
    }
    if (this.insertSuggestionEnd !== -1) {
      insertText = ' ' + insertText;
    }
    delta.insert(insertText);
    this.showSuggestion = false;

    const selectIndex = range.index + insertText.length;
    this.insertSuggestionEnd = selectIndex;
    this.target.editor.updateContents(delta, 'user');
    this.target.editor.setSelection(selectIndex, 0, 'user');

    this.metricsSession.onSuggestionAccepted(event);
  }

  private setupTranslationEngine(): void {
    if (this.trainingSub != null) {
      this.trainingSub.unsubscribe();
      this.trainingSub = undefined;
    }
    this.translationSession = undefined;
    this.translationEngine = undefined;
    if (!this.translationSuggestionsProjectEnabled || !this.canEditTexts) {
      return;
    }

    this.translationEngine = this.projectService.createTranslationEngine(this.projectDoc.id);
    this.trainingSub = this.translationEngine
      .listenForTrainingStatus()
      .pipe(
        tap(
          undefined,
          () => {
            // error while listening
            this.showTrainingProgress = false;
            this.trainingCompletedTimeout = undefined;
            this.trainingProgressClosed = false;
          },
          async () => {
            // training completed successfully
            if (this.trainingProgressClosed) {
              this.noticeService.show('Training completed successfully');
              this.trainingProgressClosed = false;
            } else {
              this.trainingMessage = 'Completed successfully';
              this.trainingCompletedTimeout = setTimeout(() => {
                this.showTrainingProgress = false;
                this.trainingCompletedTimeout = undefined;
              }, 5000);
            }

            // ensure that any changes to the segment will be trained
            if (this.target.segment != null) {
              this.target.segment.acceptChanges();
            }
            // re-translate current segment
            this.onStartTranslating();
            try {
              await this.translateSegment();
            } finally {
              this.onFinishTranslating();
            }
          }
        ),
        repeat(),
        filter(progress => progress.percentCompleted > 0),
        retryWhen(errors => errors.pipe(delayWhen(() => timer(30000))))
      )
      .subscribe(progress => {
        if (!this.trainingProgressClosed) {
          this.showTrainingProgress = true;
        }
        if (this.trainingCompletedTimeout != null) {
          clearTimeout(this.trainingCompletedTimeout);
          this.trainingCompletedTimeout = undefined;
        }
        this.trainingPercentage = Math.round(progress.percentCompleted * 100);
        this.trainingMessage = progress.message;
      });
  }

  private setTextHeight(): void {
    // this is a horrible hack to set the height of the text components
    // we don't want to use flexbox because it makes editing very slow
    const elem: HTMLElement = this.targetContainer.nativeElement;
    const bounds = elem.getBoundingClientRect();
    // add bottom padding
    const top = bounds.top + 14;
    if (this.target.hasFocus) {
      // reset scroll position
      this.target.editor.scrollingContainer.scrollTop = 0;
    }
    this.textHeight = `calc(100vh - ${top}px)`;
    if (this.target.hasFocus) {
      setTimeout(() => {
        // reset focus, which causes Quill to scroll to the selection
        this.target.blur();
        this.target.focus();
      });
    }
  }

  private changeText(): void {
    let selectedSegment: string;
    let selectedSegmentChecksum: number;
    if (
      this.projectUserConfigDoc != null &&
      this.projectUserConfigDoc.data.selectedBookNum === this.text.bookNum &&
      this.projectUserConfigDoc.data.selectedChapterNum === this._chapter &&
      this.projectUserConfigDoc.data.selectedSegment !== ''
    ) {
      selectedSegment = this.projectUserConfigDoc.data.selectedSegment;
      selectedSegmentChecksum = this.projectUserConfigDoc.data.selectedSegmentChecksum;
    }
    this.source.id = this.hasSource
      ? new TextDocId(this.projectDoc.id, this.text.bookNum, this._chapter, 'source')
      : undefined;
    const targetId = new TextDocId(this.projectDoc.id, this.text.bookNum, this._chapter, 'target');
    if (!isEqual(targetId, this.target.id)) {
      // blur the target before switching so that scrolling is reset to the top
      this.target.blur();
    }
    this.target.id = targetId;
    if (selectedSegment != null) {
      const segmentChanged = this.target.setSegment(selectedSegment, selectedSegmentChecksum, true);
      if (!segmentChanged && selectedSegmentChecksum == null) {
        // the segment checksum was unset on the server, so accept the current segment changes
        this.target.segment.acceptChanges();
      }
    }
    setTimeout(() => this.setTextHeight());
  }

  private onStartTranslating(): void {
    this.isTranslating = true;
    this.suggestionWords = [];
    this.showSuggestion = this.target.isSelectionAtSegmentEnd;
  }

  private async translateSegment(): Promise<void> {
    this.translationSession = undefined;
    if (this.translationEngine == null) {
      return;
    }
    const sourceSegment = this.source.segmentText;
    const words = this.sourceWordTokenizer.tokenizeToStrings(sourceSegment);
    if (words.length === 0) {
      return;
    } else if (words.length > MAX_SEGMENT_LENGTH) {
      this.translationSession = undefined;
      this.noticeService.show('This verse is too long to generate suggestions.');
      return;
    }

    const start = performance.now();
    const translationSession = await this.translationEngine.translateInteractively(1, words);
    if (sourceSegment === this.source.segmentText) {
      this.translationSession = translationSession;
      const finish = performance.now();
      console.log(`Translated segment, length: ${words.length}, time: ${finish - start}ms`);
    }
  }

  private onFinishTranslating(): void {
    this.isTranslating = false;
    this.updateSuggestions();
  }

  private updateSuggestions(): void {
    if (this.target.segment == null) {
      return;
    }

    // only bother updating the suggestion if the cursor is at the end of the segment
    if (!this.isTranslating && this.target.isSelectionAtSegmentEnd) {
      if (this.translationSession == null) {
        this.suggestionWords = [];
      } else {
        const range = this.skipInitialWhitespace(this.target.editor.getSelection());
        const text = this.target.editor.getText(
          this.target.segment.range.index,
          range.index - this.target.segment.range.index
        );

        const tokenRanges = this.targetWordTokenizer.tokenize(text);
        const prefix = tokenRanges.map(r => text.substring(r.start, r.end));
        const isLastWordComplete =
          this.insertSuggestionEnd !== -1 ||
          tokenRanges.length === 0 ||
          tokenRanges[tokenRanges.length - 1].end !== text.length;
        const results = this.translationSession.setPrefix(prefix, isLastWordComplete);
        if (results.length === 0) {
          this.suggestionWords = [];
        } else {
          const result = results[0];
          const suggestion = this.translationSuggester.getSuggestion(prefix.length, isLastWordComplete, result);
          this.suggestionWords = suggestion.targetWordIndices.map(j => result.targetSegment[j]);
          this.suggestionConfidence = suggestion.confidence;
          if (this.suggestionWords.length > 0 && !isEqual(this.lastShownSuggestionWords, this.suggestionWords)) {
            this.metricsSession.onSuggestionShown();
            this.lastShownSuggestionWords = this.suggestionWords;
          }
        }
      }
    }
    this.showSuggestion =
      (this.isTranslating || this.suggestionWords.length > 0) && this.target.isSelectionAtSegmentEnd;
  }

  private skipInitialWhitespace(range: RangeStatic): RangeStatic {
    let i: number;
    for (i = range.index; i < range.index + range.length; i++) {
      const ch = this.target.editor.getText(i, 1);
      if (ch === '' || !/\s/.test(ch)) {
        return { index: i, length: range.length - (i - range.index) };
      }
    }
    return { index: i, length: 0 };
  }

  private async trainSegment(segment: Segment): Promise<void> {
    if (this.translationSession == null || !this.canTrainSegment(segment)) {
      return;
    }

    await this.translationSession.approve(true);
    segment.acceptChanges();
    console.log(
      'Segment ' + segment.ref + ' of document ' + Canon.bookNumberToId(segment.bookNum) + ' was trained successfully.'
    );
  }

  private canTrainSegment(segment: Segment): boolean {
    return segment != null && segment.range.length > 0 && segment.text !== '' && segment.isChanged;
  }

  private loadProjectUserConfig() {
    if (this.projectUserConfigDoc.data.confidenceThreshold != null) {
      const pcnt = Math.round(this.projectUserConfigDoc.data.confidenceThreshold * 100);
      this.translationSuggester.confidenceThreshold = pcnt / 100;
      this.confidenceThreshold$.next(pcnt);
    }
    let chapter = 1;
    if (this.projectUserConfigDoc.data.selectedBookNum === this.text.bookNum) {
      if (this.projectUserConfigDoc.data.selectedChapterNum != null) {
        chapter = this.projectUserConfigDoc.data.selectedChapterNum;
      }
    }
    this._chapter = chapter;
    this.changeText();
  }

  private syncScroll(): void {
    if (!this.hasSource || this.source == null || this.source.segment == null || !this.target.hasFocus) {
      return;
    }

    const thisRange = this.target.segment.range;
    const thisBounds = this.target.editor.selection.getBounds(thisRange.index);

    const otherRange = this.source.segment.range;
    const otherBounds = this.source.editor.selection.getBounds(otherRange.index);
    this.source.editor.scrollingContainer.scrollTop += otherBounds.top - thisBounds.top;
  }

  private startUserOnboardingTour() {
    // HelpHero user-onboarding tour setup
    const isProjectAdmin: boolean =
      this.projectDoc.data.userRoles[this.userService.currentUserId] === SFProjectRole.ParatextAdministrator;

    this.helpHeroService.setProperty({
      isAdmin: isProjectAdmin
    });
  }
}
