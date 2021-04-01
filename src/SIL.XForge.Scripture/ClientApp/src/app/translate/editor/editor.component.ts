import { MdcDialog } from '@angular-mdc/web/dialog';
import { AfterViewInit, Component, ElementRef, Inject, OnDestroy, ViewChild } from '@angular/core';
import { MediaObserver } from '@angular/flex-layout';
import { ActivatedRoute } from '@angular/router';
import { translate } from '@ngneat/transloco';
import {
  createInteractiveTranslator,
  ErrorCorrectionModel,
  InteractiveTranslator,
  LatinWordTokenizer,
  MAX_SEGMENT_LENGTH,
  PhraseTranslationSuggester,
  RangeTokenizer,
  RemoteTranslationEngine,
  TranslationSuggester
} from '@sillsdev/machine';
import clone from 'lodash-es/clone';
import isEqual from 'lodash-es/isEqual';
import Quill, { DeltaStatic, RangeStatic } from 'quill';
import { Operation } from 'realtime-server/lib/common/models/project-rights';
import { User } from 'realtime-server/lib/common/models/user';
import { ParatextNote } from 'realtime-server/lib/scriptureforge/models/paratext-note';
import { ParatextNoteThread } from 'realtime-server/lib/scriptureforge/models/paratext-note-thread';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/scriptureforge/models/sf-project-rights';
import { TextType } from 'realtime-server/lib/scriptureforge/models/text-data';
import { TextInfo } from 'realtime-server/lib/scriptureforge/models/text-info';
import { TextInfoPermission } from 'realtime-server/lib/scriptureforge/models/text-info-permission';
import { toVerseRef } from 'realtime-server/lib/scriptureforge/models/verse-ref-data';
import { Canon } from 'realtime-server/lib/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/scriptureforge/scripture-utils/verse-ref';
import { BehaviorSubject, fromEvent, Subject, Subscription, timer } from 'rxjs';
import { debounceTime, delayWhen, filter, repeat, retryWhen, tap } from 'rxjs/operators';
import { CONSOLE, ConsoleInterface } from 'xforge-common/browser-globals';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { UserService } from 'xforge-common/user.service';
import XRegExp from 'xregexp';
import { environment } from '../../../environments/environment';
import { ParatextNoteThreadDoc } from '../../core/models/paratext-note-thread-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { Delta } from '../../core/models/text-doc';
import { TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TranslationEngineService } from '../../core/translation-engine.service';
import { Segment } from '../../shared/text/segment';
import { FeaturedVerseRefInfo, TextComponent } from '../../shared/text/text.component';
import { verseRefFromMouseEvent } from '../../shared/utils';
import {
  SuggestionsSettingsDialogComponent,
  SuggestionsSettingsDialogData
} from './suggestions-settings-dialog.component';
import { Suggestion } from './suggestions.component';
import { TranslateMetricsSession } from './translate-metrics-session';

export const UPDATE_SUGGESTIONS_TIMEOUT = 100;

const PUNCT_SPACE_REGEX = XRegExp('^(\\p{P}|\\p{S}|\\p{Cc}|\\p{Z})+$');

/** Scripture editing area. Used for Translate task. */
@Component({
  selector: 'app-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss']
})
export class EditorComponent extends DataLoadingComponent implements OnDestroy, AfterViewInit {
  suggestions: Suggestion[] = [];
  showSuggestions: boolean = false;
  chapters: number[] = [];
  metricsSession?: TranslateMetricsSession;
  trainingPercentage: number = 0;
  trainingMessage: string = '';
  showTrainingProgress: boolean = false;
  textHeight: string = '';

  @ViewChild('targetContainer') targetContainer?: ElementRef;
  @ViewChild('source') source?: TextComponent;
  @ViewChild('target') target?: TextComponent;

