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
import isEqual from 'lodash-es/isEqual';
import Quill, { DeltaStatic, RangeStatic } from 'quill';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { User } from 'realtime-server/lib/esm/common/models/user';
import { Note } from 'realtime-server/lib/esm/scriptureforge/models/note';
import { ParatextUserProfile } from 'realtime-server/lib/esm/scriptureforge/models/paratext-user-profile';
import { SFProjectDomain, SF_PROJECT_RIGHTS } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { TextAnchor } from 'realtime-server/lib/esm/scriptureforge/models/text-anchor';
import { TextType } from 'realtime-server/lib/esm/scriptureforge/models/text-data';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { TextInfoPermission } from 'realtime-server/lib/esm/scriptureforge/models/text-info-permission';
import { Canon } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/canon';
import { VerseRef } from 'realtime-server/lib/esm/scriptureforge/scripture-utils/verse-ref';
import { DeltaOperation } from 'rich-text';
import { BehaviorSubject, fromEvent, Subject, Subscription, timer } from 'rxjs';
import { debounceTime, delayWhen, filter, repeat, retryWhen, tap } from 'rxjs/operators';
import { CONSOLE, ConsoleInterface } from 'xforge-common/browser-globals';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { UserDoc } from 'xforge-common/models/user-doc';
import { NoticeService } from 'xforge-common/notice.service';
import { PwaService } from 'xforge-common/pwa.service';
import { UserService } from 'xforge-common/user.service';
import { getLinkHTML, issuesEmailTemplate, objectId } from 'xforge-common/utils';
import { DialogService } from 'xforge-common/dialog.service';
import { I18nService } from 'xforge-common/i18n.service';
import { NoteStatus, NoteThread } from 'realtime-server/lib/esm/scriptureforge/models/note-thread';
import { FeatureFlagService } from 'xforge-common/feature-flags/feature-flag.service';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { environment } from '../../../environments/environment';
import { NoteThreadDoc } from '../../core/models/note-thread-doc';
import { SFProjectDoc } from '../../core/models/sf-project-doc';
import { SF_DEFAULT_TRANSLATE_SHARE_ROLE } from '../../core/models/sf-project-role-info';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { Delta } from '../../core/models/text-doc';
import { TextDocId } from '../../core/models/text-doc';
import { SFProjectService } from '../../core/sf-project.service';
import { TranslationEngineService } from '../../core/translation-engine.service';
import { Segment } from '../../shared/text/segment';
import {
  EmbedsByVerse,
  FeaturedVerseRefInfo,
  PresenceData,
  RemotePresences,
  TextComponent
} from '../../shared/text/text.component';
import { formatFontSizeToRems, getVerseRefFromSegmentRef, threadIdFromMouseEvent } from '../../shared/utils';
import { MultiCursorViewer } from './multi-viewer/multi-viewer.component';
import { NoteDialogComponent, NoteDialogData, NoteDialogResult } from './note-dialog/note-dialog.component';
import {
  SuggestionsSettingsDialogComponent,
  SuggestionsSettingsDialogData
} from './suggestions-settings-dialog.component';
import { Suggestion } from './suggestions.component';
import { TranslateMetricsSession } from './translate-metrics-session';

export const UPDATE_SUGGESTIONS_TIMEOUT = 100;
export const SF_NOTE_THREAD_PREFIX = 'SFNOTETHREAD_';

const PUNCT_SPACE_REGEX = /^(?:\p{P}|\p{S}|\p{Cc}|\p{Z})+$/u;

/** Scripture editing area. Used for Translate task.
 * ```
 * ┌─────────────────────────────────────┐
 * │           editor.component          │
 * │                                     │
 * │  ┌──────────────┐  ┌──────────────┐ │
 * │  │   source     │  │    target    │ │
 * │  │text.component│  │text.component│ │
 * │  └──────────────┘  └──────────────┘ │
 * │                                     │
 * └─────────────────────────────────────┘
 * ```
 */
