import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { AfterViewInit, Component, DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, NavigationBehaviorOptions, Router } from '@angular/router';
import { Canon, VerseRef } from '@sillsdev/scripture';
import { SplitComponent } from 'angular-split';
import { cloneDeep, debounce } from 'lodash-es';
import { Operation } from 'realtime-server/lib/esm/common/models/project-rights';
import { Answer, AnswerStatus } from 'realtime-server/lib/esm/scriptureforge/models/answer';
import { AudioTiming } from 'realtime-server/lib/esm/scriptureforge/models/audio-timing';
import { Comment } from 'realtime-server/lib/esm/scriptureforge/models/comment';
import { Question } from 'realtime-server/lib/esm/scriptureforge/models/question';
import { SFProjectProfile } from 'realtime-server/lib/esm/scriptureforge/models/sf-project';
import { SF_PROJECT_RIGHTS, SFProjectDomain } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-rights';
import { SFProjectRole } from 'realtime-server/lib/esm/scriptureforge/models/sf-project-role';
import { getTextAudioId } from 'realtime-server/lib/esm/scriptureforge/models/text-audio';
import { TextInfo } from 'realtime-server/lib/esm/scriptureforge/models/text-info';
import { toVerseRef, VerseRefData } from 'realtime-server/lib/esm/scriptureforge/models/verse-ref-data';
import { asyncScheduler, BehaviorSubject, combineLatest, from, merge, Observable, Subscription } from 'rxjs';
import {
  distinctUntilChanged,
  filter,
  map,
  shareReplay,
  startWith,
  switchMap,
  take,
  throttleTime
} from 'rxjs/operators';
import { DataLoadingComponent } from 'xforge-common/data-loading-component';
import { I18nService } from 'xforge-common/i18n.service';
import { Breakpoint, MediaBreakpointService } from 'xforge-common/media-breakpoints/media-breakpoint.service';
import { FileType } from 'xforge-common/models/file-offline-data';
import { RealtimeQuery } from 'xforge-common/models/realtime-query';
import { NoticeService } from 'xforge-common/notice.service';
import { OnlineStatusService } from 'xforge-common/online-status.service';
import { UserService } from 'xforge-common/user.service';
import { quietTakeUntilDestroyed } from 'xforge-common/util/rxjs-util';
import { objectId } from 'xforge-common/utils';
import { QuestionDoc } from '../../core/models/question-doc';
import { SFProjectProfileDoc } from '../../core/models/sf-project-profile-doc';
import { SF_DEFAULT_SHARE_ROLE } from '../../core/models/sf-project-role-info';
import { SFProjectUserConfigDoc } from '../../core/models/sf-project-user-config-doc';
import { TextAudioDoc } from '../../core/models/text-audio-doc';
import { TextDocId } from '../../core/models/text-doc';
import { TextsByBookId } from '../../core/models/texts-by-book-id';
import { PermissionsService } from '../../core/permissions.service';
import { SFProjectService } from '../../core/sf-project.service';
import { getVerseStrFromSegmentRef } from '../../shared/utils';
import { ChapterAudioDialogData } from '../chapter-audio-dialog/chapter-audio-dialog.component';
import { ChapterAudioDialogService } from '../chapter-audio-dialog/chapter-audio-dialog.service';
import { BookChapter, CheckingUtils, isQuestionScope, QuestionScope } from '../checking.utils';
import { QuestionDialogData } from '../question-dialog/question-dialog.component';
import { QuestionDialogService } from '../question-dialog/question-dialog.service';
import { AnswerAction, CheckingAnswersComponent } from './checking-answers/checking-answers.component';
import { CommentAction } from './checking-answers/checking-comments/checking-comments.component';
import { AudioAttachment } from './checking-audio-player/checking-audio-player.component';
import { CheckingQuestionsService, PreCreationQuestionData, QuestionFilter } from './checking-questions.service';
import { CheckingQuestionsComponent, QuestionChangedEvent } from './checking-questions/checking-questions.component';
import { CheckingScriptureAudioPlayerComponent } from './checking-scripture-audio-player/checking-scripture-audio-player.component';
import { CheckingTextComponent } from './checking-text/checking-text.component';

interface Summary {
  unread: number;
  read: number;
  answered: number;
}