  private translationEngine?: RemoteTranslationEngine;
  private isTranslating: boolean = false;
  private readonly sourceWordTokenizer: RangeTokenizer;
  private readonly targetWordTokenizer: RangeTokenizer;
  private translator?: InteractiveTranslator;
  private readonly translationSuggester: TranslationSuggester = new PhraseTranslationSuggester();
  private readonly ecm = new ErrorCorrectionModel();
  private insertSuggestionEnd: number = -1;
  private currentUserDoc?: UserDoc;
  private projectDoc?: SFProjectDoc;
  private projectUserConfigDoc?: SFProjectUserConfigDoc;
  private projectUserConfigChangesSub?: Subscription;
  private text?: TextInfo;
  private sourceText?: TextInfo;
  private sourceProjectDoc?: SFProjectDoc;
  private sourceLoaded: boolean = false;
  private targetLoaded: boolean = false;
  private _chapter?: number;
  private lastShownSuggestions: Suggestion[] = [];
  private readonly segmentUpdated$: Subject<void>;
  private trainingSub?: Subscription;
  private projectDataChangesSub?: Subscription;
  private trainingProgressClosed: boolean = false;
  private trainingCompletedTimeout: any;
  private clickSubs: Subscription[] = [];
  private noteThreadQuery?: RealtimeQuery<ParatextNoteThreadDoc>;
  private toggleNoteThreadVerseRefs$: BehaviorSubject<void> = new BehaviorSubject<void>(undefined);
  private toggleNoteThreadSub?: Subscription;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    noticeService: NoticeService,
    private readonly dialog: MdcDialog,
    private readonly mediaObserver: MediaObserver,
    private readonly pwaService: PwaService,
    private readonly translationEngineService: TranslationEngineService,
    @Inject(CONSOLE) private readonly console: ConsoleInterface
  ) {
    super(noticeService);
    const wordTokenizer = new LatinWordTokenizer();
    this.sourceWordTokenizer = wordTokenizer;
    this.targetWordTokenizer = wordTokenizer;

    this.translationSuggester.confidenceThreshold = 0.2;

    this.segmentUpdated$ = new Subject<void>();
    this.subscribe(this.segmentUpdated$.pipe(debounceTime(UPDATE_SUGGESTIONS_TIMEOUT)), () => this.updateSuggestions());
  }

  get sourceLabel(): string {
    return this.projectDoc == null ||
      this.projectDoc.data == null ||
      this.projectDoc.data.translateConfig.source == null
      ? ''
      : this.projectDoc.data.translateConfig.source.shortName;
  }

  get targetLabel(): string {
    return this.projectDoc == null || this.projectDoc.data == null ? '' : this.projectDoc.data.shortName;
  }

  get isTargetTextRight(): boolean {
    return this.projectUserConfigDoc == null || this.projectUserConfigDoc.data == null
      ? true
      : this.projectUserConfigDoc.data.isTargetTextRight;
  }

  set isTargetTextRight(value: boolean) {
    if (this.projectUserConfigDoc != null && this.isTargetTextRight !== value) {
      this.projectUserConfigDoc.submitJson0Op(op => op.set(puc => puc.isTargetTextRight, value));
    }
  }

  get translationSuggestionsEnabled(): boolean {
    return this.hasSource && this.translationSuggestionsProjectEnabled && this.translationSuggestionsUserEnabled;
  }

  get translationSuggestionsUserEnabled(): boolean {
    return this.projectUserConfigDoc == null || this.projectUserConfigDoc.data == null
      ? true
      : this.projectUserConfigDoc.data.translationSuggestionsEnabled;
  }

  get translationSuggestionsProjectEnabled(): boolean {
    return (
      this.projectDoc != null &&
      this.projectDoc.data != null &&
      this.projectDoc.data.translateConfig.translationSuggestionsEnabled
    );
  }

  get numSuggestions(): number {
    return this.projectUserConfigDoc == null || this.projectUserConfigDoc.data == null
      ? 1
      : this.projectUserConfigDoc.data.numSuggestions;
  }

  get chapter(): number | undefined {
    return this._chapter;
  }

  set chapter(value: number | undefined) {
    if (this._chapter !== value) {
      this.showSuggestions = false;
      this.toggleNoteThreadVerses(false);
      this._chapter = value;
      this.changeText();
      this.toggleNoteThreadVerses(true);
    }
  }

  get bookNum(): number | undefined {
    return this.text == null ? undefined : this.text.bookNum;
  }

  get bookName(): string {
    return this.text == null ? '' : Canon.bookNumberToEnglishName(this.text.bookNum);
  }

  get currentUser(): User | undefined {
    return this.currentUserDoc == null ? undefined : this.currentUserDoc.data;
  }

  get showSource(): boolean {
    return this.hasSource && this.hasSourceViewRight;
  }

  get hasEditRight(): boolean {
    if (this.projectDoc == null || this.projectDoc.data == null) {
      return false;
    }

    const projectRole = this.projectDoc.data.userRoles[this.userService.currentUserId];
    if (SF_PROJECT_RIGHTS.hasRight(projectRole, { projectDomain: SFProjectDomain.Texts, operation: Operation.Edit })) {
      // Check for chapter rights
      const chapter = this.text?.chapters.find(c => c.number === this._chapter);
      // Even though permissions is guaranteed to be there in the model, its not in IndexedDB the first time the project
      // is accessed after migration
      if (chapter != null && chapter.permissions != null) {
        return chapter.permissions[this.userService.currentUserId] === TextInfoPermission.Write;
      }
    }

    return false;
  }

  get hasSourceViewRight(): boolean {
    if (this.sourceProjectDoc == null || this.sourceProjectDoc.data == null) {
      return false;
    }

    const projectRole = this.sourceProjectDoc.data.userRoles[this.userService.currentUserId];
    if (SF_PROJECT_RIGHTS.hasRight(projectRole, { projectDomain: SFProjectDomain.Texts, operation: Operation.View })) {
      // Check for chapter rights
      const chapter = this.sourceText?.chapters.find(c => c.number === this._chapter);
      // Even though permissions is guaranteed to be there in the model, its not in IndexedDB the first time the project
      // is accessed after migration
      if (chapter != null && chapter.permissions != null) {
        return chapter.permissions[this.userService.currentUserId] !== TextInfoPermission.None;
      }
    }

    return false;
  }

  get canEdit(): boolean {
    return this.isValid && this.hasEditRight;
  }

  get isSourceRightToLeft(): boolean {
    if (this.projectDoc?.data?.translateConfig?.source?.isRightToLeft != null) {
      return this.projectDoc.data.translateConfig?.source?.isRightToLeft;
    }
    return false;
  }

  get isTargetRightToLeft(): boolean {
    if (this.projectDoc?.data?.isRightToLeft != null) {
      return this.projectDoc.data.isRightToLeft;
    }
    return false;
  }

  get isValid(): boolean {
    if (this.text == null) {
      return true;
    }

    const chapter = this.text.chapters.find(c => c.number === this._chapter);
    return chapter != null && chapter.isValid;
  }

  private get hasSource(): boolean {
    const sourceId = this.projectDoc?.data?.translateConfig.source?.projectRef;
    if (!this.canEdit || this.text == null || this.currentUser === undefined || sourceId === undefined) {
      return false;
    } else {
      const projects = this.currentUser.sites[environment.siteId].projects;
      return this.text.hasSource && projects.includes(sourceId);
    }
  }

  private get chapterNoteThreadsVerseRefs(): FeaturedVerseRefInfo[] {
    if (this.noteThreadQuery == null || this.bookNum == null || this._chapter == null) {
      return [];
    }
    return this.noteThreadQuery.docs
      .filter(
        nt =>
          nt.data != null && nt.data.verseRef.bookNum === this.bookNum && nt.data.verseRef.chapterNum === this._chapter
      )
      .map(nt => this.configureNoteThread(nt.data!));
  }

  ngAfterViewInit(): void {
    this.subscribe(fromEvent(window, 'resize'), () => this.setTextHeight());
    this.subscribe(
      this.activatedRoute.params.pipe(filter(params => params['projectId'] != null && params['bookId'] != null)),
      async params => {
        this.showSuggestions = false;
        this.sourceLoaded = false;
        this.targetLoaded = false;
        this.loadingStarted();
        const projectId = params['projectId'] as string;
        const bookId = params['bookId'] as string;
        const bookNum = bookId != null ? Canon.bookIdToNumber(bookId) : 0;

        if (this.currentUserDoc === undefined) {
          this.currentUserDoc = await this.userService.getCurrentUser();
        }

        const prevProjectId = this.projectDoc == null ? '' : this.projectDoc.id;
        if (projectId !== prevProjectId) {
          this.projectDoc = await this.projectService.get(projectId);
          this.projectUserConfigDoc = await this.projectService.getUserConfig(
            projectId,
            this.userService.currentUserId
          );

          const sourceId = this.projectDoc?.data?.translateConfig.source?.projectRef;
          if (sourceId != null) {
            const userOnProject: boolean = !!this.currentUser?.sites[environment.siteId].projects.includes(sourceId);
            // Only get the project doc if the user is on the project to avoid an error.
            this.sourceProjectDoc = userOnProject ? await this.projectService.get(sourceId) : undefined;
            if (this.sourceProjectDoc != null && this.sourceProjectDoc.data != null) {
              this.sourceText = this.sourceProjectDoc.data.texts.find(t => t.bookNum === bookNum);
            }
          }

          if (this.projectUserConfigChangesSub != null) {
            this.projectUserConfigChangesSub.unsubscribe();
          }
          this.projectUserConfigChangesSub = this.projectUserConfigDoc.remoteChanges$.subscribe(() =>
            this.loadProjectUserConfig()
          );
        }
        if (this.projectDoc == null || this.projectDoc.data == null) {
          return;
        }
        await this.loadNoteThreadDocs(this.projectDoc.id);
        this.text = this.projectDoc.data.texts.find(t => t.bookNum === bookNum);
        this.chapters = this.text == null ? [] : this.text.chapters.map(c => c.number);

        this.loadProjectUserConfig();

        if (this.projectDoc.id !== prevProjectId) {
          this.setupTranslationEngine();
          if (this.projectDataChangesSub != null) {
            this.projectDataChangesSub.unsubscribe();
          }
          this.projectDataChangesSub = this.projectDoc.remoteChanges$.subscribe(() => {
            let sourceId: TextDocId | undefined;
            if (this.hasSource && this.text != null && this._chapter != null) {
              sourceId = new TextDocId(
                this.projectDoc!.data!.translateConfig.source!.projectRef,
                this.text.bookNum,
                this._chapter
              );
              if (!isEqual(this.source!.id, sourceId)) {
                this.sourceLoaded = false;
                this.loadingStarted();
              }
            }
            this.source!.id = sourceId;
            if (this.translationEngine == null || !this.translationSuggestionsProjectEnabled) {
              this.setupTranslationEngine();
            }
            setTimeout(() => this.setTextHeight());
          });

          if (this.metricsSession != null) {
            this.metricsSession.dispose();
          }
          if (this.target != null && this.source != null) {
            this.metricsSession = new TranslateMetricsSession(
              this.projectService,
              this.projectDoc.id,
              this.source,
              this.target,
              this.sourceWordTokenizer,
              this.targetWordTokenizer,
              this.pwaService
            );
          }
        }
      }
    );
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
    if (this.metricsSession != null) {
      this.metricsSession.dispose();
    }
  }

  closeTrainingProgress(): void {
    this.showTrainingProgress = false;
    this.trainingProgressClosed = true;
  }

  async onTargetUpdated(segment?: Segment, delta?: DeltaStatic, prevSegment?: Segment): Promise<void> {
    if (this.target == null || this.target.editor == null) {
      return;
    }

    if (segment !== prevSegment) {
      this.lastShownSuggestions = [];
      if (this.source != null) {
        this.source.setSegment(this.target.segmentRef);
        this.syncScroll();
      }

      this.insertSuggestionEnd = -1;
      this.onStartTranslating();
      try {
        if (
          this.projectUserConfigDoc?.data != null &&
          this.text != null &&
          this.target.segmentRef !== '' &&
          (this.projectUserConfigDoc.data.selectedBookNum !== this.text.bookNum ||
            this.projectUserConfigDoc.data.selectedChapterNum !== this._chapter ||
            this.projectUserConfigDoc.data.selectedSegment !== this.target.segmentRef)
        ) {
          const sourceProjectRef = this.projectDoc?.data?.translateConfig.source?.projectRef;
          if ((prevSegment == null || this.translator == null) && sourceProjectRef !== undefined) {
            await this.translationEngineService.trainSelectedSegment(this.projectUserConfigDoc.data, sourceProjectRef);
          } else {
            await this.trainSegment(prevSegment, sourceProjectRef);
          }
          await this.projectUserConfigDoc.submitJson0Op(op => {
            op.set<string>(puc => puc.selectedTask!, 'translate');
            op.set(puc => puc.selectedBookNum!, this.text!.bookNum);
            op.set(puc => puc.selectedChapterNum!, this._chapter);
            op.set(puc => puc.selectedSegment, this.target!.segmentRef);
            op.set(puc => puc.selectedSegmentChecksum!, this.target!.segmentChecksum);
          });
        }
        await this.translateSegment();
      } finally {
        this.onFinishTranslating();
      }
    } else {
      if (this.source != null && this.source.segmentRef !== this.target.segmentRef) {
        this.source.setSegment(this.target.segmentRef);
      }

      if (delta != null && delta.ops != null) {
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
    if (
      this.target != null &&
      this.target.segment != null &&
      this.target.segment.bookNum === this.bookNum &&
      this.target.segment.chapter === this._chapter
    ) {
      this.onStartTranslating();
      try {
        await this.translateSegment();
      } finally {
        this.onFinishTranslating();
      }
    }
  }

  onTextLoaded(textType: TextType): void {
    switch (textType) {
      case 'source':
        this.sourceLoaded = true;
        break;
      case 'target':
        this.targetLoaded = true;
        this.toggleNoteThreadVerseRefs$.next();
        break;
    }
    if ((!this.hasSource || this.sourceLoaded) && this.targetLoaded) {
      this.loadingFinished();
    }
  }

  insertSuggestion(suggestionIndex: number, wordIndex: number, event: Event): void {
    if (this.target == null || this.target.editor == null || suggestionIndex >= this.suggestions.length) {
      return;
    }

    const suggestion = this.suggestions[suggestionIndex];
    if (wordIndex >= suggestion.words.length) {
      return;
    }

    this.target.focus();
    let range = this.target.editor.getSelection();
    if (range == null) {
      return;
    }
    range = this.skipInitialWhitespace(this.target.editor, range);

    const delta = new Delta();
    delta.retain(range.index);
    if (range.length > 0) {
      delta.delete(range.length);
    }

    const words = wordIndex === -1 ? suggestion.words : suggestion.words.slice(0, wordIndex + 1);
    // TODO: use detokenizer to build suggestion text
    let insertText = words.join(' ');
    if (this.translator != null && !this.translator.isLastWordComplete) {
      const lastWord = this.translator.prefix[this.translator.prefix.length - 1];
      insertText = insertText.substring(lastWord.length);
    }
    if (this.insertSuggestionEnd !== -1) {
      insertText = ' ' + insertText;
    }
    delta.insert(insertText);
    this.showSuggestions = false;

    const selectIndex = range.index + insertText.length;
    this.insertSuggestionEnd = selectIndex;
    this.target.editor.updateContents(delta, 'user');
    this.target.editor.setSelection(selectIndex, 0, 'user');

    if (this.metricsSession != null) {
      this.metricsSession.onSuggestionAccepted(event);
    }
  }

  openSuggestionsSettings(): void {
    if (this.projectDoc == null || this.projectUserConfigDoc == null) {
      return;
    }

    const dialogRef = this.dialog.open<SuggestionsSettingsDialogComponent, SuggestionsSettingsDialogData>(
      SuggestionsSettingsDialogComponent,
      {
        clickOutsideToClose: true,
        escapeToClose: true,
        autoFocus: false,
        data: { projectUserConfigDoc: this.projectUserConfigDoc }
      }
    );
    dialogRef.afterClosed().subscribe(() => {
      if (this.projectUserConfigDoc != null && this.projectUserConfigDoc.data != null) {
        const pcnt = Math.round(this.projectUserConfigDoc.data.confidenceThreshold * 100);
        this.translationSuggester.confidenceThreshold = pcnt / 100;
      }
      this.updateSuggestions();
    });
  }

  private toggleNoteThreadVerses(value: boolean): void {
    if (this.target?.editor == null) {
      return;
    }
    const segments: string[] = this.target.toggleFeaturedVerseRefs(
      value,
      this.chapterNoteThreadsVerseRefs,
      'translate'
    );
    if (value) {
      this.subscribeClickEvents(segments);
    } else {
      // Un-subscribe from all segment click events as these all get setup again
      for (const event of this.clickSubs) {
        event.unsubscribe();
      }
    }
  }

  private showNoteThread(verseRef: VerseRef): void {
    // Show the Paratext note thread
  }

  private setupTranslationEngine(): void {
    if (this.trainingSub != null) {
      this.trainingSub.unsubscribe();
      this.trainingSub = undefined;
    }
    this.translator = undefined;
    this.translationEngine = undefined;
    if (this.projectDoc == null || !this.translationSuggestionsProjectEnabled || !this.hasEditRight) {
      return;
    }

    this.translationEngine = this.translationEngineService.createTranslationEngine(this.projectDoc.id);
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
              this.noticeService.show(translate('editor.training_completed_successfully'));
              this.trainingProgressClosed = false;
            } else {
              this.trainingMessage = translate('editor.completed_successfully');
              this.trainingCompletedTimeout = setTimeout(() => {
                this.showTrainingProgress = false;
                this.trainingCompletedTimeout = undefined;
              }, 5000);
            }

            // ensure that any changes to the segment will be trained
            if (this.target != null && this.target.segment != null) {
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
        // ToDo: internationalize message
        this.trainingMessage = progress.message;
      });
  }

  private setTextHeight(): void {
    if (this.target == null || this.targetContainer == null) {
      return;
    }
    // this is a horrible hack to set the height of the text components
    // we don't want to use flexbox because it makes editing very slow
    const elem: HTMLElement = this.targetContainer.nativeElement;
    const bounds = elem.getBoundingClientRect();
    // add bottom padding
    const top = bounds.top + (this.mediaObserver.isActive('xs') ? 0 : 14);
    if (this.target.editor != null && this.target.hasFocus) {
      // reset scroll position
      this.target.editor.scrollingContainer.scrollTop = 0;
    }
    this.textHeight = `calc(100vh - ${top}px)`;
    if (this.target.hasFocus) {
      setTimeout(() => {
        // reset focus, which causes Quill to scroll to the selection
        this.target!.blur();
        this.target!.focus();
      });
    }
  }

  private changeText(): void {
    if (this.projectDoc == null || this.text == null || this._chapter == null) {
      this.source!.id = undefined;
      this.target!.id = undefined;
      return;
    }
    if (this.target == null) {
      return;
    }
    let selectedSegment: string | undefined;
    let selectedSegmentChecksum: number | undefined;
    if (
      this.projectUserConfigDoc != null &&
      this.projectUserConfigDoc.data != null &&
      this.text != null &&
      this.projectUserConfigDoc.data.selectedBookNum === this.text.bookNum &&
      this.projectUserConfigDoc.data.selectedChapterNum === this._chapter &&
      this.projectUserConfigDoc.data.selectedSegment !== ''
    ) {
      selectedSegment = this.projectUserConfigDoc.data.selectedSegment;
      selectedSegmentChecksum = this.projectUserConfigDoc.data.selectedSegmentChecksum;
    }
    if (this.source != null) {
      this.source.id = this.hasSource
        ? new TextDocId(this.projectDoc.data!.translateConfig.source!.projectRef, this.text.bookNum, this._chapter)
        : undefined;
    }
    const targetId = new TextDocId(this.projectDoc.id, this.text.bookNum, this._chapter, 'target');
    if (!isEqual(targetId, this.target.id)) {
      // blur the target before switching so that scrolling is reset to the top
      this.target.blur();
    }
    this.target.id = targetId;
    if (selectedSegment != null) {
      const segmentChanged = this.target.setSegment(selectedSegment, selectedSegmentChecksum, true);
      if (!segmentChanged && selectedSegmentChecksum == null && this.target.segment != null) {
        // the segment checksum was unset on the server, so accept the current segment changes
        this.target.segment.acceptChanges();
      }
    }
    setTimeout(() => this.setTextHeight());
  }

  private onStartTranslating(): void {
    this.isTranslating = true;
    this.suggestions = [];
    this.showSuggestions = this.target != null && this.target.isSelectionAtSegmentEnd;
  }

  private async translateSegment(): Promise<void> {
    this.translator = undefined;
    if (this.translationEngine == null || this.source == null || !this.pwaService.isOnline) {
      return;
    }
    const sourceSegment = this.source.segmentText;
    const words = this.sourceWordTokenizer.tokenize(sourceSegment);
    if (words.length === 0) {
      return;
    } else if (words.length > MAX_SEGMENT_LENGTH) {
      this.translator = undefined;
      this.noticeService.show(translate('editor.verse_too_long_for_suggestions'));
      return;
    }

    const start = performance.now();
    const translator = await createInteractiveTranslator(this.ecm, this.translationEngine, words);
    if (sourceSegment === this.source.segmentText) {
      this.translator = translator;
      const finish = performance.now();
      this.console.log(`Translated segment, length: ${words.length}, time: ${finish - start}ms`);
    }
  }

  private onFinishTranslating(): void {
    this.isTranslating = false;
    this.updateSuggestions();
  }

  private updateSuggestions(): void {
    if (this.target == null || this.target.editor == null || this.target.segment == null) {
      return;
    }

    // only bother updating the suggestion if the cursor is at the end of the segment
    if (!this.isTranslating && this.target.isSelectionAtSegmentEnd) {
      if (this.translator == null) {
        this.suggestions = [];
      } else {
        const range = this.skipInitialWhitespace(this.target.editor, this.target.editor.getSelection()!);
        const text = this.target.editor.getText(
          this.target.segment.range.index,
          range.index - this.target.segment.range.index
        );

        const tokenRanges = this.targetWordTokenizer.tokenizeAsRanges(text);
        const prefix = tokenRanges.map(r => text.substring(r.start, r.end));
        const isLastWordComplete =
          this.insertSuggestionEnd !== -1 ||
          tokenRanges.length === 0 ||
          tokenRanges[tokenRanges.length - 1].end !== text.length;
        this.translator.setPrefix(prefix, isLastWordComplete);
        const machineSuggestions = this.translationSuggester.getSuggestions(
          this.numSuggestions,
          prefix.length,
          isLastWordComplete,
          this.translator.getCurrentResults()
        );
        if (machineSuggestions.length === 0) {
          this.suggestions = [];
        } else {
          const suggestions: Suggestion[] = [];
          let confidence = 1;
          for (const machineSuggestion of machineSuggestions) {
            const words = machineSuggestion.targetWords;
            // for display purposes, we ensure that the confidence is less than or equal to "better" suggestions
            confidence = Math.min(confidence, machineSuggestion.confidence);
            suggestions.push({ words, confidence });
          }
          this.suggestions = suggestions;
          if (this.suggestions.length > 0 && !isEqual(this.lastShownSuggestions, this.suggestions)) {
            if (this.metricsSession != null) {
              this.metricsSession.onSuggestionShown();
            }
            this.lastShownSuggestions = this.suggestions;
          }
        }
      }
    }
    this.showSuggestions = (this.isTranslating || this.suggestions.length > 0) && this.target.isSelectionAtSegmentEnd;
  }

  private skipInitialWhitespace(editor: Quill, range: RangeStatic): RangeStatic {
    let i: number;
    for (i = range.index; i < range.index + range.length; i++) {
      const ch = editor.getText(i, 1);
      if (ch === '' || !/\s/.test(ch)) {
        return { index: i, length: range.length - (i - range.index) };
      }
    }
    return { index: i, length: 0 };
  }

  private async trainSegment(segment: Segment | undefined, sourceProjectRef: string | undefined): Promise<void> {
    if (segment == null || !this.canTrainSegment(segment)) {
      return;
    }
    if (
      !this.pwaService.isOnline &&
      sourceProjectRef != null &&
      this.projectUserConfigDoc?.data != null &&
      this.projectUserConfigDoc.data.selectedBookNum != null &&
      this.projectUserConfigDoc.data.selectedChapterNum != null
    ) {
      this.translationEngineService.storeTrainingSegment(
        this.projectUserConfigDoc.data.projectRef,
        sourceProjectRef,
        this.projectUserConfigDoc.data.selectedBookNum,
        this.projectUserConfigDoc.data.selectedChapterNum,
        this.projectUserConfigDoc.data.selectedSegment
      );
      return;
    }

    if (this.translator == null) {
      return;
    }
    await this.translator.approve(true);
    segment.acceptChanges();
    this.console.log(
      'Segment ' + segment.ref + ' of document ' + Canon.bookNumberToId(segment.bookNum) + ' was trained successfully.'
    );
  }

  private canTrainSegment(segment: Segment): boolean {
    return segment.range.length > 0 && segment.text !== '' && segment.isChanged;
  }

  private subscribeClickEvents(segments: string[]): void {
    if (this.target == null) {
      return;
    }
    for (const segment of segments) {
      const element = this.target.getSegmentElement(segment)?.querySelector('display-note');
      if (element == null) {
        continue;
      }
      this.clickSubs.push(
        this.subscribe(fromEvent<MouseEvent>(element, 'click'), event => {
          if (this.bookNum == null) {
            return;
          }
          const verseRef = verseRefFromMouseEvent(event, this.bookNum);
          if (verseRef != null) {
            this.showNoteThread(verseRef);
          }
        })
      );
    }
  }

  private async loadNoteThreadDocs(projectId: string): Promise<void> {
    this.noteThreadQuery = await this.projectService.queryNoteThreads(projectId);
    this.toggleNoteThreadSub?.unsubscribe();
    this.toggleNoteThreadSub = this.subscribe(this.toggleNoteThreadVerseRefs$, () => this.toggleNoteThreadVerses(true));
  }

  private loadProjectUserConfig() {
    let chapter = 1;
    if (this.projectUserConfigDoc != null && this.projectUserConfigDoc.data != null) {
      const pcnt = Math.round(this.projectUserConfigDoc.data.confidenceThreshold * 100);
      this.translationSuggester.confidenceThreshold = pcnt / 100;
      if (this.text != null && this.projectUserConfigDoc.data.selectedBookNum === this.text.bookNum) {
        if (this.projectUserConfigDoc.data.selectedChapterNum != null) {
          chapter = this.projectUserConfigDoc.data.selectedChapterNum;
        }
      }
    }
    this.toggleNoteThreadVerses(false);
    this._chapter = chapter;
    this.changeText();
    this.toggleNoteThreadVerses(true);
  }

  private configureNoteThread(thread: ParatextNoteThread): FeaturedVerseRefInfo {
    const notes: ParatextNote[] = clone(thread.notes).sort(
      (a, b) => Date.parse(a.dateCreated) - Date.parse(b.dateCreated)
    );
    let preview: string = notes[0].content;
    if (notes.length > 1) {
      preview += translate('editor.more_notes', { count: notes.length - 1 });
    }
    const iconDefinedNotes = notes.filter(n => n.tagIcon != null);
    return {
      verseRef: toVerseRef(thread.verseRef),
      preview,
      iconName: iconDefinedNotes.length === 0 ? thread.tagIcon : iconDefinedNotes[iconDefinedNotes.length - 1].tagIcon,
      startPos: notes[0].startPosition
    };
  }

  private syncScroll(): void {
    if (
      !this.hasSource ||
      this.source == null ||
      this.source.segment == null ||
      this.source.editor == null ||
      this.target == null ||
      this.target.segment == null ||
      this.target.editor == null ||
      !this.target.hasFocus
    ) {
      return;
    }

    const thisRange = this.target.segment.range;
    const thisBounds = this.target.editor.selection.getBounds(thisRange.index);

    const otherRange = this.source.segment.range;
    const otherBounds = this.source.editor.selection.getBounds(otherRange.index);
    this.source.editor.scrollingContainer.scrollTop += otherBounds.top - thisBounds.top;
  }
}