@Component({
  selector: 'app-editor',
  templateUrl: './editor.component.html',
  styleUrls: ['./editor.component.scss']
})
export class EditorComponent extends DataLoadingComponent implements OnDestroy, AfterViewInit {
  suggestions: Suggestion[] = [];
  showSuggestions: boolean = false;
  chapters: number[] = [];
  isProjectAdmin: boolean = false;
  metricsSession?: TranslateMetricsSession;
  trainingPercentage: number = 0;
  trainingMessage: string = '';
  showTrainingProgress: boolean = false;
  textHeight: string = '';
  multiCursorViewers: MultiCursorViewer[] = [];

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
  private projectDoc?: SFProjectProfileDoc;
  private projectUserConfigDoc?: SFProjectUserConfigDoc;
  private paratextUsers: ParatextUserProfile[] = [];
  private projectUserConfigChangesSub?: Subscription;
  private text?: TextInfo;
  private sourceText?: TextInfo;
  private sourceProjectDoc?: SFProjectProfileDoc;
  private sourceLoaded: boolean = false;
  private targetLoaded: boolean = false;
  private _targetFocused: boolean = false;
  private _chapter?: number;
  private lastShownSuggestions: Suggestion[] = [];
  private readonly segmentUpdated$: Subject<void>;
  private trainingSub?: Subscription;
  private projectDataChangesSub?: Subscription;
  private trainingProgressClosed: boolean = false;
  private trainingCompletedTimeout: any;
  private clickSubs: Map<string, Subscription[]> = new Map<string, Subscription[]>();
  private noteThreadQuery?: RealtimeQuery<NoteThreadDoc>;
  private toggleNoteThreadVerseRefs$: BehaviorSubject<void> = new BehaviorSubject<void>(undefined);
  private toggleNoteThreadSub?: Subscription;
  private shouldNoteThreadsRespondToEdits: boolean = false;

  constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly userService: UserService,
    private readonly projectService: SFProjectService,
    noticeService: NoticeService,
    private readonly dialogService: DialogService,
    private readonly mediaObserver: MediaObserver,
    private readonly pwaService: PwaService,
    private readonly translationEngineService: TranslationEngineService,
    private readonly i18n: I18nService,
    private readonly featureFlags: FeatureFlagService,
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

  get targetFocused(): boolean {
    return this._targetFocused;
  }