@Component({
  selector: 'app-checking',
  templateUrl: './checking.component.html',
  styleUrls: ['./checking.component.scss']
})
export class CheckingComponent extends DataLoadingComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('answerPanelContainer') set answersPanelElement(answersPanelContainerElement: ElementRef) {
    // Need to trigger the calculation for the slider after DOM has been updated
    this.answersPanelContainerElement = answersPanelContainerElement;
    this.calculateScriptureSliderPosition(true);
  }
  @ViewChild(CheckingAnswersComponent) answersPanel?: CheckingAnswersComponent;
  @ViewChild(CheckingTextComponent) scripturePanel?: CheckingTextComponent;
  @ViewChild(CheckingQuestionsComponent) questionsList?: CheckingQuestionsComponent;
  @ViewChild('splitter') splitComponent?: SplitComponent;
  @ViewChild('splitContainer') splitContainerElement?: ElementRef;
  @ViewChild('scripturePanelContainer') scripturePanelContainerElement?: ElementRef;
  @ViewChild(CheckingScriptureAudioPlayerComponent) set scriptureAudioPlayer(
    newValue: CheckingScriptureAudioPlayerComponent
  ) {
    this._scriptureAudioPlayer = newValue;
    if (newValue !== undefined) {
      // If we are automatically showing the Scripture audio player because hide-text is enabled, don't auto-play.
      if (this.hideChapterText) return;
      Promise.resolve(null).then(() => this._scriptureAudioPlayer?.play());
    }
  }
  @ViewChild('questionsPanel') questionsPanel?: ElementRef;

  books: number[] = [];
  chapters: number[] = [];
  isQuestionsOverlayVisible: boolean = false;
  scriptureFontSize: string = '';
  summary: Summary = {
    read: 0,
    unread: 0,
    answered: 0
  };
  questionScopes = new Map<QuestionScope, string>([
    ['all', 'question_scope_all'],
    ['book', 'question_scope_book'],
    ['chapter', 'question_scope_chapter']
  ]);
  activeQuestionScope: QuestionScope | undefined;
  questionFilters = new Map<QuestionFilter, string>();
  activeQuestionFilter: QuestionFilter = QuestionFilter.None;
  questionVerseRefs: VerseRef[] = [];
  answersPanelContainerElement?: ElementRef;
  projectDoc?: SFProjectProfileDoc;
  projectUserConfigDoc?: SFProjectUserConfigDoc;
  textDocId?: TextDocId;
  totalVisibleQuestionsString: string = '0';
  visibleQuestions: Readonly<QuestionDoc[] | undefined>;
  hasQuestionWithoutAudio: boolean = false;
  isCreatingNewQuestion: boolean = false;
  questionToBeCreated: PreCreationQuestionData | undefined;
  isScreenSmall = false;

  /** The book/chapter from the route.  Stored question activation is constrained to this book/chapter. */
  routeBookChapter?: BookChapter;

  private readonly activeQuestionDoc$ = new BehaviorSubject<QuestionDoc | undefined>(undefined);

  /**
   * The question before the active question according to the active question filter.
   * This question may be in a different book/chapter.
   */
  readonly prevQuestion$: Observable<QuestionDoc | undefined> = this.activeQuestionDoc$.pipe(
    switchMap(activeDoc => from(this.getAdjacentQuestion(activeDoc, 'prev'))),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  /**
   * The question after the active question according to the active question filter.
   * This question may be in a different book/chapter.
   */
  readonly nextQuestion$: Observable<QuestionDoc | undefined> = this.activeQuestionDoc$.pipe(
    switchMap(activeDoc => from(this.getAdjacentQuestion(activeDoc, 'next'))),
    shareReplay({ bufferSize: 1, refCount: true })
  );

  private _book?: number;
  private _isDrawerPermanent: boolean = true;
  private _chapter?: number;
  private questionsQuery?: RealtimeQuery<QuestionDoc>;
  private _activeQuestionVerseRef?: VerseRef;
  private questionsSub?: Subscription;
  private textAudioQuery?: RealtimeQuery<TextAudioDoc>;
  private projectDeleteSub?: Subscription;
  private hideTextSub?: Subscription;
  private textAudioSub?: Subscription;
  private audioChangedSub?: Subscription;
  private projectRemoteChangesSub?: Subscription;
  private questionFilterFunctions: Record<QuestionFilter, (answers: Answer[]) => boolean> = {
    [QuestionFilter.None]: () => true,
    [QuestionFilter.CurrentUserHasNotAnswered]: answers =>
      !answers.some(a => a.ownerRef === this.userService.currentUserId),
    [QuestionFilter.CurrentUserHasAnswered]: answers =>
      answers.some(a => a.ownerRef === this.userService.currentUserId),
    [QuestionFilter.HasAnswers]: answers => answers.length > 0,
    [QuestionFilter.NoAnswers]: answers => answers.length === 0,
    [QuestionFilter.StatusNone]: answers => answers.some(a => a.status === AnswerStatus.None || a.status == null),
    [QuestionFilter.StatusExport]: answers => answers.some(a => a.status === AnswerStatus.Exportable),
    [QuestionFilter.StatusResolved]: answers => answers.some(a => a.status === AnswerStatus.Resolved)
  };
  private questionsRemoteChangesSub?: Subscription;
  private text?: TextInfo;
  private _scriptureAudioPlayer?: CheckingScriptureAudioPlayerComponent;
  private _showScriptureAudioPlayer: boolean = false;

  constructor(
    private readonly destroyRef: DestroyRef,
    private readonly activatedRoute: ActivatedRoute,
    private readonly projectService: SFProjectService,
    private readonly checkingQuestionsService: CheckingQuestionsService,
    private readonly userService: UserService,
    readonly breakpointObserver: BreakpointObserver,
    private readonly mediaBreakpointService: MediaBreakpointService,
    noticeService: NoticeService,
    private readonly router: Router,
    private readonly permissions: PermissionsService,
    private readonly questionDialogService: QuestionDialogService,
    readonly i18n: I18nService,
    private readonly onlineStatusService: OnlineStatusService,
    private readonly chapterAudioDialogService: ChapterAudioDialogService
  ) {
    super(noticeService);
  }

  get activeQuestionVerseRef(): VerseRef | undefined {
    if (this.questionsList != null && this.book === this.questionsList.activeQuestionBook) {
      return this._activeQuestionVerseRef;
    }

    return undefined;
  }

  get appliedQuestionFilterKey(): string | undefined {
    return this.questionFilters.get(this.activeQuestionFilter);
  }

  get chapter(): number | undefined {
    return this._chapter;
  }

  set chapter(value: number | undefined) {
    if (this._chapter !== value) {
      this._chapter = value;
      this.textDocId =
        this.projectDoc != null && this.text != null && this.chapter != null
          ? new TextDocId(this.projectDoc.id, this.text.bookNum, this.chapter, 'target')
          : undefined;

      this._scriptureAudioPlayer?.stop();

      if (!this.chapterHasAudio && !this.hideChapterText) {
        this.hideChapterAudio();
      }
    }
  }

  get isQuestionListPermanent(): boolean {
    return this._isDrawerPermanent;
  }

  set isQuestionListPermanent(value: boolean) {
    if (this._isDrawerPermanent !== value) {
      this._isDrawerPermanent = value;
      if (!this._isDrawerPermanent) {
        this.setQuestionsOverlayVisibility(false);
      }
    }
  }

  get isQuestionFilterApplied(): boolean {
    return this.activeQuestionFilter !== QuestionFilter.None;
  }

  get canCreateQuestions(): boolean {
    const project = this.projectDoc?.data;
    return (
      project != null &&
      SF_PROJECT_RIGHTS.hasRight(project, this.userService.currentUserId, SFProjectDomain.Questions, Operation.Create)
    );
  }

  get canCreateScriptureAudio(): boolean {
    const project: Readonly<SFProjectProfile | undefined> = this.projectDoc?.data;
    const userId: string = this.userService.currentUserId;
    return project != null && SF_PROJECT_RIGHTS.hasRight(project, userId, SFProjectDomain.TextAudio, Operation.Create);
  }

  get showScriptureAudioPlayer(): boolean {
    return this._showScriptureAudioPlayer;
  }

  private set showScriptureAudioPlayer(value: boolean) {
    this._showScriptureAudioPlayer = value;
  }

  get hideChapterText(): boolean {
    return this.projectDoc?.data?.checkingConfig.hideCommunityCheckingText ?? false;
  }

  get userOpenedChapterAudio(): boolean {
    return this.showScriptureAudioPlayer && !this.hideChapterText;
  }

  get textboxIsShown(): boolean {
    const isAnswering = this.answersPanel?.answerInput != null;
    const isCommenting = this.answersPanel?.allComments?.find(c => c.inputComponent != null) != null;
    return isAnswering || isCommenting;
  }

  get textboxIsShownMobile(): boolean {
    return this.textboxIsShown && this.isScreenSmall;
  }

  get isRightToLeft(): boolean {
    if (this.projectDoc?.data?.isRightToLeft != null) {
      return this.projectDoc.data.isRightToLeft;
    }
    return false;
  }

  get questionDocs(): Readonly<QuestionDoc[]> {
    return this.questionsQuery?.docs || [];
  }

  get textsByBookId(): TextsByBookId {
    const textsByBook: TextsByBookId = {};
    if (this.projectDoc != null && this.projectDoc.data != null) {
      for (const text of this.projectDoc.data.texts) {
        textsByBook[Canon.bookNumberToId(text.bookNum)] = text;
      }
    }
    return textsByBook;
  }

  get routerLink(): string[] {
    if (this.projectDoc == null) {
      return [];
    }
    return ['/projects', this.projectDoc.id, 'checking'];
  }

  get defaultShareRole(): SFProjectRole {
    return SF_DEFAULT_SHARE_ROLE;
  }

  get canShare(): boolean {
    return (
      this.projectDoc?.data != null &&
      SF_PROJECT_RIGHTS.hasRight(
        this.projectDoc.data,
        this.userService.currentUserId,
        SFProjectDomain.UserInvites,
        Operation.Create
      )
    );
  }

  get chapterHasAudio(): boolean {
    return this.text?.chapters.find(c => c.number === this.chapter)?.hasAudio === true;
  }

  get chapterTextAudioTiming(): AudioTiming[] {
    if (this.textDocId == null) return [];
    const textAudioId: string = getTextAudioId(
      this.textDocId.projectId,
      this.textDocId.bookNum,
      this.textDocId.chapterNum
    );
    return this.textAudioQuery?.docs.find(t => t.id === textAudioId)?.data?.timings ?? [];
  }

  get chapterAudioSource(): string {
    if (this.book == null || this.chapter == null || this.projectDoc?.id == null || this.textAudioQuery == null) {
      return '';
    }

    const audioId: string = getTextAudioId(this.projectDoc.id, this.book, this.chapter);
    const audioData = this.textAudioQuery.docs.find(t => t.id === audioId)?.data;
    return audioData?.audioUrl ?? '';
  }

  get book(): number | undefined {
    return this._book;
  }

  set book(book: number | undefined) {
    if (book === this.book) {
      return;
    }
    if (this.projectDoc?.data == null) {
      return;
    }

    this._book = book;
    this.text = this.projectDoc.data.texts.find(t => t.bookNum === book);
    this.chapters = this.text == null ? [] : this.text.chapters.map(c => c.number);
    this._chapter = undefined;
  }

  /**
   * Height in px needed to show all elements in the bottom
   * half of the answer panel splitter without them needing
   * to vertically scroll.
   */
  private get fullyExpandedAnswerPanelHeight(): number {
    if (this.answersPanelContainerElement == null) {
      return 0;
    }

    const answersPanelVerticalPadding =
      this.getCSSFloatPropertyOf(this.answersPanelContainerElement, 'padding-top') +
      this.getCSSFloatPropertyOf(this.answersPanelContainerElement, 'padding-bottom');

    const scrollPartHeight = this.getMinScrollHeight(
      this.answersPanelContainerElement,
      '.answers-component-scrollable-content'
    );

    const showUnreadsBannerHeight = this.getOffsetHeight(
      this.answersPanelContainerElement,
      '.answers-component-footer'
    );

    // In Chromium the audio elements usually haven't rendered at this point, or have only partially rendered, though
    // they are in the DOM
    // If an audio element exists and the height is less than expected, add the difference to the calculation
    // The same is done for the answer footer, since the avatar sometimes hasn't contributed to the height yet
    const answerPanel = this.answersPanelContainerElement.nativeElement as HTMLElement;
    const expectedAudioHeight = 58;
    const audioOffsetHeight = Array.from(
      answerPanel.querySelectorAll('.question-audio app-checking-audio-player, .answer app-checking-audio-player')
    )
      .map((audio: Element) => {
        if (audio.getBoundingClientRect().height < expectedAudioHeight) {
          return (
            expectedAudioHeight -
            audio.getBoundingClientRect().height +
            (audio.parentElement ? this.getCSSFloatPropertyOf(audio.parentElement, 'margin-bottom') : 0)
          );
        } else {
          return 0;
        }
      })
      .reduce((a, b) => a + b, 0);

    const expectedFooterHeight = 38;
    // app-owner is the element that ends up determining the height of the footer
    const footerOffsetHeight = Array.from(answerPanel.querySelectorAll('.answer-footer app-owner'))
      .map(footer => footer as HTMLElement)
      .map(footer => (footer.offsetHeight < expectedFooterHeight ? expectedFooterHeight - footer.offsetHeight : 0))
      .reduce((a, b) => a + b, 0);

    return (
      answersPanelVerticalPadding + scrollPartHeight + audioOffsetHeight + footerOffsetHeight + showUnreadsBannerHeight
    );
  }

  /**
   * Minimum height in px to show no more than these
   * elements in the bottom half of the answer panel splitter:
   * - Question
   * - Answer count, if present
   * - show-more-answers banner, if present
   * - add-answer button, if present
   */
  private get answerPanelElementMinimumHeight(): number {
    // Note: Alternate implementations can end up showing
    // the top border of the first answer, if the browser
    // window is tall. So that can be looked for when modifying
    // this method.

    if (this.answersPanelContainerElement == null) {
      return 0;
    }

    const totalAnswersMessage = document.querySelector('#totalAnswersMessage') as Element;
    const distanceFromTopToTotalAnswersMessageBottom =
      totalAnswersMessage == null
        ? 0
        : totalAnswersMessage.getBoundingClientRect().bottom -
          this.answersPanelContainerElement.nativeElement.getBoundingClientRect().top;

    const actionsArea = document.querySelector('.actions') as Element;
    const distanceFromTopToAddAnswerButtonBottom =
      actionsArea == null
        ? 0
        : actionsArea.getBoundingClientRect().bottom -
          this.answersPanelContainerElement.nativeElement.getBoundingClientRect().top;

    const showUnreadsBannerHeight = this.getOffsetHeight(
      this.answersPanelContainerElement,
      '.answers-component-footer'
    );

    const answersPanelVerticalPadding =
      this.getCSSFloatPropertyOf(this.answersPanelContainerElement, 'padding-top') +
      this.getCSSFloatPropertyOf(this.answersPanelContainerElement, 'padding-bottom');

    const addAnswerButton = document.querySelector('#add-answer') as Element;
    const addAnswerButtonHeight = addAnswerButton == null ? 0 : addAnswerButton.getBoundingClientRect().height;

    return (
      Math.max(distanceFromTopToTotalAnswersMessageBottom, distanceFromTopToAddAnswerButtonBottom) +
      answersPanelVerticalPadding +
      showUnreadsBannerHeight +
      addAnswerButtonHeight
    );
  }

  private get splitContainerElementHeight(): number {
    return this.splitContainerElement && this.splitComponent
      ? this.splitContainerElement.nativeElement.offsetHeight - this.splitComponent.gutterSize!
      : 0;
  }

  private get scriptureAudioPlayerAreaHeight(): number {
    const scriptureAudioPlayerArea: Element | null = document.querySelector('.scripture-audio-player-wrapper');
    return scriptureAudioPlayerArea == null ? 0 : scriptureAudioPlayerArea.getBoundingClientRect().height;
  }

  ngOnInit(): void {
    combineLatest([this.activatedRoute.params, this.activatedRoute.queryParams])
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe(async ([params, queryParams]) => {
        this.loadingStarted();

        // Wrap with try/finally to ensure loadingFinished() is called
        try {
          const routeProjectId: string = params['projectId'];
          const routeChapter: string | undefined = params['chapter'];
          const routeChapterNum: number | undefined = routeChapter != null ? Number.parseInt(routeChapter) : undefined;
          const routeBookId: string | undefined = params['bookId']?.toLowerCase();
          const routeScope: QuestionScope | undefined =
            routeBookId === 'all' ? 'all' : queryParams['scope']?.toLowerCase();

          // Handle 'ALL' scope being passed as book param
          const routeBookNum: number | undefined =
            routeBookId != null && routeBookId !== 'all' ? Canon.bookIdToNumber(routeBookId) : undefined;

          const prevProjectId: string = this.projectDoc == null ? '' : this.projectDoc.id;
          const prevChapterNum: number | undefined = this.chapter;
          const prevBookNum: number | undefined = this.book;
          const prevScope: QuestionScope | undefined = this.activeQuestionScope;

          // Reroute if invalid scope or scope not specified
          if (!isQuestionScope(routeScope)) {
            // If no chapter is provided, set scope to 'book'
            this.navigateScope(routeChapterNum != null ? 'chapter' : 'book', { replaceUrl: true });
            return;
          }

          // Do once unless project changes
          if (routeProjectId !== prevProjectId) {
            this.projectDoc = await this.projectService.getProfile(routeProjectId);

            if (!this.projectDoc?.isLoaded) {
              return;
            }

            if (this.projectDoc.data == null) {
              throw new Error('Project data is null');
            }

            if (this.projectDoc.data.texts.length === 0) {
              throw new Error('Project has no texts');
            }

            this.books = this.projectDoc.data.texts.map(t => t.bookNum).sort((a, b) => a - b) ?? [];
            this.initQuestionFilters();

            this.projectUserConfigDoc = await this.projectService.getUserConfig(
              routeProjectId,
              this.userService.currentUserId
            );

            // Subscribe to the projectDoc now that it is defined
            this.projectRemoteChangesSub?.unsubscribe();
            this.projectRemoteChangesSub = this.projectDoc.remoteChanges$
              .pipe(quietTakeUntilDestroyed(this.destroyRef))
              .subscribe(() => {
                if (this.projectDoc != null && this.projectDoc.data != null) {
                  const roles = this.projectDoc.data.userRoles;
                  const userId = this.userService.currentUserId;
                  if (!(userId in roles)) {
                    this.onRemovedFromProject();
                  } else if (!this.permissions.canAccessCommunityChecking(this.projectDoc)) {
                    this.onRemovedFromProject();
                  }
                }
              });

            this.hideTextSub?.unsubscribe();
            this.hideTextSub = this.projectDoc.changes$
              .pipe(
                map(() => this.projectDoc?.data?.checkingConfig.hideCommunityCheckingText),
                startWith(this.projectDoc.data.checkingConfig.hideCommunityCheckingText),
                distinctUntilChanged(),
                quietTakeUntilDestroyed(this.destroyRef)
              )
              .subscribe(() => {
                if (this.hideChapterText) this.showScriptureAudioPlayer = true;
                this.calculateScriptureSliderPosition();
              });

            this.projectDeleteSub?.unsubscribe();
            this.projectDeleteSub = this.projectDoc.delete$
              .pipe(quietTakeUntilDestroyed(this.destroyRef))
              .subscribe(() => this.onRemovedFromProject());
          }

          this.activeQuestionScope = routeScope;

          // If book/chapter is specified in route, use routed book/chapter even if it contains no questions
          if (routeBookNum != null && routeChapterNum != null) {
            this.book = routeBookNum;
            this.chapter = routeChapterNum;
            this.routeBookChapter = {
              bookNum: this.book,
              chapterNum: this.chapter
            };
          } else {
            const suggestedBookChapter: BookChapter = await this.getSuggestedNavBookChapter(routeBookNum);
            this.navigateBookChapter(
              routeProjectId,
              routeScope!,
              suggestedBookChapter.bookNum,
              suggestedBookChapter.chapterNum,
              {
                replaceUrl: true
              }
            );

            return;
          }

          // Determine if a new questions query is needed.
          // Reload questions if any of the following are true:
          // - project changed
          // - scope changed
          // - book changed and scope is not 'all'
          // - chapter changed and scope is chapter
          if (
            routeProjectId !== prevProjectId ||
            routeScope !== prevScope ||
            (routeScope !== 'all' && routeBookNum !== prevBookNum) ||
            (routeScope === 'chapter' && (routeChapter == null ? undefined : parseInt(routeChapter)) !== prevChapterNum)
          ) {
            this.cleanup();
            this.questionsQuery = await this.checkingQuestionsService.queryQuestions(
              routeProjectId,
              {
                bookNum: routeScope === 'all' ? undefined : routeBookNum,
                chapterNum: routeScope === 'chapter' ? routeChapterNum : undefined,
                sort: true,
                activeOnly: true
              },
              this.destroyRef
            );
            if (this.projectDoc != null) {
              this.textAudioSub = merge(this.questionsQuery.ready$, this.projectDoc.remoteChanges$)
                .pipe(quietTakeUntilDestroyed(this.destroyRef))
                .subscribe(() => this.updateAudioMissingWarning());
            }

            // TODO (scripture audio) Only fetch the timing data for the currently active chapter
            this.projectService.queryAudioText(routeProjectId, this.destroyRef).then(query => {
              this.textAudioQuery = query;
              this.audioChangedSub = merge(this.textAudioQuery.remoteChanges$, this.textAudioQuery.localChanges$)
                .pipe(quietTakeUntilDestroyed(this.destroyRef))
                .subscribe(() => {
                  if (this.chapterAudioSource === '') {
                    this.hideChapterAudio();
                  }
                });
            });

            // TODO: check for remote changes to file data more generically
            this.questionsRemoteChangesSub = this.questionsQuery.remoteDocChanges$
              .pipe(quietTakeUntilDestroyed(this.destroyRef))
              .subscribe((qd: QuestionDoc) => {
                const isActiveQuestionDoc: boolean = qd.id === this.questionsList!.activeQuestionDoc?.id;

                if (isActiveQuestionDoc) {
                  this.updateActiveQuestionVerseRef(qd);
                }

                if (this.onlineStatusService.isOnline) {
                  qd.updateFileCache();
                }
              });

            // Determine when to update visible questions
            this.questionsSub = merge(
              this.questionsQuery.ready$.pipe(
                // Query 'ready$' will not emit when offline (initial emission of false is due to BehaviorSubject),
                // but offline docs may be available.
                filter(isReady => isReady || !this.onlineStatusService.isOnline)
              ),
              this.questionsQuery.remoteChanges$.pipe(map(() => 'remote')),
              this.questionsQuery.localChanges$.pipe(map(() => 'local')),
              this.questionsQuery.remoteDocChanges$
            )
              .pipe(
                filter(source => {
                  if (this.projectDoc == null || (this.onlineStatusService.isOnline && !this.questionsQuery!.ready)) {
                    return false;
                  }

                  // If newly created local question is out of scope, don't refresh questions list yet,
                  // as it will be done once the nav changes the book/chapter to match the new question verse ref.
                  if (
                    source !== 'local' ||
                    this.questionToBeCreated == null ||
                    this.isInScope(this.questionToBeCreated?.question.verseRef)
                  ) {
                    return true;
                  }

                  return false;
                }),
                // Throttle burst of events, such as when local and remote change events are emitted
                // at the same time when question is added within scope.
                throttleTime(100, asyncScheduler, { leading: false, trailing: true }),
                quietTakeUntilDestroyed(this.destroyRef)
              )
              .subscribe(() => {
                this.updateAudioMissingWarning();
                this.updateVisibleQuestions();
              });
          } else {
            // Ensure refs updated if book changed, but no new questions query (scope is 'all')
            if (routeBookNum !== prevBookNum) {
              this.updateQuestionRefs();
            }
          }
        } finally {
          this.loadingFinished();
        }
      });

    // Get hook on pre-creation of question so that we can check if will be in scope
    // before deciding to update visible questions.
    this.checkingQuestionsService.beforeQuestionCreated$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe((data: PreCreationQuestionData) => {
        this.questionToBeCreated = data;
      });

    // Pre-creation question object is no longer needed after question is actually created
    this.checkingQuestionsService.afterQuestionCreated$
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe((data: QuestionDoc) => {
        if (data.id === this.questionToBeCreated?.docId) {
          this.questionToBeCreated = undefined;
        }
      });
  }

  ngAfterViewInit(): void {
    // Allows scrolling to the active question in the question list once it becomes visible
    this.breakpointObserver
      .observe(this.mediaBreakpointService.width('>', Breakpoint.SM, this.questionsPanel?.nativeElement))
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe((state: BreakpointState) => {
        this.calculateScriptureSliderPosition();
        // `questionsPanel` is undefined until ngAfterViewInit, but setting `isQuestionListPermanent`
        // here causes `ExpressionChangedAfterItHasBeenCheckedError`, so wrap in setTimeout
        setTimeout(() => {
          this.isQuestionListPermanent = state.matches;
        });
      });

    // Allows hiding the prev/next chapter buttons for small screens
    this.breakpointObserver
      .observe(this.mediaBreakpointService.width('<', Breakpoint.MD))
      .pipe(quietTakeUntilDestroyed(this.destroyRef))
      .subscribe((state: BreakpointState) => {
        // setting isScreenSmall causes `ExpressionChangedAfterItHasBeenCheckedError`, so wrap in setTimeout
        setTimeout(() => (this.isScreenSmall = state.matches));
      });

    if (this.questionsList?.activeQuestionDoc) {
      this.activeQuestionDoc$.next(this.questionsList.activeQuestionDoc);
    }
  }

  ngOnDestroy(): void {
    this.cleanup();
  }

  applyFontChange(fontSize: string): void {
    this.scriptureFontSize = fontSize;
  }

  async answerAction(answerAction: AnswerAction): Promise<void> {
    if (this.projectDoc == null || this.questionsList == null) {
      return;
    }

    switch (answerAction.action) {
      case 'save':
        let answer = answerAction.answer;
        const dateNow: string = new Date().toJSON();
        answer ??= {
          dataId: objectId(),
          ownerRef: this.userService.currentUserId,
          text: '',
          likes: [],
          dateCreated: dateNow,
          dateModified: dateNow,
          deleted: false,
          comments: [],
          status: AnswerStatus.None
        };
        answer.text = answerAction.text;
        answer.scriptureText = answerAction.scriptureText;
        answer.verseRef = answerAction.verseRef;
        answer.selectionStartClipped = answerAction.selectionStartClipped;
        answer.selectionEndClipped = answerAction.selectionEndClipped;
        answer.dateModified = dateNow;
        // add the audio url
        if (answerAction.audio != null) {
          if (!(await this.addAudioUrl(answer, answerAction.audio, answerAction.questionDoc))) {
            break;
          }
        }
        this.saveAnswer(answer, answerAction.questionDoc);
        if (answerAction.savedCallback != null) {
          answerAction.savedCallback();
        }
        break;
      case 'delete':
        if (answerAction.answer != null) {
          this.deleteAnswer(answerAction.answer);
        }
        break;
      case 'edit':
        if (answerAction.questionDoc != null) {
          this.questionsList.activateQuestion(answerAction.questionDoc);
        }
        break;
      case 'archive':
        this._scriptureAudioPlayer?.pause();
        this.activateNextQuestion();
        break;
      case 'like':
        if (answerAction.answer != null) {
          this.likeAnswer(answerAction.answer);
        }
        break;
      case 'show-unread':
        // Emit the question doc so that answers and comments get marked as read
        if (this.questionsList.activeQuestionDoc != null) {
          this.questionsList.activeQuestionDoc$.next(this.questionsList.activeQuestionDoc);
        }
        break;
      case 'show-form':
        break;
      case 'hide-form':
        break;
      case 'status':
        this.saveAnswer(answerAction.answer!, answerAction.questionDoc);
        break;
      case 'play-audio':
        break;
    }
    this.calculateScriptureSliderPosition(true);
  }

  setQuestionsOverlayVisibility(visible: boolean): void {
    this.isQuestionsOverlayVisible = visible;
  }

  async commentAction(commentAction: CommentAction): Promise<void> {
    if (this.questionsList == null) {
      return;
    }
    switch (commentAction.action) {
      case 'save':
        if (commentAction.answer != null) {
          let comment = commentAction.comment;
          const dateNow: string = new Date().toJSON();
          comment ??= {
            dataId: objectId(),
            ownerRef: this.userService.currentUserId,
            text: '',
            dateCreated: dateNow,
            dateModified: dateNow,
            deleted: false
          };
          comment.text = commentAction.text;
          comment.dateModified = dateNow;
          if (commentAction.audio != null) {
            if (!(await this.addAudioUrl(comment, commentAction.audio, this.questionsList.activeQuestionDoc!))) {
              break;
            }
          }
          this.saveComment(commentAction.answer, comment);
        }
        break;
      case 'show-comments':
        if (this.projectUserConfigDoc != null) {
          this.projectUserConfigDoc.submitJson0Op(op => {
            if (commentAction.answer != null) {
              for (const comm of commentAction.answer.comments.filter(comment => !comment.deleted)) {
                if (!this.questionsList!.hasUserReadComment(comm)) {
                  op.add(puc => puc.commentRefsRead, comm.dataId);
                }
              }
            }
          });
        }
        break;
      case 'delete':
        if (commentAction.answer != null && commentAction.comment != null) {
          this.deleteComment(commentAction.answer, commentAction.comment);
        }
        break;
      case 'show-form':
        break;
      case 'hide-form':
        break;
    }
    this.calculateScriptureSliderPosition(true);
  }

  checkSliderPosition(event: any): void {
    if (event.hasOwnProperty('sizes')) {
      if (event.sizes[1] < this.answerPanelElementMinimumHeight) {
        this.calculateScriptureSliderPosition();
      }
    }
  }

  onBookSelect(book: number): void {
    const navChapterNum: number = this.projectDoc!.data!.texts.find(t => t.bookNum === book)?.chapters[0].number ?? 1;
    this.navigateBookChapter(this.projectDoc!.id, this.activeQuestionScope!, book, navChapterNum);
  }

  onChapterSelect(chapter: number): void {
    this.navigateBookChapter(this.projectDoc!.id, this.activeQuestionScope!, this.book!, chapter);
  }

  questionUpdated(_questionDoc: QuestionDoc): void {
    this.refreshSummary();
  }

  // if click question in question list
  questionChanged({ questionDoc, actionSource, clearFilter }: QuestionChangedEvent): void {
    if (this.questionsList == null) {
      return;
    }

    // Hide the mobile question overlay unless question changed is due to a filter action (list change)
    if (!actionSource?.isQuestionListChange) {
      this.setQuestionsOverlayVisibility(false);
    }

    if (clearFilter) {
      this.resetFilter();
    }

    if (questionDoc != null) {
      this.updateActiveQuestionVerseRef(questionDoc);
      this.calculateScriptureSliderPosition(true);
      this.refreshSummary();

      if (this.onlineStatusService.isOnline) {
        questionDoc.updateAnswerFileCache();
      }
      if (!this.hideChapterText && !(actionSource?.isQuestionListChange ?? false)) {
        this.toggleAudio(true);
      }

      // Ensure navigation is set to book/chapter of selected question
      this.navigateQuestionChapter(questionDoc);
    }

    this.activeQuestionDoc$.next(questionDoc);
  }

  async questionDialog(): Promise<void> {
    if (this.projectDoc == null || this.questionsList == null) {
      return;
    }

    // Set so that questions query knows that it doesn't need to
    this.isCreatingNewQuestion = true;
    this._scriptureAudioPlayer?.pause();
    this.answersPanel?.questionComponent?.stopAudio();

    const data: QuestionDialogData = {
      questionDoc: undefined,
      projectDoc: this.projectDoc,
      textsByBookId: this.textsByBookId,
      projectId: this.projectDoc.id,
      defaultVerse: new VerseRef(this.book ?? 0, this.chapter ?? 1, 1),
      isRightToLeft: this.projectDoc.data?.isRightToLeft
    };
    const newQuestion: QuestionDoc | undefined = await this.questionDialogService.questionDialog(data);

    this.isCreatingNewQuestion = false;

    if (newQuestion != null) {
      this.activateQuestion(newQuestion, { withFilterReset: true });
    }
  }

  setQuestionFilter(filter: QuestionFilter): void {
    this.activeQuestionFilter = filter;
    this.updateVisibleQuestions();
  }

  setQuestionScope(scope: QuestionScope): void {
    if (scope !== this.activeQuestionScope) {
      this.navigateScope(scope);
    }
  }

  totalQuestions(): number {
    return this.questionDocs.length;
  }

  totalVisibleQuestions(): number {
    return this.visibleQuestions?.length ?? 0;
  }

  verseRefClicked(verseRef: VerseRef): void {
    if (this.questionsList == null) {
      return;
    }

    let bestMatch: QuestionDoc | undefined;

    for (const questionDoc of this.questionDocs) {
      const questionVerseRef = questionDoc.data == null ? undefined : toVerseRef(questionDoc.data.verseRef);
      if (questionVerseRef == null || questionVerseRef.bookNum !== this.book) {
        continue;
      }
      if (questionVerseRef.chapterNum === verseRef.chapterNum && questionVerseRef.verseNum === verseRef.verseNum) {
        bestMatch = questionDoc;
        break;
      } else if (
        questionVerseRef.chapterNum === verseRef.chapterNum &&
        questionVerseRef.verseNum <= verseRef.verseNum
      ) {
        const allVerses = questionVerseRef.allVerses(true);
        const endRef = allVerses[allVerses.length - 1];
        if (endRef.verseNum >= verseRef.verseNum) {
          bestMatch = questionDoc;
        }
      }
    }
    if (bestMatch != null) {
      this.questionsList.activateQuestion(bestMatch);
    }
  }

  async addAudioTimingData(): Promise<void> {
    if (this.projectDoc?.id == null || this.textsByBookId == null || this.questionsList == null) {
      return;
    }

    const dialogConfig: ChapterAudioDialogData = {
      projectId: this.projectDoc.id,
      textsByBookId: this.textsByBookId,
      questionsSorted: this.questionDocs,
      currentBook: this._book,
      currentChapter: this._chapter
    };
    await this.chapterAudioDialogService.openDialog(dialogConfig);
    this.updateAudioMissingWarning();
    this.calculateScriptureSliderPosition();
  }

  /**
   * Highlight segments based off of a base verse reference. If the reference is verse_1_3, this will
   * highlight verse_1_3, verse_1_3/p1, verse_1_3/p2, etc.
   */
  highlightSegments(segmentRef: string): void {
    if (!this.isAudioPlaying()) {
      return;
    }

    const verseStr: string | undefined = getVerseStrFromSegmentRef(segmentRef);
    if (verseStr != null) {
      const verseRef: VerseRef = new VerseRef(Canon.bookNumberToId(this.book!), this.chapter!.toString(), verseStr);
      this.scripturePanel!.activeVerse = verseRef;
    }
  }

  isAudioPlaying(): boolean {
    return this._scriptureAudioPlayer?.isPlaying ?? false;
  }

  hideChapterAudio(): void {
    this.toggleAudio(true);
  }

  toggleAudio(forceStopAndHide: boolean = false): void {
    this._scriptureAudioPlayer?.isPlaying || forceStopAndHide
      ? this._scriptureAudioPlayer?.stop()
      : this._scriptureAudioPlayer?.play();

    this.showScriptureAudioPlayer =
      this.hideChapterText || this._scriptureAudioPlayer?.isPlaying
        ? true
        : forceStopAndHide
          ? false
          : !this.showScriptureAudioPlayer;

    if (this.scripturePanel === undefined) return;

    if (this.showScriptureAudioPlayer) {
      this.scripturePanel.activeVerse = undefined;
    } else {
      this.scripturePanel.activeVerse = this.activeQuestionVerseRef;
    }
  }

  /**
   * Activate a question which should automatically navigate to the book/chapter
   */
  activateQuestion(questionDoc: QuestionDoc | undefined, { withFilterReset = false } = {}): void {
    if (questionDoc == null) {
      return;
    }

    if (withFilterReset) {
      this.resetFilter();
    }
    this.questionsList?.activateQuestion(questionDoc);
  }

  activatePreviousQuestion(): void {
    this.prevQuestion$.pipe(take(1)).subscribe(prevQuestion => {
      this.activateQuestion(prevQuestion);
    });
  }

  activateNextQuestion(): void {
    this.nextQuestion$.pipe(take(1)).subscribe(nextQuestion => {
      this.activateQuestion(nextQuestion);
    });
  }

  /**
   * Retrieves the adjacent question based on the active question and the direction.
   * Adjacent question might be outside the current scope but not the filter.
   * @param activeQuestion - The active question.
   * @param prevOrNext - The direction to search for the adjacent question.
   * @return The adjacent question.
   */
  private async getAdjacentQuestion(
    activeQuestion: QuestionDoc | undefined,
    prevOrNext: 'prev' | 'next'
  ): Promise<QuestionDoc | undefined> {
    if (this.visibleQuestions == null) {
      return undefined;
    }

    let relativeTo: Question | VerseRefData | undefined;
    let adjacentQuestionInScope: QuestionDoc | undefined;

    if (activeQuestion?.data != null) {
      relativeTo = activeQuestion.data;

      const activeQuestionIndex: number = this.visibleQuestions.findIndex(q => q.id === activeQuestion.id);

      // Check for adjacent question in current scope (book/chapter/all) for the current filter (use visible questions)
      if (activeQuestionIndex >= 0) {
        adjacentQuestionInScope = this.visibleQuestions[activeQuestionIndex + (prevOrNext === 'prev' ? -1 : 1)];
      }
    } else if (this.activeQuestionScope !== 'all') {
      // Get prev/next relative to current chapter if no active question.
      // This can happen if scope has no visible questions (taking question filter into account).
      relativeTo = {
        bookNum: this.book!,
        chapterNum: this.chapter ?? 1,
        verseNum: 1 // Can be anything since 'relativeTo' is only a verseRef if there are no questions in the chapter
      };
    }

    if (adjacentQuestionInScope != null) {
      return adjacentQuestionInScope;
    }

    let query: RealtimeQuery<QuestionDoc> | undefined;

    try {
      // If no adjacent question in current scope, get the adjacent question outside this scope
      query = await this.checkingQuestionsService.queryAdjacentQuestion(
        this.projectDoc!.id,
        relativeTo!,
        this.activeQuestionFilter,
        prevOrNext,
        this.destroyRef
      );

      return query.docs[0];
    } finally {
      query?.dispose();
    }
  }

  private updateQuestionRefs(): void {
    // Only pass in relevant verse references to the text component
    const questionVerseRefs: VerseRef[] = [];
    for (const questionDoc of this.visibleQuestions ?? []) {
      const questionVerseRef = questionDoc.data == null ? undefined : toVerseRef(questionDoc.data.verseRef);
      if (questionVerseRef != null && questionVerseRef.bookNum === this.book) {
        questionVerseRefs.push(questionVerseRef);
      }
    }
    this.questionVerseRefs = questionVerseRefs;
  }

  private updateVisibleQuestions(): void {
    if (!this.totalQuestions()) {
      this.visibleQuestions = [];
      this.totalVisibleQuestionsString = '0';
      this.updateQuestionRefs();
      this.refreshSummary();
      return;
    }

    let matchingQuestions: QuestionDoc[];

    // If there is no filter applied, clone the questions to trigger change detection in the questions component
    if (this.activeQuestionFilter === QuestionFilter.None) {
      matchingQuestions = this.questionDocs.slice();
    } else {
      const filterFunction = this.questionFilterFunctions[this.activeQuestionFilter];
      matchingQuestions = this.questionDocs.filter(q => (q.data == null ? false : filterFunction(q.getAnswers())));
    }

    this.visibleQuestions = matchingQuestions;

    if (this.totalQuestions() === this.totalVisibleQuestions()) {
      this.totalVisibleQuestionsString = this.totalQuestions().toString();
    } else {
      this.totalVisibleQuestionsString = `${this.totalVisibleQuestions()}/${this.totalQuestions()}`;
    }

    this.updateQuestionRefs();
    this.refreshSummary();
  }

  private updateAudioMissingWarning(): void {
    const texts: TextInfo[] | undefined = this.projectDoc?.data?.texts;
    if (this.questionDocs.length === 0 || texts == null) {
      return;
    }
    this.hasQuestionWithoutAudio = this.questionDocs.some(
      q =>
        q.data != null &&
        texts.find(
          t =>
            t.bookNum === q.data!.verseRef.bookNum &&
            t.chapters.find(c => c.number === q.data!.verseRef.chapterNum && c.hasAudio !== true) != null
        ) != null
    );
  }

  private getAnswerIndex(answer: Answer): number {
    if (this.questionsList == null) {
      return -1;
    }
    const activeQuestionDoc = this.questionsList.activeQuestionDoc;
    return activeQuestionDoc == null || activeQuestionDoc.data == null
      ? -1
      : activeQuestionDoc.data.answers.findIndex(existingAnswer => existingAnswer.dataId === answer.dataId);
  }

  private deleteAnswer(answer: Answer): void {
    if (this.questionsList == null) {
      return;
    }
    const activeQuestionDoc = this.questionsList.activeQuestionDoc;
    if (activeQuestionDoc == null) {
      return;
    }
    const answerIndex = this.getAnswerIndex(answer);
    if (answerIndex >= 0) {
      activeQuestionDoc
        .submitJson0Op(op => {
          op.set(q => q.answers[answerIndex].deleted, true);
        })
        .then(() => {
          if (this.projectDoc != null) {
            activeQuestionDoc.deleteFile(FileType.Audio, answer.dataId, answer.ownerRef);
          }
        });
      this.refreshSummary();
    }
  }

  private resetFilter(): void {
    this.setQuestionFilter(QuestionFilter.None);
  }

  /** Upload the attached audio and updates the url on the comment if one exists. */
  private async addAudioUrl(comment: Comment, audio: AudioAttachment, questionDoc?: QuestionDoc): Promise<boolean> {
    if (audio.fileName != null && audio.blob != null) {
      if (questionDoc != null) {
        // Get the amended filename and save it against the answer
        const urlResult = await questionDoc.uploadFile(FileType.Audio, comment.dataId, audio.blob, audio.fileName);
        if (urlResult == null) return false;
        comment.audioUrl = urlResult;
      }
    } else if (audio.status === 'reset') {
      comment.audioUrl = undefined;
    }
    return true;
  }

  private saveAnswer(answer: Answer, questionDoc: QuestionDoc | undefined): void {
    if (this.questionsList == null || questionDoc?.data == null) {
      return;
    }
    const answers = cloneDeep(questionDoc.data.answers);
    const answerIndex = this.getAnswerIndex(answer);
    if (answerIndex >= 0) {
      answers[answerIndex] = answer;
    } else {
      answers.unshift(answer);
    }
    if (answerIndex >= 0) {
      const oldAnswer = questionDoc.data.answers[answerIndex];
      const newAnswer = answers[answerIndex];
      const deleteAudio = oldAnswer.audioUrl != null && newAnswer.audioUrl == null;
      const submitPromise = questionDoc.submitJson0Op(op =>
        op
          .set(q => q.answers[answerIndex].text, newAnswer.text)
          .set(q => q.answers[answerIndex].scriptureText, newAnswer.scriptureText)
          .set(q => q.answers[answerIndex].verseRef, newAnswer.verseRef)
          .set(q => q.answers[answerIndex].selectionStartClipped, newAnswer.selectionStartClipped)
          .set(q => q.answers[answerIndex].selectionEndClipped, newAnswer.selectionEndClipped)
          .set(q => q.answers[answerIndex].audioUrl, newAnswer.audioUrl)
          .set(q => q.answers[answerIndex].status, newAnswer.status)
          .set(q => q.answers[answerIndex].dateModified, newAnswer.dateModified)
      );
      if (deleteAudio) {
        submitPromise.then(() => {
          if (this.projectDoc != null) {
            questionDoc.deleteFile(FileType.Audio, oldAnswer.dataId, oldAnswer.ownerRef);
          }
        });
      }
    } else {
      questionDoc.submitJson0Op(op => op.insert(q => q.answers, 0, answers[0]));
    }

    this.questionsList.updateElementsRead(questionDoc);
    this.refreshSummary();
  }

  private saveComment(answer: Answer, comment: Comment): void {
    if (this.questionsList == null) {
      return;
    }
    const activeQuestionDoc = this.questionsList.activeQuestionDoc;
    if (activeQuestionDoc == null || activeQuestionDoc.data == null) {
      return;
    }

    const answerIndex = this.getAnswerIndex(answer);
    const commentIndex = answer.comments.findIndex(c => c.dataId === comment.dataId);
    if (commentIndex >= 0) {
      const deleteAudio: boolean = answer.comments[commentIndex].audioUrl != null && answer.audioUrl == null;
      const submitPromise: Promise<boolean> = activeQuestionDoc.submitJson0Op(op =>
        op
          .set(q => q.answers[answerIndex].comments[commentIndex].text, comment.text)
          .set(q => q.answers[answerIndex].comments[commentIndex].audioUrl, comment.audioUrl)
          .set(q => q.answers[answerIndex].comments[commentIndex].dateModified, comment.dateModified)
      );
      if (deleteAudio) {
        submitPromise.then(() => activeQuestionDoc.deleteFile(FileType.Audio, comment.dataId, comment.ownerRef));
      }
    } else {
      activeQuestionDoc.submitJson0Op(op => op.insert(q => q.answers[answerIndex].comments, 0, comment));
    }
  }

  private deleteComment(answer: Answer, comment: Comment): void {
    if (this.questionsList == null) {
      return;
    }
    const activeQuestionDoc = this.questionsList.activeQuestionDoc;
    if (activeQuestionDoc == null || activeQuestionDoc.data == null) {
      return;
    }

    const answerIndex = this.getAnswerIndex(answer);
    const commentIndex = answer.comments.findIndex(c => c.dataId === comment.dataId);
    if (commentIndex >= 0) {
      activeQuestionDoc
        .submitJson0Op(op => op.set(q => q.answers[answerIndex].comments[commentIndex].deleted, true))
        .then(() => activeQuestionDoc.deleteFile(FileType.Audio, comment.dataId, comment.ownerRef));
    }
  }

  private likeAnswer(answer: Answer): void {
    if (this.questionsList == null) {
      return;
    }
    const activeQuestionDoc = this.questionsList.activeQuestionDoc;
    if (activeQuestionDoc == null || activeQuestionDoc.data == null) {
      return;
    }

    const currentUserId = this.userService.currentUserId;
    const likeIndex = answer.likes.findIndex(like => like.ownerRef === currentUserId);
    const answerIndex = this.getAnswerIndex(answer);

    if (likeIndex >= 0) {
      activeQuestionDoc.submitJson0Op(op => op.remove(q => q.answers[answerIndex].likes, likeIndex));
    } else {
      activeQuestionDoc.submitJson0Op(op =>
        op.insert(q => q.answers[answerIndex].likes, 0, {
          ownerRef: currentUserId
        })
      );
    }
  }

  private updateActiveQuestionVerseRef(questionDoc: QuestionDoc | undefined): void {
    // If the chapter has changed, stop the audio player. Book changes are handled elsewhere
    const hasActiveChapterChanged: boolean =
      this._activeQuestionVerseRef?.chapterNum !== questionDoc?.data?.verseRef.chapterNum;
    this._activeQuestionVerseRef = questionDoc?.data == null ? undefined : toVerseRef(questionDoc.data.verseRef);
    if (hasActiveChapterChanged && this.isAudioPlaying()) {
      this._scriptureAudioPlayer?.stop();
    }
  }

  /** Adjust the position of the splitter between Scripture text and answers. */
  // Group rapid-fire batches of these calls as one call
  private calculateScriptureSliderPosition = debounce(this._calculateScriptureSliderPosition, 50);
  private _calculateScriptureSliderPosition(maximizeAnswerPanel: boolean = false): void {
    // Wait while Angular updates visible DOM elements before we can calculate the height correctly.
    // 100 ms is a speculative value for waiting for elements to be loaded and updated in the DOM.
    const changeUpdateDelayMs: number = 100;
    setTimeout(() => {
      if (this.splitComponent == null || this.hideChapterText) {
        return;
      }
      let answerPanelHeight: number;
      if (maximizeAnswerPanel) {
        answerPanelHeight = Math.min(this.splitContainerElementHeight * 0.75, this.fullyExpandedAnswerPanelHeight);
      } else {
        answerPanelHeight = this.answerPanelElementMinimumHeight;
      }

      this.splitComponent.setVisibleAreaSizes([
        '*',
        this.showScriptureAudioPlayer ? this.scriptureAudioPlayerAreaHeight : answerPanelHeight
      ]);
    }, changeUpdateDelayMs);
  }

  // Unbind this component from the data when a user is removed from the project, otherwise console
  // errors appear before the app can navigate to the start component
  private onRemovedFromProject(): void {
    if (this.questionsList != null) {
      this.questionsList.activeQuestionDoc = undefined;
    }
    this.projectUserConfigDoc = undefined;
    if (this.questionsQuery != null) {
      this.questionsQuery.dispose();
    }
    this.questionsQuery = undefined;
    this.projectDoc = undefined;
  }

  private refreshSummary(): void {
    this.summary.answered = 0;
    this.summary.read = 0;
    this.summary.unread = 0;

    for (const questionDoc of this.visibleQuestions ?? []) {
      if (CheckingUtils.hasUserAnswered(questionDoc.data, this.userService.currentUserId)) {
        this.summary.answered++;
      } else if (
        this.projectUserConfigDoc != null &&
        CheckingUtils.hasUserReadQuestion(questionDoc.data, this.projectUserConfigDoc.data)
      ) {
        this.summary.read++;
      } else {
        this.summary.unread++;
      }
    }
  }

  private getCSSFloatPropertyOf(element: ElementRef | Element, propertyName: string): number {
    const elementStyle: CSSStyleDeclaration = getComputedStyle(
      element instanceof ElementRef ? element.nativeElement : element
    );
    return parseFloat(elementStyle.getPropertyValue(propertyName));
  }

  private getOffsetHeight(baseElement: ElementRef, selector: string): number {
    const element: HTMLElement | null = baseElement.nativeElement.querySelector(selector);
    return element == null ? 0 : element.offsetHeight;
  }

  /**
   * Report the needed height in px to fit contents without scrolling.
   * An element's `scrollHeight` may be taller than needed,
   * if the `clientHeight` of the scrollable area is already
   * taller than needed to fit the contents without
   * scrolling.
   */
  private getMinScrollHeight(baseElement: ElementRef, selector: string): number {
    const element = baseElement.nativeElement.querySelector(selector) as Element | null;
    if (element == null || element.firstElementChild == null || element.lastElementChild == null) {
      return 0;
    }

    return (
      element.lastElementChild!.getBoundingClientRect().bottom - element.firstElementChild!.getBoundingClientRect().top
    );
  }

  private initQuestionFilters(): void {
    if (this.projectDoc?.data == null) {
      return;
    }
    this.questionFilters.clear();
    this.questionFilters.set(QuestionFilter.None, 'question_filter_none');
    if (
      SF_PROJECT_RIGHTS.hasRight(
        this.projectDoc.data,
        this.userService.currentUserId,
        SFProjectDomain.AnswerStatus,
        Operation.Edit
      )
    ) {
      this.questionFilters
        .set(QuestionFilter.HasAnswers, 'question_filter_has_answers')
        .set(QuestionFilter.NoAnswers, 'question_filter_no_answers')
        .set(QuestionFilter.StatusExport, 'question_filter_exportable')
        .set(QuestionFilter.StatusResolved, 'question_filter_resolved')
        .set(QuestionFilter.StatusNone, 'question_filter_not_reviewed');
    } else {
      this.questionFilters
        .set(QuestionFilter.CurrentUserHasAnswered, 'question_filter_answered')
        .set(QuestionFilter.CurrentUserHasNotAnswered, 'question_filter_not_answered');
    }
  }

  private isInScope(verseRefData: VerseRefData | undefined): boolean {
    if (verseRefData == null || this.activeQuestionScope == null) {
      return false;
    }

    switch (this.activeQuestionScope) {
      case 'all':
        return true;
      case 'book':
        return this.book === verseRefData.bookNum;
      case 'chapter':
        return this.book === verseRefData.bookNum && this.chapter === verseRefData.chapterNum;
    }
  }

  /**
   * Determines a suggested navigation book/chapter using the following priority, constrained by route book if provided.
   * - From last user selected question
   * - From first question
   * - From first chapter
   * @param routeBookNum - The book number to enforce.
   * @returns The suggested navigation book/chapter.
   */
  private async getSuggestedNavBookChapter(routeBookNum?: number): Promise<BookChapter> {
    if (this.projectDoc?.data == null) {
      throw new Error('Project data is null');
    }

    const lastSelected: BookChapter | undefined =
      this.projectUserConfigDoc?.data?.selectedBookNum != null
        ? {
            bookNum: this.projectUserConfigDoc?.data?.selectedBookNum,
            chapterNum: this.projectUserConfigDoc?.data?.selectedChapterNum
          }
        : undefined;
    let suggestedBookChapter: BookChapter | undefined;

    // Suggest book/chapter from last user selected question
    if (lastSelected?.bookNum != null && lastSelected.chapterNum != null) {
      // If route book is provided, don't use stored question from a different book
      if (routeBookNum == null || routeBookNum === lastSelected.bookNum) {
        suggestedBookChapter = lastSelected;
      }
    }

    // Suggest book/chapter from first question (within route book if provided)
    if (suggestedBookChapter == null) {
      let query: RealtimeQuery<QuestionDoc> | undefined;
      try {
        query = await this.checkingQuestionsService.queryAdjacentQuestion(
          this.projectDoc!.id,
          {
            bookNum: routeBookNum ?? 1,
            chapterNum: 1,
            verseNum: 0
          },
          this.activeQuestionFilter,
          'next',
          this.destroyRef
        );

        const firstQuestionVerseRef: VerseRefData | undefined = query.docs[0]?.data?.verseRef;

        if (firstQuestionVerseRef != null) {
          // If route book is provided, don't use question from a different book
          if (routeBookNum == null || routeBookNum === firstQuestionVerseRef.bookNum) {
            suggestedBookChapter = {
              bookNum: firstQuestionVerseRef.bookNum,
              chapterNum: firstQuestionVerseRef.chapterNum
            };
          }
        }
      } finally {
        query?.dispose();
      }
    }

    // If still no suggested book/chapter, this means that there are either no questions
    // OR no questions within provided route book, so route to the first chapter of the project
    // or provided route book.
    if (suggestedBookChapter == null) {
      const texts: TextInfo[] = this.projectDoc!.data!.texts;
      const navBookNum: number = routeBookNum ?? this.books[0];
      const navChapterNum: number = texts.find(t => t.bookNum === navBookNum)!.chapters[0].number;

      suggestedBookChapter = {
        bookNum: navBookNum,
        chapterNum: navChapterNum
      };
    }

    return suggestedBookChapter;
  }

  /**
   * Navigate to the book/chapter of the specified question if necessary.
   * @param questionDoc The question with book/chapter to navigate to.
   * @returns Whether navigation is triggered.
   */
  private navigateQuestionChapter(questionDoc: QuestionDoc): boolean {
    const nextVerseRef: VerseRefData = questionDoc.data!.verseRef;

    if (nextVerseRef.chapterNum !== this.chapter || nextVerseRef.bookNum !== this.book) {
      // Store in order to set active question after navigation
      this.questionsList!.activeQuestionDoc = questionDoc;

      this.navigateBookChapter(
        this.projectDoc!.id,
        this.activeQuestionScope!,
        nextVerseRef.bookNum ?? 0,
        nextVerseRef.chapterNum ?? 1
      );

      return true;
    }

    return false;
  }

  private navigateBookChapter(
    projectId: string,
    scope: QuestionScope,
    book: number | undefined,
    chapter: number | undefined,
    navigationExtras?: NavigationBehaviorOptions | undefined
  ): void {
    const bookChapterPathTokens: string[] = [];

    if (book != null) {
      bookChapterPathTokens.push(Canon.bookNumberToId(book));

      if (chapter != null) {
        bookChapterPathTokens.push(chapter.toString());
      }
    }

    this.router.navigate(['projects', projectId, 'checking', ...bookChapterPathTokens], {
      ...navigationExtras,
      queryParams: { scope: scope },
      queryParamsHandling: 'merge'
    });
  }

  private navigateScope(scope: QuestionScope, navigationExtras?: NavigationBehaviorOptions | undefined): void {
    this.router.navigate([], {
      ...navigationExtras,
      relativeTo: this.activatedRoute,
      queryParams: { scope },
      queryParamsHandling: 'merge'
    });
  }

  private cleanup(): void {
    this.questionsSub?.unsubscribe();
    this.audioChangedSub?.unsubscribe();
    this.questionsRemoteChangesSub?.unsubscribe();
    this.questionsQuery?.dispose();
    this.textAudioQuery?.dispose();
    this.hideTextSub?.unsubscribe();
    this.textAudioSub?.unsubscribe();
  }
}