  set targetFocused(focused: boolean) {
    focused = this.dialogService.openDialogCount > 0 ? true : focused;
    this._targetFocused = focused;
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

  get defaultShareRole(): SFProjectRole {
    return SF_DEFAULT_TRANSLATE_SHARE_ROLE;
  }

  get showSource(): boolean {
    return this.hasSource && this.hasSourceViewRight;
  }

  get hasEditRight(): boolean {
    return this.userHasGeneralEditRight && this.hasChapterEditPermission;
  }

  /**
   * Determines whether the user has the right to edit texts generally, without considering permissions on this chapter.
   */
  get userHasGeneralEditRight(): boolean {
    const project = this.projectDoc?.data;
    if (project == null) {
      return false;
    }
    return SF_PROJECT_RIGHTS.hasRight(project, this.userService.currentUserId, SFProjectDomain.Texts, Operation.Edit);
  }

  /**
   * Determines whether the user has permission to edit the currently active chapter.
   */
  get hasChapterEditPermission(): boolean {
    const chapter = this.text?.chapters.find(c => c.number === this._chapter);
    // Even though permissions is guaranteed to be there in the model, its not in IndexedDB the first time the project
    // is accessed after migration
    return chapter?.permissions?.[this.userService.currentUserId] === TextInfoPermission.Write;
  }

  get userRole(): string {
    return this.i18n.localizeRole(this.projectDoc?.data?.userRoles[this.userService.currentUserId] || '');
  }

  get hasSourceViewRight(): boolean {
    const sourceProject = this.sourceProjectDoc?.data;
    if (sourceProject == null) {
      return false;
    }

    if (
      SF_PROJECT_RIGHTS.hasRight(sourceProject, this.userService.currentUserId, SFProjectDomain.Texts, Operation.View)
    ) {
      // Check for chapter rights
      const chapter = this.sourceText?.chapters.find(c => c.number === this._chapter);
      // Even though permissions is guaranteed to be there in the model, its not in IndexedDB the first time the project
      // is accessed after migration
      if (chapter != null && chapter.permissions != null) {
        const chapterPermission: string = chapter.permissions[this.userService.currentUserId];
        return chapterPermission === TextInfoPermission.Write || chapterPermission === TextInfoPermission.Read;
      }
    }

    return false;
  }

  get canEdit(): boolean {
    return (
      this.isUsfmValid &&
      this.hasEditRight &&
      this.dataInSync &&
      !this.target?.areOpsCorrupted &&
      !this.projectTextNotEditable
    );
  }

  get canShare(): boolean {
    return this.isProjectAdmin || this.projectDoc?.data?.translateConfig.shareEnabled === true;
  }

  get fontSize(): string | undefined {
    return formatFontSizeToRems(this.projectDoc?.data?.defaultFontSize);
  }

  get sourceFontSize(): string | undefined {
    return formatFontSizeToRems(this.sourceProjectDoc?.data?.defaultFontSize);
  }

  get projectTextNotEditable(): boolean {
    return this.projectDoc?.data?.editable === false;
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

  get isUsfmValid(): boolean {
    if (this.text == null) {
      return true;
    }

    const chapter = this.text.chapters.find(c => c.number === this._chapter);
    return chapter != null && chapter.isValid;
  }

  get dataInSync(): boolean {
    return this.projectDoc?.data?.sync?.dataInSync !== false;
  }

  get issueEmailLink(): string {
    return getLinkHTML(environment.issueEmail, issuesEmailTemplate());
  }

  get showMultiViewers(): boolean {
    return this.pwaService.isOnline && this.multiCursorViewers.length > 0;
  }

  get canInsertNote(): boolean {
    return this.featureFlags.allowAddingNotes.enabled;
  }

  private get hasSource(): boolean {
    const sourceId = this.projectDoc?.data?.translateConfig.source?.projectRef;
    if (this.text == null || this.currentUser === undefined || sourceId === undefined) {
      return false;
    } else {
      const projects = this.currentUser.sites[environment.siteId].projects;
      return this.text.hasSource && projects.includes(sourceId);
    }
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
          this.projectDoc = await this.projectService.getProfile(projectId);
          const userRole: string | undefined = this.projectDoc.data?.userRoles[this.userService.currentUserId];
          if (userRole != null) {
            const projectDoc: SFProjectDoc | undefined = await this.projectService.tryGetForRole(projectId, userRole);
            if (projectDoc?.data?.paratextUsers != null) {
              this.paratextUsers = projectDoc.data.paratextUsers;
            }
          }
          this.isProjectAdmin = await this.projectService.isProjectAdmin(projectId, this.userService.currentUserId);
          this.projectUserConfigDoc = await this.projectService.getUserConfig(
            projectId,
            this.userService.currentUserId
          );

          const sourceId = this.projectDoc?.data?.translateConfig.source?.projectRef;
          if (sourceId != null) {
            const userOnProject: boolean = !!this.currentUser?.sites[environment.siteId].projects.includes(sourceId);
            // Only get the project doc if the user is on the project to avoid an error.
            this.sourceProjectDoc = userOnProject ? await this.projectService.getProfile(sourceId) : undefined;
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
            if (this.translationEngine == null || !this.translationSuggestionsProjectEnabled || !this.hasEditRight) {
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

  async onTargetUpdated(
    segment?: Segment,
    delta?: DeltaStatic,
    prevSegment?: Segment,
    preDeltaAffectedEmbeds?: EmbedsByVerse[],
    isLocalUpdate?: boolean
  ): Promise<void> {
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
        if (
          segment != null &&
          preDeltaAffectedEmbeds != null &&
          this.shouldNoteThreadsRespondToEdits &&
          !!isLocalUpdate
        ) {
          // only update the note anchors if the update is local, otherwise remote edits will mess up the note anchors
          await this.updateVerseNoteThreadAnchors(preDeltaAffectedEmbeds, delta);
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

    if (delta != null && this.shouldNoteThreadsRespondToEdits) {
      // wait 20 ms so that note thread docs have time to receive the updated note positions
      setTimeout(() => {
        this.toggleNoteThreadVerses(true);
        if (segment != null) {
          this.subscribeClickEvents([segment.ref]);
        }
      }, 20);
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
        this.shouldNoteThreadsRespondToEdits = true;
        break;
    }
    if ((!this.hasSource || this.sourceLoaded) && this.targetLoaded) {
      this.loadingFinished();
    }
  }

  onPresenceChange(remotePresences?: RemotePresences): void {
    if (remotePresences != null) {
      const uniquePresences: PresenceData[] = Object.values(remotePresences).filter(
        (a, index, self) =>
          index ===
          self.findIndex(
            b => b.viewer.displayName === a.viewer.displayName && b.viewer.avatarUrl === a.viewer.avatarUrl
          )
      );
      const multiCursorViewers: MultiCursorViewer[] = [];
      const currentUser: User | undefined = this.currentUserDoc?.data;
      for (const presence of uniquePresences) {
        const viewer: MultiCursorViewer = presence.viewer;
        if (viewer.displayName !== currentUser?.displayName && viewer.avatarUrl !== currentUser?.avatarUrl) {
          multiCursorViewers.push(viewer);
        }
      }
      this.multiCursorViewers = multiCursorViewers;
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
    const previousContents = this.target.editor.getContents();
    this.target.editor.updateContents(delta, 'user');
    const updatedContents = this.target.editor.getContents();
    this.target.editor.setSelection(selectIndex, 0, 'user');

    if (this.metricsSession != null && !isEqual(updatedContents.ops, previousContents.ops)) {
      this.metricsSession.onSuggestionAccepted(event);
    }
  }

  openSuggestionsSettings(): void {
    if (this.projectDoc == null || this.projectUserConfigDoc == null) {
      return;
    }

    const dialogRef = this.dialogService.openMatDialog<
      SuggestionsSettingsDialogComponent,
      SuggestionsSettingsDialogData
    >(SuggestionsSettingsDialogComponent, {
      autoFocus: false,
      data: { projectUserConfigDoc: this.projectUserConfigDoc }
    });
    dialogRef.afterClosed().subscribe(() => {
      if (this.projectUserConfigDoc != null && this.projectUserConfigDoc.data != null) {
        const pcnt = Math.round(this.projectUserConfigDoc.data.confidenceThreshold * 100);
        this.translationSuggester.confidenceThreshold = pcnt / 100;
      }
      this.updateSuggestions();
    });
  }

  insertNote(): void {
    if (this.target == null) {
      return;
    }
    const segmentRef: string | undefined = this.target.currentSegmentOrDefault;
    if (segmentRef != null && this.bookNum != null) {
      const verseRef: VerseRef | undefined = getVerseRefFromSegmentRef(this.bookNum, segmentRef);
      this.showNoteThread(undefined, verseRef);
    }
  }

  removeEmbeddedElements(): void {
    this.shouldNoteThreadsRespondToEdits = false;
    this.target?.removeEmbeddedElements();
    // Un-subscribe from all segment click events as these all get setup again
    for (const segmentEvents of this.clickSubs.values()) {
      for (const event of segmentEvents) {
        event.unsubscribe();
      }
    }
  }

  /** Insert or remove note thread embeds into the quill editor. */
  private toggleNoteThreadVerses(toggleOn: boolean): void {
    if (this.target?.editor == null || this.noteThreadQuery == null || this.bookNum == null || this._chapter == null) {
      return;
    }
    if (!toggleOn) {
      this.removeEmbeddedElements();
      return;
    }

    const chapterNoteThreadDocs: NoteThreadDoc[] = this.currentChapterNoteThreadDocs();
    const noteThreadVerseRefs: Set<VerseRef> = new Set<VerseRef>();
    for (const noteThreadDoc of chapterNoteThreadDocs) {
      const featured: FeaturedVerseRefInfo | undefined = this.getFeaturedVerseRefInfo(noteThreadDoc);
      if (featured != null && !this.target.embeddedElements.has(featured.id)) {
        this.embedNoteThread(featured);
        noteThreadVerseRefs.add(featured.verseRef);
      }
    }

    // add the formatting to mark featured verses after notes are embedded
    const segments: string[] = this.target.toggleFeaturedVerseRefs(
      toggleOn,
      Array.from(noteThreadVerseRefs.values()),
      'note-thread'
    );
    this.subscribeClickEvents(segments);
  }

  private async showNoteThread(threadId?: string, verseRef?: VerseRef): Promise<void> {
    if (this.bookNum == null || this.chapter == null) {
      return;
    }
    if (threadId == null && verseRef == null) {
      // at least one must be defined
      return;
    }
    const noteDialogData: NoteDialogData = {
      projectId: this.projectDoc!.id,
      threadId,
      textDocId: new TextDocId(this.projectDoc!.id, this.bookNum, this.chapter),
      verseRef
    };
    const dialogRef = this.dialogService.openMatDialog<NoteDialogComponent, NoteDialogData, NoteDialogResult>(
      NoteDialogComponent,
      {
        autoFocus: false,
        width: '600px',
        disableClose: true,
        data: noteDialogData
      }
    );
    const result: NoteDialogResult | undefined = await dialogRef.afterClosed().toPromise();
    if (result != null) {
      await this.handleNoteDialogResult(result);
      this.toggleNoteThreadVerses(true);
    }
    // Ensure cursor selection remains at the position of the note in case the focus was lost when the dialog was open
    const currentSegment: string | undefined = this.target!.currentSegmentOrDefault;
    if (currentSegment != null) {
      const selectIndex = this.target!.getSegmentRange(currentSegment)!.index;
      this.target!.editor!.setSelection(selectIndex, 0, 'silent');
    }
  }

  private updateReadNotes(threadId: string) {
    const noteThread: NoteThreadDoc | undefined = this.noteThreadQuery?.docs.find(d => d.data?.dataId === threadId);
    if (noteThread?.data != null && this.projectUserConfigDoc?.data != null) {
      const notesRead: string[] = [];
      for (const note of noteThread.data.notes) {
        if (!this.projectUserConfigDoc.data.noteRefsRead.includes(note.dataId)) {
          notesRead.push(note.dataId);
        }
      }

      if (notesRead.length === 0) {
        return;
      }
      this.projectUserConfigDoc.submitJson0Op(op => {
        for (const noteId of notesRead) {
          op.add(puc => puc.noteRefsRead, noteId);
        }
      });
    }
  }

  private async handleNoteDialogResult(result: NoteDialogResult): Promise<void> {
    const projectId: string = this.projectDoc!.id;
    const threadId: string = SF_NOTE_THREAD_PREFIX + objectId();
    result.note.threadId = threadId;
    const noteThread: NoteThread = {
      dataId: threadId,
      verseRef: result.verseRef,
      projectRef: projectId,
      ownerRef: this.userService.currentUserId,
      notes: [result.note],
      position: result.position,
      originalContextBefore: '',
      originalSelectedText: result.selectedText,
      originalContextAfter: '',
      tagIcon: '01flag1',
      status: NoteStatus.Todo
    };
    await this.projectService.createNoteThread(projectId, noteThread);
  }

  private setupTranslationEngine(): void {
    if (this.trainingSub != null) {
      this.trainingSub.unsubscribe();
      this.trainingSub = undefined;
    }
    this.translator = undefined;
    this.translationEngine = undefined;
    if (this.projectDoc?.data == null) {
      return;
    }
    const hasSourceBooks: boolean = this.translationEngineService.checkHasSourceBooks(this.projectDoc.data);
    if (!this.translationSuggestionsProjectEnabled || !this.hasEditRight || !hasSourceBooks) {
      return;
    }

    this.translationEngine = this.translationEngineService.createTranslationEngine(this.projectDoc.id);
    this.trainingSub = this.translationEngine
      .listenForTrainingStatus()
      .pipe(
        tap({
          error: () => {
            // error while listening
            this.showTrainingProgress = false;
            this.trainingCompletedTimeout = undefined;
            this.trainingProgressClosed = false;
          },
          complete: async () => {
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
        }),
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
    if (this.target.editor != null && this.targetFocused) {
      // reset scroll position
      this.target.editor.scrollingContainer.scrollTop = 0;
    }
    this.textHeight = `calc(100vh - ${top}px)`;
    if (this.targetFocused) {
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
      const elements = this.target.getSegmentElement(segment)?.querySelectorAll('display-note');
      if (elements == null) {
        continue;
      }
      this.clickSubs.get(segment)?.forEach(s => s.unsubscribe());
      this.clickSubs.set(
        segment,
        Array.from(elements).map((element: Element) =>
          this.subscribe(fromEvent<MouseEvent>(element, 'click'), event => {
            if (this.bookNum == null) {
              return;
            }
            const threadId = threadIdFromMouseEvent(event);
            if (threadId != null) {
              this.showNoteThread(threadId);
              this.target?.formatEmbed(threadId, 'note-thread-embed', { ['highlight']: false });
              this.updateReadNotes(threadId);
            }
          })
        )
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

  /** Gets the information needed to format a particular featured verse. */
  private getFeaturedVerseRefInfo(threadDoc: NoteThreadDoc): FeaturedVerseRefInfo | undefined {
    const notes: Note[] = threadDoc.notesInOrderClone(threadDoc.data!.notes);
    let preview: string = notes[0].content != null ? this.stripXml(notes[0].content.trim()) : '';
    if (notes.length > 1) {
      preview += '\n' + translate('editor.more_notes', { count: notes.length - 1 });
    }
    const verseRef: VerseRef | undefined = threadDoc.currentVerseRef();
    if (threadDoc.data == null || verseRef == null) {
      return;
    }
    const hasNewContent: boolean = this.hasNewContent(threadDoc);

    return {
      verseRef,
      id: threadDoc.data.dataId,
      preview,
      icon: threadDoc.isAssignedToOtherUser(this.userService.currentUserId, this.paratextUsers)
        ? threadDoc.iconGrayed
        : threadDoc.icon,
      textAnchor: threadDoc.data.position,
      highlight: hasNewContent
    };
  }

  private stripXml(xmlContent: string): string {
    return xmlContent.replace(/<[^>]+>/g, '');
  }

  /** Update the text anchors for the note threads in the current segment. */
  private async updateVerseNoteThreadAnchors(affectedEmbeds: EmbedsByVerse[], delta: DeltaStatic): Promise<void> {
    if (this.target == null || this.noteThreadQuery == null || this.noteThreadQuery.docs.length < 1) {
      return;
    }
    if (delta.ops == null || delta.ops.length < 2) {
      // If the length is less than two, it can be skipped since productive ops have a minimum length of two
      return;
    }

    const updatePromises: Promise<boolean>[] = [];

    // a user initiated delta with ops that include inserting a note embed can only be undo deleting a note icon
    const reinsertedNoteEmbeds: DeltaOperation[] = delta.filter(
      op => op.insert != null && op.insert['note-thread-embed'] != null
    );
    const reinsertedNoteIds: string[] = [];
    reinsertedNoteEmbeds.forEach(n => {
      if (n.attributes != null && n.attributes['threadid'] != null) {
        reinsertedNoteIds.push(n.attributes['threadid']);
      }
    });
    const textInsertOps: DeltaOperation[] = delta.filter(
      ops => ops.insert != null && ops.insert['note-thread-embed'] == null
    );
    const textDeleteOps: DeltaOperation[] = delta.filter(ops => ops.delete != null);
    const hasTextEditOp: boolean = textInsertOps.length > 0 || textDeleteOps.length > 0;
    for (const affected of affectedEmbeds) {
      const editPosition: number | undefined = this.getEditPositionWithinRange(affected.verseRange, delta);
      if (editPosition == null) {
        continue;
      }
      for (const [threadId, notePos] of affected.embeds.entries()) {
        const noteThreadDoc: NoteThreadDoc | undefined = this.noteThreadQuery.docs.find(
          n => n.data?.dataId === threadId
        );
        if (noteThreadDoc?.data == null) {
          continue;
        }

        const noteCountInTextAnchor: number = this.getEmbedCountInAnchorRange(
          affected.embeds,
          notePos,
          noteThreadDoc.data.position.length
        );
        const noteAnchorEndIndex: number = notePos + noteThreadDoc.data.position.length + noteCountInTextAnchor;
        const isUndoingDeleteNoteEmbed: boolean = reinsertedNoteEmbeds.length > 0;
        // A note anchor is only affected by the undo operation if the delta includes inserting the note embed, or
        // if the edit op occurs before the note text anchor last character
        // i.e. note anchors are unaffected if the edit index comes after the note and anchor
        const noteIsAffected: boolean = noteAnchorEndIndex >= editPosition || reinsertedNoteIds.includes(threadId);
        if (isUndoingDeleteNoteEmbed && noteIsAffected && hasTextEditOp) {
          updatePromises.push(
            noteThreadDoc
              .previousSnapshot()
              .then(s => noteThreadDoc.submitJson0Op(op => op.set(n => n.position, s.data.position)))
          );
          continue;
        }

        const oldNotePosition: TextAnchor = noteThreadDoc.data.position ?? { start: 0, length: 0 };
        const newTextAnchor: TextAnchor | undefined = this.getUpdatedTextAnchor(
          oldNotePosition,
          affected.embeds,
          notePos,
          affected.verseRange,
          delta
        );
        if (isEqual(oldNotePosition, newTextAnchor)) {
          continue;
        }
        updatePromises.push(noteThreadDoc.submitJson0Op(op => op.set(n => n.position, newTextAnchor)));
      }
      await Promise.all(updatePromises);

      // Re-apply the underline style to notes that were re-inserted
      const embedPositions: Readonly<Map<string, number>> = this.target.embeddedElements;
      for (const id of reinsertedNoteIds) {
        const position: number | undefined = embedPositions.get(id);
        if (position != null) {
          this.target.editor?.formatText(position, 1, 'text-anchor', 'true', 'api');
        }
      }
    }
  }

  /** Determine the number of embeds that are within an anchoring.
   * @param embeds Positions of embeds to consider.
   * @param embedIndex The position of an embed at the beginning of the anchoring, included in the resulting count.
   * @param anchorLength The text character count in the anchoring range, excludes length of embeds.
   */
  private getEmbedCountInAnchorRange(embeds: Map<string, number>, embedIndex: number, anchorLength: number): number {
    let embedCount = 0;
    let endIndex = embedIndex + anchorLength;
    // sort the indices so we count the segment embeds in ascending order
    const embedIndices: number[] = Array.from(embeds.values()).sort();
    for (const index of embedIndices) {
      if (index >= embedIndex) {
        if (index < endIndex) {
          embedCount++;
          // add the embed to the length to search
          endIndex++;
        } else {
          break;
        }
      }
    }
    return embedCount;
  }

  /** Gets the updated text anchor for a note thread given the positions of the old embeds and the text edit applied. */
  private getUpdatedTextAnchor(
    oldTextAnchor: TextAnchor,
    oldVerseEmbedPositions: Map<string, number>,
    noteIndex: number,
    verseRange: RangeStatic,
    delta: DeltaStatic
  ): TextAnchor | undefined {
    if (oldTextAnchor.start === 0 && oldTextAnchor.length === 0) {
      return oldTextAnchor;
    }
    const noteCount: number = this.getEmbedCountInAnchorRange(oldVerseEmbedPositions, noteIndex, oldTextAnchor.length);
    const noteAnchorEndIndex: number = noteIndex + oldTextAnchor.length + noteCount;
    const verseNotePositions = new Set(oldVerseEmbedPositions.values());
    let [startChange, lengthChange] = this.getAnchorChanges(
      noteIndex,
      noteAnchorEndIndex,
      verseRange,
      delta,
      verseNotePositions
    );

    if (oldTextAnchor.length > 0 && oldTextAnchor.length + lengthChange <= 0) {
      return { start: 0, length: 0 };
    }

    return { start: oldTextAnchor.start + startChange, length: oldTextAnchor.length + lengthChange };
  }

  private getAnchorChanges(
    embedPosition: number,
    noteAnchorEndIndex: number,
    verseRange: RangeStatic,
    delta: DeltaStatic,
    embedPositions: Set<number>
  ): [number, number] {
    let startChange: number = 0;
    let lengthChange: number = 0;
    if (delta.ops == null || delta.ops.length < 2) {
      return [0, 0];
    }
    let curIndex = 0;
    // get the length that was inserted or deleted to apply to the verse text anchors
    for (const op of delta.ops) {
      const insertOp: any = op.insert;
      const deleteOp: number | undefined = op.delete;
      const retainOp: number | undefined = op.retain;
      if (retainOp != null) {
        curIndex += retainOp;
        continue;
      }

      const editIsInVerseRange: boolean =
        curIndex >= verseRange.index && curIndex <= verseRange.index + verseRange.length;
      if (insertOp != null) {
        if (!editIsInVerseRange) continue;
        let length = 0;
        if (typeof insertOp === 'string') {
          length = insertOp.length;
        } else if (insertOp['note-thread-embed'] != null) {
          const embedId = insertOp['note-thread-embed']['threadid'];
          if (embedId != null) {
            continue;
          }
        } else {
          // the non-text insert always has a length of 1
          length = 1;
        }

        if (curIndex <= embedPosition) {
          startChange += length;
        } else if (curIndex > embedPosition && curIndex <= noteAnchorEndIndex) {
          // Note that if the user inserted text at the end of this note anchor, we consider
          // this inside the text anchor because the user could be expanding the last text anchor word.
          lengthChange += length;
        }
      } else if (deleteOp != null) {
        if (editIsInVerseRange) {
          let [deleteBefore, deleteWithin] = this.calculateDeletionUpdate(
            curIndex,
            embedPosition,
            noteAnchorEndIndex,
            deleteOp,
            embedPositions
          );
          startChange -= deleteBefore;
          lengthChange -= deleteWithin;
        }
        curIndex += deleteOp;
      }
    }

    return [startChange, lengthChange];
  }

  /** Gets the first edit position within the given range. */
  private getEditPositionWithinRange(range: RangeStatic, delta: DeltaStatic): number | undefined {
    if (delta.ops == null) {
      return;
    }
    let curIndex = 0;
    for (const op of delta.ops) {
      const deleteOp: number | undefined = op.delete;
      const insertOp: any | undefined = op.insert;
      if ((deleteOp != null || insertOp != null) && curIndex >= range.index && curIndex <= range.index + range.length) {
        // the edit op occurs within the range
        return curIndex;
      }

      const retainOp: number | undefined = op.retain;
      curIndex += retainOp == null ? 0 : retainOp;
    }
    return;
  }

  private calculateDeletionUpdate(
    editPosition: number,
    embedPosition: number,
    noteAnchorEndIndex: number,
    deleteLength: number,
    embedPositions: Set<number>
  ): [number, number] {
    let deleteBeforeLength = 0;
    let deleteWithinLength = 0;
    for (let charIndex = editPosition; charIndex < editPosition + deleteLength; charIndex++) {
      if (embedPositions.has(charIndex)) {
        // The edit involves deleting an embed icon. It neither counts as length within nor before
        continue;
      }
      if (charIndex === embedPosition) {
        console.warn(
          `Warning: getUpdatedTextAnchor: No embed at position ${embedPosition} was found in embedPositions:`,
          embedPositions
        );
      }
      if (charIndex < embedPosition) {
        deleteBeforeLength++;
      } else if (charIndex > embedPosition && charIndex < noteAnchorEndIndex) {
        deleteWithinLength++;
      } else {
        break;
      }
    }
    return [deleteBeforeLength, deleteWithinLength];
  }

  private currentChapterNoteThreadDocs(): NoteThreadDoc[] {
    if (
      this.noteThreadQuery?.docs == null ||
      this.noteThreadQuery.docs.length < 1 ||
      this.bookNum == null ||
      this._chapter == null
    ) {
      return [];
    }
    return this.noteThreadQuery.docs.filter(
      nt =>
        nt.data != null &&
        nt.data.verseRef.bookNum === this.bookNum &&
        nt.data.verseRef.chapterNum === this.chapter &&
        nt.data.notes.length > 0
    );
  }

  private embedNoteThread(featured: FeaturedVerseRefInfo): string | undefined {
    if (this.target == null) {
      return;
    }

    const format = { iconsrc: featured.icon.cssVar, preview: featured.preview, threadid: featured.id };
    if (featured.highlight) {
      format['highlight'] = featured.highlight;
    }
    return this.target.embedElementInline(
      featured.verseRef,
      featured.id,
      featured.textAnchor ?? { start: 0, length: 0 },
      'note-thread-embed',
      format
    );
  }

  private hasNewContent(thread: NoteThreadDoc): boolean {
    const noteId: string | undefined = thread.data?.notes[thread.data?.notes.length - 1].dataId;
    if (noteId == null || this.projectUserConfigDoc?.data == null) {
      return false;
    }
    return !this.projectUserConfigDoc.data.noteRefsRead.includes(noteId);
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
      !this.targetFocused
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
